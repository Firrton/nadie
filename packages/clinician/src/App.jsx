import { useEffect, useMemo, useRef, useState } from "react";
import { generateEncryptionKeyPair } from "@nadie/core";

import { parsePrivateKey } from "./application/clinician-service";
import SharedReading from "./ui/SharedReading";

/* Portal de la psicóloga.

   LENGUAJE: le habla a una psicóloga, no a quien construyó el sistema. Lo que
   necesita es saber quién le compartió algo, leerlo y hasta cuándo lo tiene.
   Red, direcciones y hashes no desaparecen: van a "Detalles técnicos".

   "Responder" no está a propósito: en la cadena queda solo el hash del texto y
   la respuesta no le llega a nadie. Mostrarlo haría creer que se respondió.
   El método reply() del servicio sigue existiendo. */

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const dayMonth = (seconds) => new Date(seconds * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
const fullDate = (seconds) => new Date(seconds * 1000).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const personCode = (address) => address.slice(2, 6).toUpperCase();
const toHex = (bytes) => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
const chainName = (chainId) => (chainId === 133 ? "HashKey testnet" : `Cadena ${chainId}`);

function safeMessage(error) {
  return error instanceof Error ? error.message : "No se pudo completar. Intenta de nuevo.";
}

function statusOf(consent, now) {
  if (consent.revoked) return { label: "Retirado por la persona", on: false };
  if (consent.expiresAt <= now) return { label: "Venció", on: false };
  if (!consent.isValid) return { label: "No disponible", on: false };
  if (consent.firstOpenedAt > 0) return { label: "Leído", on: true };
  return { label: "Nuevo", on: true };
}

export default function App({ service, chainId }) {
  const [account, setAccount] = useState();
  const [dashboard, setDashboard] = useState();
  const [privateKey, setPrivateKey] = useState();
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [generatedPublicKey, setGeneratedPublicKey] = useState();
  const [keySaved, setKeySaved] = useState(false);
  const [selected, setSelected] = useState();
  const [plaintext, setPlaintext] = useState();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const keyRef = useRef();
  const plaintextRef = useRef();

  const selectedConsent = useMemo(
    () => dashboard?.consents.find((consent) => consent.consentId === selected),
    [dashboard, selected],
  );

  const clearPlaintext = () => {
    if (plaintext) plaintext.fill(0);
    setPlaintext(undefined);
  };

  const clearKey = () => {
    if (privateKey) privateKey.fill(0);
    setPrivateKey(undefined);
    setGeneratedPublicKey(undefined);
    setKeySaved(false);
  };

  useEffect(() => {
    keyRef.current = privateKey;
  }, [privateKey]);

  useEffect(() => {
    plaintextRef.current = plaintext;
  }, [plaintext]);

  useEffect(() => () => {
    keyRef.current?.fill(0);
    plaintextRef.current?.fill(0);
  }, []);

  async function run(label, action) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (caught) {
      setError(safeMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function refresh(target = account) {
    if (!target) return;
    const next = await service.dashboard(target);
    setDashboard(next);
  }

  const connect = () => run("connect", async () => {
    clearPlaintext();
    const connected = await service.connect();
    if (account && account.toLowerCase() !== connected.toLowerCase()) clearKey();
    setAccount(connected);
    const next = await service.dashboard(connected);
    setDashboard(next);
  });

  const importKey = (event) => {
    event.preventDefault();
    run("key", async () => {
      clearKey();
      setPrivateKey(parsePrivateKey(privateKeyInput));
      setPrivateKeyInput("");
      setNotice("Tu llave de lectura está lista.");
    });
  };

  /* Crear la llave muestra la llave para GUARDARLA: si solo quedara en memoria,
     al recargar se perdería, y con ella todo lo que te compartan después. */
  const generateKey = () => run("generate", async () => {
    clearKey();
    const pair = await generateEncryptionKeyPair();
    setPrivateKey(pair.privateKey);
    setGeneratedPublicKey(pair.publicKey);
    setNotice("Creamos tu llave. Guárdala antes de registrarla.");
  });

  const copyKey = () => run("copy", async () => {
    if (!privateKey) return;
    await navigator.clipboard.writeText(toHex(privateKey));
    setNotice("Llave copiada. Pégala en un lugar seguro.");
  });

  const registerKey = () => run("register", async () => {
    if (!generatedPublicKey) throw new Error("Primero crea tu llave.");
    await service.registerEncryptionPublicKey(generatedPublicKey);
    setGeneratedPublicKey(undefined);
    setKeySaved(false);
    setNotice("Llave registrada. Falta que Nadie verifique tu matrícula.");
    await refresh();
  });

  const openAndRead = (consent) => run(`open:${consent.consentId}`, async () => {
    if (!privateKey) throw new Error("Primero usa tu llave de lectura.");
    clearPlaintext();
    setSelected(consent.consentId);
    const decrypted = await service.openAndDownload(consent, privateKey);
    setPlaintext(decrypted);
    setNotice("Listo. Solo se ve en este equipo; ciérralo cuando termines.");
    await refresh();
  });

  const decoded = plaintext ? new TextDecoder().decode(plaintext) : "";
  const credential = dashboard?.credential;
  const now = Math.floor(Date.now() / 1000);

  return (
    <main className="portal">
      <header className="portal-top">
        <div className="portal-brand">
          <span className="t-logo">nadie</span>
          <span className="t-small">Acceso profesional</span>
        </div>
        {account ? (
          <button className="n-btn n-btn--ghost n-btn--md" disabled={Boolean(busy)} onClick={() => run("refresh", refresh)}>
            Actualizar
          </button>
        ) : null}
      </header>

      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {notice ? <div className="notice" role="status">{notice}</div> : null}

      {!account ? (
        <section className="welcome">
          <h1 className="t-display">Lo que te compartieron, y nada más.</h1>
          <p className="t-body t-muted">
            Aquí lees lo que una persona decidió compartir contigo desde Nadie: un resumen de lo que habló y su diario de ánimo.
          </p>
          <button className="n-btn n-btn--primary n-btn--lg" disabled={Boolean(busy)} onClick={connect}>Entrar</button>
          <p className="t-micro">
            Tu billetera digital confirma que eres tú. Queda registro de cuándo lo leíste, y el acceso vence solo.
          </p>
        </section>
      ) : (
        <div className="portal-grid">
          <aside className="stack">
            <section className="n-card pad stack">
              <div className="row">
                <p className="t-micro">Tu perfil</p>
                <span className={`chip ${credential?.isVerified ? "chip--on" : "chip--off"}`}>
                  <span className="dot" />{credential?.isVerified ? "Verificada" : "Sin verificar"}
                </span>
              </div>
              <h2 className="t-title">{credential?.displayName || "Profesional"}</h2>
              {credential?.isVerified && credential.expiresAt > 0 ? (
                <p className="t-small">Verificación vigente hasta el {fullDate(credential.expiresAt)}</p>
              ) : null}
              {credential && !credential.isVerified ? (
                <p className="t-small">Tu matrícula todavía no está verificada. Hasta entonces, no pueden compartir contigo.</p>
              ) : null}
            </section>

            <section className="n-card pad stack">
              <div className="row">
                <p className="t-micro">Llave de lectura</p>
                <span className={`chip ${privateKey ? "chip--on" : "chip--off"}`}>
                  <span className="dot" />{privateKey ? "Lista" : "Falta"}
                </span>
              </div>

              {privateKey && !generatedPublicKey ? (
                <>
                  <p className="t-small">Lista para leer. Solo vive en esta pestaña: si recargas la página, vuelve a pegarla.</p>
                  <button className="n-btn n-btn--ghost n-btn--md" onClick={clearKey}>Olvidar llave</button>
                </>
              ) : null}

              {!privateKey ? (
                <form onSubmit={importKey} className="stack">
                  <label className="label" htmlFor="private-key">Pega tu llave de lectura</label>
                  <input
                    id="private-key"
                    className="n-field mono"
                    type="password"
                    autoComplete="off"
                    spellCheck="false"
                    value={privateKeyInput}
                    onChange={(event) => setPrivateKeyInput(event.target.value)}
                    placeholder="Tu llave"
                  />
                  <button className="n-btn n-btn--secondary n-btn--md" disabled={Boolean(busy) || !privateKeyInput.trim()}>
                    Usar esta llave
                  </button>
                  <p className="t-micro">No se guarda en ningún lado.</p>
                </form>
              ) : null}

              <details className="details" open={Boolean(generatedPublicKey)}>
                <summary>¿Todavía no tienes llave de lectura?</summary>
                {!generatedPublicKey ? (
                  <div className="stack details-body">
                    <p className="t-small">Se crea en este equipo. Después la registras para que te puedan compartir.</p>
                    <button className="n-btn n-btn--secondary n-btn--md" disabled={Boolean(busy)} onClick={generateKey}>Crear mi llave</button>
                  </div>
                ) : (
                  <div className="stack details-body">
                    <p className="t-small">
                      Guárdala en un lugar seguro, como tu gestor de contraseñas. Sin ella no vas a poder leer lo que te compartan, y nadie puede recuperarla.
                    </p>
                    <textarea className="key-box mono" readOnly rows="3" value={privateKey ? toHex(privateKey) : ""} aria-label="Tu llave de lectura" />
                    <button className="n-btn n-btn--ghost n-btn--md" disabled={Boolean(busy)} onClick={copyKey}>Copiar llave</button>
                    <label className="check">
                      <input type="checkbox" checked={keySaved} onChange={(event) => setKeySaved(event.target.checked)} />
                      <span className="t-small">Ya la guardé</span>
                    </label>
                    <button className="n-btn n-btn--primary n-btn--md" disabled={Boolean(busy) || !keySaved} onClick={registerKey}>
                      Registrar mi llave
                    </button>
                  </div>
                )}
              </details>
            </section>
          </aside>

          <section>
            <div className="section-head">
              <h1 className="t-title">Compartido contigo</h1>
              <span className="t-small">{dashboard?.consents.length ?? 0}</span>
            </div>

            {!dashboard?.consents.length ? (
              <div className="n-card empty">
                <p className="t-body">Todavía nadie compartió nada contigo.</p>
                <p className="t-small" style={{ marginTop: "var(--space-2)" }}>Cuando una persona te comparta algo desde Nadie, aparece aquí.</p>
              </div>
            ) : (
              <>
                {!privateKey ? <p className="t-small" style={{ marginBottom: "var(--space-3)" }}>Para leer, primero usa tu llave de lectura.</p> : null}
                <div className="consents">
                  {dashboard.consents.map((consent) => {
                    const status = statusOf(consent, now);
                    const available = consent.isValid && !consent.revoked && consent.expiresAt > now;
                    return (
                      <article
                        className="n-card consent"
                        key={consent.consentId}
                        aria-current={selected === consent.consentId ? "true" : undefined}
                      >
                        <div className="consent-body">
                          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                            <span className={`chip ${status.on ? "chip--on" : "chip--off"}`}><span className="dot" />{status.label}</span>
                            <span className="t-heading">Persona · código {personCode(consent.user)}</span>
                          </div>
                          <div className="consent-meta">
                            {available ? <span className="t-small">Disponible hasta el {dayMonth(consent.expiresAt)}</span> : null}
                            {consent.firstOpenedAt > 0 ? <span className="t-small">Leído el {dayMonth(consent.firstOpenedAt)}</span> : null}
                          </div>
                          <details className="details">
                            <summary>Detalles técnicos</summary>
                            <div className="details-body">
                              <p className="mono">Persona {consent.user}</p>
                              <p className="mono">Permiso {short(consent.consentId)}</p>
                              <p className="mono">Paquete cifrado {short(consent.packageHash)}</p>
                            </div>
                          </details>
                        </div>
                        {available ? (
                          <button
                            className="n-btn n-btn--primary n-btn--md"
                            disabled={Boolean(busy) || !privateKey}
                            onClick={() => openAndRead(consent)}
                          >
                            {consent.firstOpenedAt === 0 ? "Leer" : "Volver a leer"}
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {plaintext && selectedConsent ? <SharedReading text={decoded} onClear={clearPlaintext} /> : null}
          </section>
        </div>
      )}

      {account ? (
        <details className="details portal-foot">
          <summary>Detalles técnicos</summary>
          <div className="details-body">
            <p className="mono">Red: {chainName(chainId)} ({chainId})</p>
            <p className="mono">Tu cuenta: {account}</p>
            <p className="t-micro">
              Cada lectura queda registrada en la cadena. Lo compartido viaja cifrado y se descifra solo en este equipo, con tu llave de lectura.
            </p>
          </div>
        </details>
      ) : null}
    </main>
  );
}
