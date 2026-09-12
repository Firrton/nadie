#!/bin/bash
# Baja los pesos de un modelo de la ESCALERA para el banco de pruebas.
#
# POR QUÉ EXISTE: la caché del navegador NO se puede reanudar. Cuando la
# descarga se corta —y se corta: ERR_NETWORK_CHANGED— WebLLM vuelve a empezar de
# cero. `curl -C -` retoma desde el byte donde quedó.
#
# Uso:  ./banco/bajar-modelo.sh Llama-3.2-1B-Instruct-q4f16_1-MLC
#
# El nombre del .wasm NO se hardcodea acá: se le pregunta a modelos.js, que es la
# fuente de verdad de la escalera. Si alguien cambia un peldaño, este script lo
# sigue solo.
set -u

ID="${1:-}"
if [ -z "$ID" ]; then
  echo "falta el model_id. Los de la escalera:"
  node --input-type=module -e "
    const m = await import('$(cd "$(dirname "$0")/.." && pwd)/src/lib/llm/modelos.js');
    m.ESCALERA.forEach((x) => console.log('  ' + x.id + '  (' + x.peldano + ', ' + Math.round(x.vramMB) + ' MB)'));
  "
  exit 1
fi

AQUI="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${MODELOS_DIR:-$HOME/.cache/nadie-modelos}/$ID"
BASE="https://huggingface.co/mlc-ai/$ID/resolve/main"
LIBS="https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base"

LIB=$(node --input-type=module -e "
  const m = await import('$AQUI/src/lib/llm/modelos.js');
  const p = m.ESCALERA.find((x) => x.id === '$ID');
  if (!p) { console.error('no está en la escalera: $ID'); process.exit(1); }
  console.log(p.lib);
") || exit 1

mkdir -p "$DEST"
ARCHIVOS=$(curl -s "https://huggingface.co/api/models/mlc-ai/$ID" \
  | python3 -c "import json,sys; print('\n'.join(s['rfilename'] for s in json.load(sys.stdin)['siblings'] if s['rfilename'] not in ('.gitattributes','README.md')))")

echo "[$(date '+%H:%M:%S')] $ID: $(echo "$ARCHIVOS" | wc -l | tr -d ' ') archivos + el wasm -> $DEST"

completo() {
  local url="$1" destino="$2"
  local esperado actual
  esperado=$(curl -sIL "$url" | rg -i '^content-length:' | tail -1 | tr -dc '0-9')
  actual=$(stat -f%z "$destino" 2>/dev/null || echo 0)
  [ -n "$esperado" ] && [ "$actual" = "$esperado" ]
}

# Varias vueltas: si una se corta por red, la siguiente reanuda desde donde quedó.
for vuelta in $(seq 1 12); do
  faltan=0

  # El .wasm vive en OTRO repo (binary-mlc-llm-libs), no en el del modelo.
  # Se guarda como modelo.wasm, que es lo que espera appConfigLocal del banco.
  if ! completo "$LIBS/$LIB" "$DEST/modelo.wasm"; then
    faltan=$((faltan + 1))
    echo "[$(date '+%H:%M:%S')] v$vuelta modelo.wasm"
    curl -sL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$DEST/modelo.wasm" "$LIBS/$LIB"
  fi

  for f in $ARCHIVOS; do
    if completo "$BASE/$f" "$DEST/$f"; then continue; fi
    faltan=$((faltan + 1))
    echo "[$(date '+%H:%M:%S')] v$vuelta $f ($(stat -f%z "$DEST/$f" 2>/dev/null || echo 0) bytes)"
    curl -sL -C - --retry 10 --retry-delay 5 --retry-all-errors -o "$DEST/$f" "$BASE/$f"
  done

  if [ "$faltan" = "0" ]; then
    echo "[$(date '+%H:%M:%S')] $ID COMPLETO: $(du -sh "$DEST" | cut -f1)"
    exit 0
  fi
  echo "[$(date '+%H:%M:%S')] fin de vuelta $vuelta, faltaban $faltan"
done

echo "[$(date '+%H:%M:%S')] $ID: se agotaron las vueltas y todavía falta algo"
exit 1
