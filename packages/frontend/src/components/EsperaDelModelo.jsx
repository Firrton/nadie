import React, { useEffect, useState } from 'react';
import { COPY_ESPERA } from '../data/content.js';
import { fraseDeEspera, indiceInicial } from '../lib/llm/carga.js';

/* La espera de la primera carga del modelo.

   Ocupa el lugar del orbe en la pantalla principal, y NO bloquea la app: debajo
   sigue estando "tu semana" y se puede registrar el ánimo. Bajar los pesos tarda,
   y hacer esperar a alguien para que pueda anotar cómo se siente sería regalar la
   única parte que ya funciona.

   EL PORCENTAJE ES UN HECHO; EL TIEMPO, UNA PROMESA. Por eso el tiempo solo
   aparece cuando la medición se sostiene (ver carga.js): medimos el mismo día
   velocidades que iban de 37 KB/s a 3.4 MB/s, y un número que se cae a los dos
   minutos es peor que no decir nada. */

const CADA_MS = 12000;

function Frase({ intervalo = CADA_MS }) {
  const [i, setI] = useState(() => indiceInicial());

  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), intervalo);
    return () => clearInterval(id);
  }, [intervalo]);

  const frase = fraseDeEspera(i);
  if (!frase) return null;

  return (
    <figure style={{ margin: 0, maxWidth: 300, textAlign: 'center' }}>
      <blockquote className="t-body" style={{ margin: 0, textWrap: 'pretty', fontStyle: 'italic' }}>
        “{frase.texto}”
      </blockquote>
      <figcaption className="t-micro" style={{ marginTop: 'var(--space-3)' }}>{frase.autor}</figcaption>
    </figure>
  );
}

/* "unos X minutos" y no "4:32": el minuto exacto se desactualiza mientras se lee
   y convierte una estimación en una promesa. */
function enPalabras(segundos) {
  if (segundos == null) return null;
  if (segundos < 90) return 'menos de un minuto';
  return 'unos ' + Math.round(segundos / 60) + ' minutos';
}

export function EsperaDelModelo({ carga }) {
  if (!carga) return null;

  if (carga.estado === 'sin-soporte') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'center', padding: 'var(--space-6) 0' }}>
        <h2 className="t-title" style={{ margin: 0, maxWidth: 300 }}>{COPY_ESPERA.sinSoporte.titulo}</h2>
        <p className="t-small t-muted" style={{ margin: 0, maxWidth: 300, textWrap: 'pretty' }}>
          {COPY_ESPERA.sinSoporte.sub}
        </p>
      </div>
    );
  }

  const falta = enPalabras(carga.segundosRestantes);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-6) 0' }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 className="t-title" style={{ margin: 0 }}>{COPY_ESPERA.titulo}</h2>
        <p className="t-small t-muted" style={{ margin: 'var(--space-2) 0 0', maxWidth: 300, textWrap: 'pretty' }}>
          {COPY_ESPERA.sub}
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 300 }}>
        <div
          style={{ height: 3, borderRadius: 'var(--radius-full)', background: 'var(--surface-2)', overflow: 'hidden' }}
          role="progressbar"
          aria-valuenow={carga.porcentaje}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: carga.porcentaje + '%', height: '100%', background: 'var(--accent-a55)', transition: 'width var(--dur-2) var(--ease-out)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)' }}>
          <span className="t-micro">{carga.porcentaje}%</span>
          {/* Sin estimado no se escribe nada: el hueco es más honesto que un número inventado. */}
          {falta ? <span className="t-micro">{falta}</span> : null}
        </div>
      </div>

      <Frase />

      <p className="t-micro" style={{ margin: 0, textAlign: 'center' }}>{COPY_ESPERA.mientras}</p>
    </div>
  );
}
