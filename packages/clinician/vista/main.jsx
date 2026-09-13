import React from "react";
import ReactDOM from "react-dom/client";

import App from "../src/App";
import "../src/styles.css";

/* VISTA DE DISEÑO del portal, con datos de EJEMPLO.

   Existe para ver y ensayar la bandeja y la lectura sin wallet ni cadena (el
   navegador de desarrollo no tiene MetaMask). NO es el portal: no entra al
   build (Vite solo compila index.html) y la página lo dice arriba de todo.

   Se abre con `pnpm --filter @nadie/clinician dev` en /vista.html.
   Para ver la lectura: Conectar wallet → Generar un par nuevo → Abrir y descifrar. */

const ahora = Math.floor(Date.now() / 1000);
const DIA = 24 * 60 * 60;

/* Fecha LOCAL, igual que la app de la persona. toISOString() da la fecha en UTC
   y de noche en América corre el período un día. */
function isoHace(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/* Mismo formato que packages/frontend/src/lib/compartir/documento.js. */
const PUNTAJES = [3, 3, null, 3, 5, 3, null, 5, 5, 3, null, 5, 5, 5, null, 5, 7, null, 5, 7, 5, 7, null, 7, 7, 9, 7, 7];
const NOTAS = { 1: "hablé con mi hermana", 9: "no dormí bien", 20: "salí a caminar" };
const diario = PUNTAJES
  .map((puntaje, i) => ({ puntaje, dias: PUNTAJES.length - 1 - i }))
  .filter((d) => d.puntaje != null)
  .map((d) => `${isoHace(d.dias)}  ${d.puntaje}/10${NOTAS[d.dias] ? `  ${NOTAS[d.dias]}` : ""}`);

const DOCUMENTO = [
  "Semanas de mucho peso",
  `${isoHace(27)} a ${isoHace(0)}`,
  "",
  "Describe cansancio acumulado entre el trabajo y la casa.",
  "Siente que contarlo es molestar a los demás.",
  "Dice que ponerlo en palabras le ayudó a ordenarse.",
  "",
  "Diario de ánimo (1 a 10)",
  ...diario,
].join("\n");

const consents = [
  {
    consentId: `0x${"1a".repeat(32)}`,
    user: "0x8F3a0c2B7d41e9A56b0C1d2E3f4A5b6C7d8E9f01",
    professional: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    packageHash: `0x${"2b".repeat(32)}`,
    scope: `0x${"3c".repeat(32)}`,
    expiresAt: ahora + 6 * DIA,
    firstOpenedAt: 0,
    revoked: false,
    isValid: true,
    grantedBlock: 0n,
  },
  {
    consentId: `0x${"4d".repeat(32)}`,
    user: "0x2C1f9E8d7A6b5C4d3E2f1A0b9C8d7E6f5A4b3C21",
    professional: "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4",
    packageHash: `0x${"5e".repeat(32)}`,
    scope: `0x${"3c".repeat(32)}`,
    expiresAt: ahora - 2 * DIA,
    firstOpenedAt: ahora - 9 * DIA,
    revoked: true,
    isValid: false,
    grantedBlock: 0n,
  },
];

const servicioDeEjemplo = {
  async connect() {
    return "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4";
  },
  async dashboard() {
    return {
      credential: {
        publicKey: `0x${"6f".repeat(32)}`,
        displayName: "Psicóloga de ejemplo",
        status: 1,
        expiresAt: ahora + 300 * DIA,
        issuer: "0x0000000000000000000000000000000000000001",
        isVerified: true,
      },
      consents,
    };
  },
  async registerEncryptionPublicKey() {},
  async openAndDownload(consent) {
    consent.firstOpenedAt = consent.firstOpenedAt || ahora;
    return new TextEncoder().encode(DOCUMENTO);
  },
  async reply() {
    return { hash: `0x${"ab".repeat(32)}` };
  },
};

function Aviso() {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--surface-2)", color: "var(--text-1)", textAlign: "center", padding: "6px 12px", fontSize: "var(--text-micro-size)" }}>
      Vista de diseño con datos de ejemplo. No hay wallet, cadena ni personas reales.
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <Aviso />
    <App service={servicioDeEjemplo} chainId={133} />
  </>,
);
