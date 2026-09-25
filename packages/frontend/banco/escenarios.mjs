/* CORREDOR DE ESCENARIOS — herramienta de desarrollo, NO entra al producto.

   Corre los escenarios de research/model-evaluation/modes contra el runtime
   REAL: WebLLM en Chrome headless con WebGPU, los pesos q4f16_1 locales y el
   puerto de producción (prompt, modos y salvaguardas incluidos). Es la etapa
   de decisión del plan del 17-sep: Transformers en fp16 mide otro artefacto.

   Necesita dos servidores levantados en packages/frontend:
     pnpm run banco:modelos   (pesos en :8899)
     pnpm run banco           (vite en :5174)

   Uso:
     node banco/escenarios.mjs --etiqueta base --vueltas 3 \
       [--modelo Qwen2.5-1.5B-Instruct-q4f16_1-MLC] [--sin-thinking] \
       [--escenarios ../../research/model-evaluation/modes/scenarios.jsonl] \
       [--transcripciones ../../research/model-evaluation/modes/transcripts.json]

   Escribe research/model-evaluation/modes/runs/<etiqueta>.jsonl, una fila por
   respuesta. Solo usa texto sintético: nada de una persona real pasa por acá. */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { elegirModo } from '../src/lib/llm/modos.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const MODES = resolve(AQUI, '../../../research/model-evaluation/modes');

const { values: args } = parseArgs({
  options: {
    etiqueta: { type: 'string' },
    modelo: { type: 'string', default: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC' },
    vueltas: { type: 'string', default: '3' },
    /* La extracción arranca a temperatura 0: repetirla solo mide el reintento. */
    'vueltas-extraccion': { type: 'string' },
    escenarios: { type: 'string', default: resolve(MODES, 'scenarios.jsonl') },
    transcripciones: { type: 'string', default: resolve(MODES, 'transcripts.json') },
    'sin-thinking': { type: 'boolean', default: false },
    /* JSON que se mezcla en cada pedido al motor, p. ej. '{"top_p":0.8}'. */
    pedido: { type: 'string' },
    'solo-chat': { type: 'boolean', default: false },
    /* Para iterar rápido sobre un grupo; la comparación final va con todos. */
    grupos: { type: 'string' },
    url: { type: 'string', default: 'http://127.0.0.1:5174/banco.html' },
    /* Perfil persistente: un contexto efímero tiene cuota de incógnito y no le
       entran los ~1.1 GB de Qwen3.5-2B (QuotaExceededError). */
    perfil: { type: 'string', default: join(tmpdir(), 'nadie-banco-chrome') },
  },
});
if (!args.etiqueta) throw new Error('falta --etiqueta: nombra la variante que se mide');

const vueltas = Number(args.vueltas);
const salida = resolve(MODES, 'runs', args.etiqueta + '.jsonl');
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, '');

const huella = (texto) => createHash('sha256').update(texto).digest('hex').slice(0, 12);
const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: AQUI }).toString().trim();
const sucio = execFileSync('git', ['status', '--porcelain', '--', '../src/lib/llm', '../src/data'], { cwd: AQUI }).toString().trim() !== '';

/* El prompt que se midió queda identificado por su huella, no por memoria. */
const resumirPedidos = (pedidos) =>
  pedidos.map((p) => ({
    sistema: huella(p.mensajes[0]?.content ?? ''),
    sistema_inicio: (p.mensajes[0]?.content ?? '').slice(0, 60),
    turnos: p.mensajes.length,
    temperature: p.temperature,
    texto: p.texto,
    usage: p.usage,
    ms: p.ms,
  }));

const escribir = (fila) => appendFileSync(salida, JSON.stringify(fila) + '\n');

const base = {
  run: args.etiqueta,
  model: args.modelo,
  commit: commit + (sucio ? '+cambios' : ''),
  thinking: args['sin-thinking'] ? 'off' : 'default',
  pedido: args.pedido ?? null,
};

const navegador = await chromium.launchPersistentContext(args.perfil, {
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'],
});

try {
  const pagina = navegador.pages()[0] ?? (await navegador.newPage());
  pagina.on('pageerror', (e) => console.error('[página]', e.message));
  await pagina.goto(args.url);
  await pagina.waitForFunction(() => window.__capacidad !== undefined, null, { timeout: 60_000 });

  /* Sin esto, un fallback por software haría pasar por "medición" algo que
     tardó diez veces más y no se parece a lo que corre la persona. */
  const gpu = await pagina.evaluate(async () => {
    const adaptador = navigator.gpu && (await navigator.gpu.requestAdapter());
    if (!adaptador) return null;
    const { vendor, architecture, device, description } = adaptador.info;
    return { vendor, architecture, device, description, fallback: adaptador.info.isFallbackAdapter ?? null };
  });
  if (!gpu) throw new Error('Chrome headless no expone WebGPU: la medición no sería del runtime real');
  console.log('GPU:', JSON.stringify(gpu));

  const extra = {
    ...(args.pedido ? JSON.parse(args.pedido) : {}),
    ...(args['sin-thinking'] ? { extra_body: { enable_thinking: false } } : {}),
  };
  const carga = await pagina.evaluate(
    ([modelo, e]) => window.cargarModelo(modelo, { extra: Object.keys(e).length ? e : null }),
    [args.modelo, extra],
  );
  console.log('cargado en', carga.msCarga, 'ms');
  escribir({ ...base, tipo: 'carga', gpu, ms: carga.msCarga, created_at: new Date().toISOString() });

  const grupos = args.grupos ? args.grupos.split(',') : null;
  const escenarios = readFileSync(args.escenarios, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    .filter((e) => !grupos || grupos.includes(e.group));
  for (const escenario of escenarios) {
    for (let k = 1; k <= vueltas; k++) {
      const r = await pagina.evaluate((mensajes) => window.responder(mensajes), escenario.messages);
      escribir({
        ...base,
        tipo: 'chat',
        id: escenario.id,
        group: escenario.group,
        expected_mode: escenario.expected_mode,
        mode: elegirModo(escenario.messages),
        k,
        response: r.salida,
        error: r.error,
        ms: r.ms,
        attempts: resumirPedidos(r.pedidos),
        created_at: new Date().toISOString(),
      });
      process.stdout.write(r.error ? 'x' : '.');
    }
  }
  process.stdout.write('\n');

  if (!args['solo-chat']) {
    const transcripciones = JSON.parse(readFileSync(args.transcripciones, 'utf8'));
    for (const t of transcripciones) {
      for (const esquema of ['checkin', 'memory', 'share-summary']) {
        for (let k = 1; k <= Number(args['vueltas-extraccion'] ?? vueltas); k++) {
          const r = await pagina.evaluate(([mensajes, e]) => window.extraer(mensajes, e), [t.messages, esquema]);
          escribir({
            ...base,
            tipo: 'extraccion',
            id: t.id,
            schema: esquema,
            k,
            output: r.salida,
            error: r.error,
            ms: r.ms,
            attempts: resumirPedidos(r.pedidos),
            created_at: new Date().toISOString(),
          });
          process.stdout.write(r.error ? 'x' : '.');
        }
      }
    }
    process.stdout.write('\n');
  }
  console.log('listo:', salida);
} finally {
  await navegador.close();
}
