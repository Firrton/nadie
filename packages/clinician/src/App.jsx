import { useEffect, useMemo, useRef, useState } from "react";
import { generateEncryptionKeyPair } from "@nadie/core";

import { parsePrivateKey } from "./application/clinician-service";

const short = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
const date = (seconds) => (seconds === 0 ? "Not yet" : new Date(seconds * 1000).toLocaleString());

function safeMessage(error) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function statusOf(consent) {
  if (consent.revoked) return "Revoked";
  if (!consent.isValid) return "Unavailable";
  if (consent.firstOpenedAt > 0) return "Opened";
  return "Pending";
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
      setNotice("The X25519 private key is loaded in memory only.");
    });
  };

  const generateKey = () => run("generate", async () => {
    clearKey();
    const pair = await generateEncryptionKeyPair();
    setPrivateKey(pair.privateKey);
    setGeneratedPublicKey(pair.publicKey);
    setNotice("A new X25519 pair is loaded in memory. Register its public key before verification.");
  });

  const registerKey = () => run("register", async () => {
    if (!generatedPublicKey) throw new Error("Generate a key pair first.");
    await service.registerEncryptionPublicKey(generatedPublicKey);
    setNotice("Public key registered. A configured verifier must now issue the credential.");
    await refresh();
  });

  const openAndRead = (consent) => run(`open:${consent.consentId}`, async () => {
    if (!privateKey) throw new Error("Load the professional X25519 private key first.");
    clearPlaintext();
    setSelected(consent.consentId);
    const decrypted = await service.openAndDownload(consent, privateKey);
    setPlaintext(decrypted);
    setNotice("Package decrypted locally. Clear it when you finish reading.");
    await refresh();
  });

  const sendReply = (event) => {
    event.preventDefault();
    if (!selectedConsent) return;
    run("reply", async () => {
      const result = await service.reply(selectedConsent, reply);
      setReply("");
      setNotice(`Response hash confirmed on-chain: ${short(result.hash)}`);
      await refresh();
    });
  };

  const decoded = plaintext ? new TextDecoder().decode(plaintext) : "";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Nadie · Professional access</p>
          <h1>Consent inbox</h1>
        </div>
        <div className="wallet-block">
          <span className="chain">Chain {chainId}</span>
          {account ? <span className="address">{short(account)}</span> : null}
          <button className="button primary" disabled={Boolean(busy)} onClick={connect}>
            {account ? "Reconnect wallet" : "Connect wallet"}
          </button>
        </div>
      </header>

      {error ? <div className="alert error" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status">{notice}</div> : null}

      {!account ? (
        <section className="empty hero-card">
          <p className="eyebrow">Wallet identity</p>
          <h2>Connect the professional wallet</h2>
          <p>The EVM wallet proves professional identity. The separate X25519 key decrypts packages locally.</p>
        </section>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Credential</p>
                  <h2>{dashboard?.credential.displayName || "Not issued"}</h2>
                </div>
                <span className={`pill ${dashboard?.credential.isVerified ? "valid" : "invalid"}`}>
                  {dashboard?.credential.isVerified ? "Verified" : "Not verified"}
                </span>
              </div>
              {dashboard?.credential.expiresAt > 0 ? <p className="muted">Expires {date(dashboard.credential.expiresAt)}</p> : null}
              <button className="button secondary full" disabled={Boolean(busy)} onClick={() => run("refresh", refresh)}>
                Refresh on-chain state
              </button>
            </section>

            <section className="panel">
              <p className="eyebrow">Local decryption key</p>
              <h2>{privateKey ? "Key loaded" : "No key loaded"}</h2>
              {privateKey ? <p className="muted">Available only for this tab session.</p> : null}
              <form onSubmit={importKey} className="stack">
                <label htmlFor="private-key">Import existing X25519 private key</label>
                <input
                  id="private-key"
                  type="password"
                  autoComplete="off"
                  spellCheck="false"
                  value={privateKeyInput}
                  onChange={(event) => setPrivateKeyInput(event.target.value)}
                  placeholder="0x…"
                />
                <button className="button secondary" disabled={Boolean(busy)}>Load in memory</button>
              </form>
              <div className="key-actions">
                <button className="button quiet" disabled={Boolean(busy)} onClick={generateKey}>Generate new pair</button>
                <button className="button quiet" disabled={Boolean(busy) || !generatedPublicKey} onClick={registerKey}>Register public key</button>
                <button className="button danger" disabled={!privateKey} onClick={clearKey}>Forget local key</button>
              </div>
              <p className="warning">Private key material is never saved. Refreshing or closing this tab forgets it.</p>
            </section>
          </aside>

          <section className="content">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Granted events</p>
                <h2>Packages for this wallet</h2>
              </div>
              <span className="count">{dashboard?.consents.length ?? 0}</span>
            </div>

            {!dashboard?.consents.length ? (
              <div className="empty"><p>No consent grants found from the configured start block.</p></div>
            ) : (
              <div className="consent-list">
                {dashboard.consents.map((consent) => (
                  <article className={`consent-card ${selected === consent.consentId ? "selected" : ""}`} key={consent.consentId}>
                    <div className="consent-main">
                      <div>
                        <span className={`pill ${consent.isValid ? "valid" : "invalid"}`}>{statusOf(consent)}</span>
                        <h3>Patient {short(consent.user)}</h3>
                        <p className="mono">Consent {short(consent.consentId)} · Package {short(consent.packageHash)}</p>
                      </div>
                      <div className="dates">
                        <span>Expires <strong>{date(consent.expiresAt)}</strong></span>
                        <span>First opened <strong>{date(consent.firstOpenedAt)}</strong></span>
                      </div>
                    </div>
                    <button
                      className="button primary"
                      disabled={Boolean(busy) || !consent.isValid || !privateKey}
                      onClick={() => openAndRead(consent)}
                    >
                      {consent.firstOpenedAt === 0 ? "Open & decrypt" : "Decrypt again"}
                    </button>
                  </article>
                ))}
              </div>
            )}

            {plaintext && selectedConsent ? (
              <section className="decrypted-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Decrypted locally</p>
                    <h2>Shared summary</h2>
                  </div>
                  <button className="button danger" onClick={clearPlaintext}>Clear content</button>
                </div>
                <div className="plaintext">{decoded}</div>
                <form className="reply" onSubmit={sendReply}>
                  <label htmlFor="reply">Professional response</label>
                  <textarea
                    id="reply"
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Write a short follow-up…"
                    rows="4"
                  />
                  <p className="muted">Only the Keccak-256 hash is sent on-chain. The response text is not stored by Nadie.</p>
                  <button className="button primary" disabled={Boolean(busy)}>Confirm response hash</button>
                </form>
              </section>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
