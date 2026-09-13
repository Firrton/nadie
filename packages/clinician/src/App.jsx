import { useEffect, useMemo, useRef, useState } from "react";
import { generateEncryptionKeyPair } from "@nadie/core";

import { parsePrivateKey } from "./application/clinician-service";
import SharedReading from "./ui/SharedReading";

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const date = (seconds) => (seconds === 0
  ? "Todavía no"
  : new Date(seconds * 1000).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }));

const chainName = (chainId) => (chainId === 133 ? "HashKey testnet" : `Cadena ${chainId}`);

function safeMessage(error) {
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function statusOf(consent) {
  if (consent.revoked) return { label: "Revocado", on: false };
  if (!consent.isValid) return { label: "No disponible", on: false };
  if (consent.firstOpenedAt > 0) return { label: "Abierto", on: true };
  return { label: "Sin abrir", on: true };
}

export default function App({ service, chainId }) {
  const [account, setAccount] = useState();
  const [dashboard, setDashboard] = useState();
  const [privateKey, setPrivateKey] = useState();
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [generatedPublicKey, setGeneratedPublicKey] = useState();
  const [selected, setSelected] = useState();
  const [plaintext, setPlaintext] = useState();
  const [reply, setReply] = useState("");
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
      setNotice("La llave privada quedó cargada solo en esta pestaña.");
    });
  };

  const generateKey = () => run("generate", async () => {
    clearKey();
    const pair = await generateEncryptionKeyPair();
    setPrivateKey(pair.privateKey);
    setGeneratedPublicKey(pair.publicKey);
    setNotice("Se generó un par nuevo en memoria. Registra la llave pública antes de la verificación.");
  });

  const registerKey = () => run("register", async () => {
    if (!generatedPublicKey) throw new Error("Primero genera un par de llaves.");
    await service.registerEncryptionPublicKey(generatedPublicKey);
    setNotice("Llave pública registrada. Falta que un verificador emita tu credencial.");
    await refresh();
  });

  const openAndRead = (consent) => run(`open:${consent.consentId}`, async () => {
    if (!privateKey) throw new Error("Primero carga tu llave privada de descifrado.");
    clearPlaintext();
    setSelected(consent.consentId);
    const decrypted = await service.openAndDownload(consent, privateKey);
    setPlaintext(decrypted);
    setNotice("Descifrado en este equipo. Quítalo de la pantalla cuando termines de leer.");
    await refresh();
  });

  const sendReply = (event) => {
    event.preventDefault();
    if (!selectedConsent) return;
    run("reply", async () => {
      const result = await service.reply(selectedConsent, reply);
      setReply("");
      setNotice(`Respuesta confirmada en la cadena: ${short(result.hash)}`);
      await refresh();
    });
  };

  const decoded = plaintext ? new TextDecoder().decode(plaintext) : "";
  const credential = dashboard?.credential;

  return (
    <main className="portal">
      <header className="portal-top">
        <div className="portal-brand">
          <span className="t-logo">nadie</span>
          <span className="t-small">Acceso profesional</span>
        </div>
        <div className="portal-account">
          <span className="chip"><span className="dot" />{chainName(chainId)}</span>
          {account ? <span className="chip mono">{short(account)}</span> : null}
          <button className="n-btn n-btn--secondary n-btn--md" disabled={Boolean(busy)} onClick={connect}>
            {account ? "Reconectar wallet" : "Conectar wallet"}
          </button>
        </div>
      </header>

      {error ? <div className="notice notice--error" role="alert">{error}</div> : null}
      {notice ? <div className="notice" role="status">{notice}</div> : null}

      {!account ? (
        <section className="welcome">
          <h1 className="t-display">Lo que te compartieron, y nada más.</h1>
          <p className="t-body t-muted">
            Tu wallet prueba quién eres. Una llave aparte, que nunca sale de esta pestaña, descifra lo que una persona decidió compartir contigo.
          </p>
          <button className="n-btn n-btn--primary n-btn--lg" disabled={Boolean(busy)} onClick={connect}>Conectar wallet</button>
          <p className="t-micro">Cada apertura queda registrada en la cadena. La persona puede ver cuándo lo leíste y revocar el acceso.</p>
        </section>
      ) : (
        <div className="portal-grid">
          <aside className="stack">
            <section className="n-card pad stack">
              <div className="row">
                <p className="t-micro">Credencial</p>
                <span className={`chip ${credential?.isVerified ? "chip--on" : "chip--off"}`}>
                  <span className="dot" />{credential?.isVerified ? "Verificada" : "Sin verificar"}
                </span>
              </div>
              <h2 className="t-title">{credential?.displayName || "Sin emitir"}</h2>
              {credential?.expiresAt > 0 ? <p className="t-small">Vence el {date(credential.expiresAt)}</p> : null}
              <button className="n-btn n-btn--ghost n-btn--md" disabled={Boolean(busy)} onClick={() => run("refresh", refresh)}>
                Actualizar desde la cadena
              </button>
            </section>

            <section className="n-card pad stack">
              <div className="row">
                <p className="t-micro">Llave de descifrado</p>
                <span className={`chip ${privateKey ? "chip--on" : "chip--off"}`}>
                  <span className="dot" />{privateKey ? "Cargada" : "Sin cargar"}
                </span>
              </div>
              <form onSubmit={importKey} className="stack">
                <label className="label" htmlFor="private-key">Llave privada X25519</label>
                <input
                  id="private-key"
                  className="n-field mono"
                  type="password"
                  autoComplete="off"
                  spellCheck="false"
                  value={privateKeyInput}
                  onChange={(event) => setPrivateKeyInput(event.target.value)}
                  placeholder="0x…"
                />
                <button className="n-btn n-btn--secondary n-btn--md" disabled={Boolean(busy)}>Cargar en esta pestaña</button>
              </form>
              <div className="stack">
                <button className="n-btn n-btn--ghost n-btn--md" disabled={Boolean(busy)} onClick={generateKey}>Generar un par nuevo</button>
                <button className="n-btn n-btn--ghost n-btn--md" disabled={Boolean(busy) || !generatedPublicKey} onClick={registerKey}>Registrar llave pública</button>
                <button className="n-btn n-btn--ghost n-btn--md" disabled={!privateKey} onClick={clearKey}>Olvidar la llave</button>
              </div>
              <p className="t-micro">La llave privada nunca se guarda. Al recargar o cerrar la pestaña, se olvida.</p>
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
                <p className="t-small" style={{ marginTop: "var(--space-2)" }}>Cuando una persona firme un permiso a tu nombre, aparece acá.</p>
              </div>
            ) : (
              <div className="consents">
                {dashboard.consents.map((consent) => {
                  const status = statusOf(consent);
                  return (
                    <article
                      className="n-card consent"
                      key={consent.consentId}
                      aria-current={selected === consent.consentId ? "true" : undefined}
                    >
                      <div>
                        <div className="row" style={{ justifyContent: "flex-start" }}>
                          <span className={`chip ${status.on ? "chip--on" : "chip--off"}`}><span className="dot" />{status.label}</span>
                          <span className="t-heading">Persona {short(consent.user)}</span>
                        </div>
                        <div className="consent-meta">
                          <span className="t-small">Vence: {date(consent.expiresAt)}</span>
                          <span className="t-small">Primera apertura: {date(consent.firstOpenedAt)}</span>
                        </div>
                        <p className="mono" style={{ margin: "var(--space-2) 0 0" }}>
                          Permiso {short(consent.consentId)} · Paquete {short(consent.packageHash)}
                        </p>
                      </div>
                      <button
                        className="n-btn n-btn--primary n-btn--md"
                        disabled={Boolean(busy) || !consent.isValid || !privateKey}
                        onClick={() => openAndRead(consent)}
                      >
                        {consent.firstOpenedAt === 0 ? "Abrir y descifrar" : "Descifrar de nuevo"}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            {plaintext && selectedConsent ? (
              <>
                <SharedReading text={decoded} onClear={clearPlaintext} />
                <form className="n-card pad stack reply" onSubmit={sendReply}>
                  <label className="t-heading" htmlFor="reply">Responder</label>
                  <textarea
                    id="reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Un seguimiento breve…"
                    rows="4"
                  />
                  <p className="t-micro">En la cadena queda solo el hash Keccak-256 de tu respuesta. Nadie no guarda el texto.</p>
                  <button className="n-btn n-btn--secondary n-btn--md" disabled={Boolean(busy)}>Confirmar respuesta</button>
                </form>
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
