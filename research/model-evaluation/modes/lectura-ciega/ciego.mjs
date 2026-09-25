// Arma una lectura ciega: mezcla respuestas de varias corridas y esconde la variante.
// Uso: node ciego.mjs <salida-dir> <escenarios.jsonl> <corrida.jsonl>...
// Escribe ciego-<familia>.json (lo que ven los jueces) y clave.json (lo que no ven).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [dir, escenariosPath, ...corridas] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const escenarios = Object.fromEntries(
  readFileSync(escenariosPath, 'utf8').trim().split('\n').map(JSON.parse).map((e) => [e.id, e]),
);
const h = (s) => createHash('sha256').update(s).digest('hex');
const items = [];
const clave = {};
for (const c of corridas) {
  const run = basename(c, '.jsonl');
  for (const f of readFileSync(c, 'utf8').trim().split('\n').map(JSON.parse)) {
    if (f.tipo !== 'chat') continue;
    const item = 'r' + h(run + f.id + f.k).slice(0, 8);
    clave[item] = { run, id: f.id, k: f.k, group: f.group };
    // El bloque <think> delataría a la familia Qwen3: no es parte de lo que se juzga.
    const response = (f.response ?? '(sin respuesta)').replace(/<think>[\s\S]*?<\/think>\s*/g, '');
    // Para el juez, las indirectas nuevas son indirectas.
    const group = f.group.startsWith('indirecta') ? 'indirecta' : f.group;
    items.push({ item, group, conversation: escenarios[f.id].messages, response });
  }
}
items.sort((a, b) => (h('orden' + a.item) < h('orden' + b.item) ? -1 : 1));

const FAMILIAS = { a: ['escuchar', 'negativa', 'hiperbole'], b: ['pensar', 'limite'], c: ['crisis', 'indirecta'] };
const TOPE = 110; // cuántos ítems lee un juez de una vez
for (const [fam, grupos] of Object.entries(FAMILIAS)) {
  const parte = items.filter((x) => grupos.includes(x.group));
  const trozos = Math.ceil(parte.length / TOPE);
  for (let i = 0; i < trozos; i++) {
    const nombre = trozos > 1 ? `${fam}${i + 1}` : fam;
    const trozo = parte.filter((_, j) => j % trozos === i);
    writeFileSync(`${dir}/ciego-${nombre}.json`, JSON.stringify(trozo, null, 1));
    console.log(nombre, trozo.length);
  }
}
writeFileSync(`${dir}/clave.json`, JSON.stringify(clave));
console.log(items.length, 'items');
