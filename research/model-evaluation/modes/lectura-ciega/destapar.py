"""Destapa una lectura ciega: une los juicios con la clave y resume por corrida y grupo.

Uso: python3 destapar.py <dir>
Lee <dir>/clave.json y todos los <dir>/juicio-<familia>-<juez>.json (o juicio-<familia>.json).
Con dos jueces por ítem, un ítem cuenta como ok / grave si AMBOS jueces lo dicen (criterio
conservador) y se reporta el acuerdo entre jueces (kappa de Cohen).
"""
import collections
import glob
import json
import os
import sys

d = sys.argv[1]
clave = json.load(open(os.path.join(d, 'clave.json')))
por_item = collections.defaultdict(list)
for ruta in sorted(glob.glob(os.path.join(d, 'juicio-*.json'))):
    for j in json.load(open(ruta)):
        por_item[j['item']].append(j)

filas = []
for item, js in por_item.items():
    c = clave[item]
    filas.append({
        **c,
        'ok': all(j['ok'] for j in js),
        'grave': all(j['grave'] for j in js),
        'calidad': sum(j['calidad'] for j in js) / len(js),
        'jueces': js,
    })


def kappa(pares):
    n = len(pares)
    if not n:
        return None
    acuerdo = sum(a == b for a, b in pares) / n
    pa = sum(a for a, _ in pares) / n
    pb = sum(b for _, b in pares) / n
    azar = pa * pb + (1 - pa) * (1 - pb)
    return (acuerdo - azar) / (1 - azar) if azar < 1 else 1.0


dobles = [f['jueces'] for f in filas if len(f['jueces']) == 2]
if dobles:
    k_ok = kappa([(a['ok'], b['ok']) for a, b in dobles])
    k_grave = kappa([(a['grave'], b['grave']) for a, b in dobles])
    print(f'Acuerdo entre jueces sobre {len(dobles)} ítems: kappa ok = {k_ok:.2f}, kappa grave = {k_grave:.2f}\n')

runs = sorted({f['run'] for f in filas}, key=lambda r: (not r.startswith('base'), r))
grupos = ['escuchar', 'negativa', 'hiperbole', 'pensar', 'limite', 'crisis', 'indirecta', 'indirecta-nueva', 'indirecta-v2']
print('| grupo | ' + ' | '.join(runs) + ' |')
print('|---|' + '---|' * len(runs))
for g in grupos:
    celdas = []
    for r in runs:
        xs = [f for f in filas if f['run'] == r and f['group'] == g]
        if not xs:
            celdas.append('—')
            continue
        ok = sum(f['ok'] for f in xs)
        grave = sum(f['grave'] for f in xs)
        q = sum(f['calidad'] for f in xs) / len(xs)
        celdas.append(f'ok {ok}/{len(xs)} · graves {grave} · q {q:.1f}')
    if any(c != '—' for c in celdas):
        print(f'| {g} | ' + ' | '.join(celdas) + ' |')
comunes = [g for g in grupos if g not in ('indirecta-nueva', 'indirecta-v2')]
tot = []
for r in runs:
    xs = [f for f in filas if f['run'] == r and f['group'] in comunes]
    tot.append(f"ok {sum(f['ok'] for f in xs)}/{len(xs)} · graves {sum(f['grave'] for f in xs)} · q {sum(f['calidad'] for f in xs) / len(xs):.2f}")
print('| **total (sin indirecta-nueva)** | ' + ' | '.join(tot) + ' |')
