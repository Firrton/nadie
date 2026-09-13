import React from "react";
import ReactDOM from "react-dom/client";

import { HttpGatewayAdapter } from "./adapters/http-gateway";
import { ViemChainAdapter } from "./adapters/viem-chain";
import { ClinicianService } from "./application/clinician-service";
import App from "./App";
import { loadClinicianConfig } from "./config";
import "./styles.css";

function ConfigurationError({ message }) {
  return (
    <main className="portal">
      <section className="welcome">
        <span className="t-logo">nadie</span>
        <h1 className="t-title">Falta configurar el portal</h1>
        <p className="t-body t-muted">{message}</p>
        <p className="t-small">
          Copia <code>.env.example</code> a <code>.env.local</code> y completa las direcciones del despliegue.
        </p>
      </section>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));

try {
  const config = loadClinicianConfig(import.meta.env);
  const chain = new ViemChainAdapter(config, window.ethereum);
  const gateway = new HttpGatewayAdapter(config.gatewayUrl);
  root.render(<App service={new ClinicianService(chain, gateway)} chainId={config.chainId} />);
} catch (error) {
  const message = error instanceof Error ? error.message : "La configuración del portal no es válida.";
  root.render(<ConfigurationError message={message} />);
}
