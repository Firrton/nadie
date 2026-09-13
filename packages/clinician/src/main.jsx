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
    <main className="configuration-error">
      <p className="eyebrow">Professional portal</p>
      <h1>Configuration required</h1>
      <p>{message}</p>
      <p>Copy <code>.env.example</code> to <code>.env.local</code> and set the local deployment addresses.</p>
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
  const message = error instanceof Error ? error.message : "The portal configuration is invalid.";
  root.render(<ConfigurationError message={message} />);
}
