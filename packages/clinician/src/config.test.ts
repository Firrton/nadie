import { describe, expect, it } from "vitest";

import { loadClinicianConfig } from "./config";

const valid = {
  VITE_CHAIN_ID: "133",
  VITE_RPC_URL: "http://127.0.0.1:8545",
  VITE_GATEWAY_URL: "/api/gateway",
  VITE_CONSENT_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001",
  VITE_PROFESSIONAL_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000002",
  VITE_GRANTED_FROM_BLOCK: "0",
};

describe("loadClinicianConfig", () => {
  it("selects known values and ignores normal extra environment variables", () => {
    const config = loadClinicianConfig({ ...valid, PATH: "/usr/bin", HOME: "/tmp/demo" });
    expect(config.chainId).toBe(133);
    expect(config.grantedFromBlock).toBe(0n);
    expect(config.gatewayUrl).toBe("/api/gateway");
  });

  it("fails closed when a contract address is missing", () => {
    expect(() => loadClinicianConfig({ ...valid, VITE_CONSENT_REGISTRY_ADDRESS: "" })).toThrow(
      "Missing required configuration: VITE_CONSENT_REGISTRY_ADDRESS",
    );
  });

  it("rejects malformed chain and block configuration", () => {
    expect(() => loadClinicianConfig({ ...valid, VITE_CHAIN_ID: "133x" })).toThrow(
      "Invalid numeric configuration: VITE_CHAIN_ID",
    );
    expect(() => loadClinicianConfig({ ...valid, VITE_GRANTED_FROM_BLOCK: "-1" })).toThrow(
      "Invalid numeric configuration: VITE_GRANTED_FROM_BLOCK",
    );
    expect(() => loadClinicianConfig({ ...valid, VITE_RPC_URL: "/rpc" })).toThrow(
      "Invalid URL configuration: VITE_RPC_URL",
    );
  });
});
