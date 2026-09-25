import { readFileSync } from 'node:fs';
import { normalizar } from '/Users/firrton/Desktop/Nadie/.claude/worktrees/proyecto-shenzhen-audit-0fc6c2/packages/frontend/src/lib/llm/salvaguardas.js';
const esc = Object.fromEntries(readFileSync('research/model-evaluation/modes/scenarios.jsonl','utf8').trim().split('\n').map(JSON.parse).map(e=>[e.id,e]));
const palabras = (t) => normalizar(t).replace(/[^a-z0-9ñ ]/g,' ').split(/\s+/).filter(Boolean);
for (const f of process.argv.slice(2)) {
  const filas = readFileSync(f,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.tipo==='chat' && ['escuchar','negativa','hiperbole'].includes(r.group));
  let eco = 0, primera = 0;
  for (const r of filas) {
    const t = (r.response||'').replace(/<think>[\s\S]*?<\/think>\s*/g,'');
    const p1 = palabras(t.split(/(?<=[.!?])\s+/)[0]||'');
    const ultimo = [...esc[r.id].messages].reverse().find(m=>m.role==='user').content;
    const u = palabras(ultimo).join(' ');
    let hay = false;
    for (let i=0;i+5<=p1.length;i++) if (u.includes(p1.slice(i,i+5).join(' '))) { hay = true; break; }
    if (hay) eco++;
    // primera persona al inicio: verbo en 1a persona que la persona usó
    if (/^(termine|reprobe|llevo|se murio mi|me mude|estoy|tengo|mi |me )/.test(p1.join(' '))) primera++;
  }
  console.log(f.split('/').pop(), 'n', filas.length, 'eco>=5 palabras', eco, 'arranca en 1a persona', primera);
}
