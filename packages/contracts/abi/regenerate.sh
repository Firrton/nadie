#!/usr/bin/env bash
# Regenera las ABIs canónicas de ambos contratos con forge inspect --json.
# Uso: ./abi/regenerate.sh   (desde packages/contracts)
# Reproducible: mismo código fuente produce la misma ABI.
set -euo pipefail

cd "$(dirname "$0")/.."

for contract in ProfessionalRegistry ConsentRegistry; do
  forge inspect "$contract" abi --json > "abi/${contract}.json"
  # Valida que el archivo producido es JSON parseable y no vacío.
  python3 - "$contract" <<'PYEOF'
import json, sys
name = sys.argv[1]
with open(f"abi/{name}.json") as f:
    abi = json.load(f)
assert isinstance(abi, list) and len(abi) > 0, f"ABI vacía: {name}"
print(f"abi/{name}.json OK ({len(abi)} entradas)")
PYEOF
done
