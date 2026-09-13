import React from 'react';
import { VoiceOrb } from '../components/VoiceOrb.jsx';

/* Compartir con la psicóloga.

   La persona ve EXACTAMENTE el texto que va a viajar, y nada sale hasta que
   toca "Firmar y enviar". "Enviado" se dice cuando la red lo confirma. */

const PASOS = {
  verificando: 'Confirmando que su credencial está vigente',
  cifrando: 'Cifrando en este teléfono',
  subiendo: 'Subiendo el paquete cifrado',
  firmando: 'Firmando tu permiso',
  publicando: 'Registrando el permiso en HashKey',
  confirmando: 'Esperando la confirmación de la red',
  listo: 'Listo',
};

function Encabezado({ titulo, texto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'var(--space-8) 0 var(--space-6)' }}>
      <VoiceOrb size={64} />
      <h1 className="t-title" style={{ marginTop: 'var(--space-5)' }}>{titulo}</h1>
      {texto ? (
        <p className="t-body t-muted" style={{ marginTop: 'var(--space-3)', maxWidth: 300, textWrap: 'pretty' }}>{texto}</p>
      ) : null}
    </div>
  );
}

export default function Compartir({ compartir, onHome, onBack }) {
  const { estado, documento, paso, resultado, explorerUrl, preparar, enviar } = compartir;

  let cuerpo = null;
  let acciones = null;

  if (estado === 'preparando') {
    cuerpo = <Encabezado titulo="Armando un resumen" texto="Se hace en este teléfono. Todavía no sale nada." />;
  } else if (estado === 'borrador') {
    cuerpo = (
      <>
        {/* NO decir "la conversación no sale": el modelo puede citar frases
            textuales en el resumen, y entonces esa promesa sería falsa. Lo que
            sí es cierto siempre es que sale exactamente este texto. */}
        <Encabezado titulo="Esto es lo que va a leer" texto="Solo sale este texto. Léelo antes de enviarlo." />
        <div className="n-card" style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <p className="t-body" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{documento}</p>
        </div>
      </>
    );
    acciones = (
      <>
        <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={enviar}>Firmar y enviar</button>
        <button type="button" className="n-btn n-btn--ghost n-btn--md n-btn--full" onClick={onBack}>Ahora no</button>
      </>
    );
  } else if (estado === 'enviando') {
    cuerpo = <Encabezado titulo="Enviando" texto={PASOS[paso] || 'Preparando'} />;
  } else if (estado === 'listo') {
    cuerpo = (
      <>
        <Encabezado titulo="Enviado" texto="Está cifrado. Solo ella puede abrirlo, y el permiso quedó registrado." />
        <div className="n-card" style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span className="t-small">Tu permiso</span>
          <a
            className="t-micro"
            href={explorerUrl + '/tx/' + resultado.transactionHash}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--text-1)', overflowWrap: 'anywhere' }}
          >
            {resultado.transactionHash}
          </a>
        </div>
      </>
    );
    acciones = <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={onHome}>Volver al inicio</button>;
  } else if (estado === 'error') {
    cuerpo = <Encabezado titulo="No se pudo enviar" texto="Sin tu permiso registrado, nadie puede abrir nada." />;
    acciones = (
      <>
        <button type="button" className="n-btn n-btn--primary n-btn--lg n-btn--full" onClick={documento ? enviar : preparar}>Intentar de nuevo</button>
        <button type="button" className="n-btn n-btn--ghost n-btn--md n-btn--full" onClick={onBack}>Volver</button>
      </>
    );
  }

  return (
    <div className="anim-fade-up" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '0 var(--screen-pad)' }}>
        {cuerpo}
      </div>
      {acciones ? (
        <div style={{ flex: 'none', padding: 'var(--space-4) var(--screen-pad) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {acciones}
        </div>
      ) : null}
    </div>
  );
}
