import { readFileSync } from 'node:fs';
import { normalizar } from '/Users/firrton/Desktop/Nadie/.claude/worktrees/proyecto-shenzhen-audit-0fc6c2/packages/frontend/src/lib/llm/salvaguardas.js';
for (const f of process.argv.slice(2)) {
  const filas = readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse)
    .filter((r) => r.tipo === 'chat' && ['escuchar', 'negativa', 'hiperbole'].includes(r.group));
  const c = { n: filas.length, refleja: 0, una: 0, dos_mas: 0, cero: 0, salvo: 0, oraciones: [] };
  for (const r of filas) {
    const t = r.response || '';
    const q = (t.match(/\?/g) || []).length;
    if (!(t.trim().split(/(?<=[.!?])\s+/)[0] || '').trim().endsWith('?')) c.refleja++;
    if (q === 1) c.una++; else if (q === 0) c.cero++; else c.dos_mas++;
    if (/\b(a salvo|segur[oa])\b/.test(normalizar(t))) c.salvo++;
    c.oraciones.push(t.split(/(?<=[.!?])\s+/).filter(Boolean).length);
  }
  c.oraciones = (c.oraciones.reduce((a, b) => a + b, 0) / c.oraciones.length).toFixed(1);
  console.log(f.split('/').pop(), JSON.stringify(c));
}
