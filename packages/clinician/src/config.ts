import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

export interface ClinicianConfig {
  chainId: number;
  rpcUrl: string;
  gatewayUrl: string;
  consentRegistryAddress: Address;
  professionalRegistryAddress: Address;
  grantedFromBlock: bigint;
}

type Environment = Record<string, string | boolean | undefined>;

function required(env: Environment, name: string): string {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required configuration: ${name}`);
  }
  return value.trim();
}

function address(env: Environment, name: string): Address {
  const value = required(env, name);
  if (!isAddress(value)) throw new Error(`Invalid address configuration: ${name}`);
  return getAddress(value);
}

function absoluteUrl(env: Environment, name: string): string {
  const value = required(env, name).replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL configuration: ${name}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid URL configuration: ${name}`);
  }
  return value;
}

function urlOrPath(env: Environment, name: string): string {
  const value = required(env, name).replace(/\/$/, "");
  return value.startsWith("/") ? value : absoluteUrl(env, name);
}

export function loadClinicianConfig(env: Environment): ClinicianConfig {
  const chainId = Number(required(env, "VITE_CHAIN_ID"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("Invalid numeric configuration: VITE_CHAIN_ID");
  }

  const grantedFromBlockRaw = required(env, "VITE_GRANTED_FROM_BLOCK");
  if (!/^\d+$/.test(grantedFromBlockRaw)) {
    throw new Error("Invalid numeric configuration: VITE_GRANTED_FROM_BLOCK");
  }

  return {
    chainId,
    rpcUrl: absoluteUrl(env, "VITE_RPC_URL"),
    gatewayUrl: urlOrPath(env, "VITE_GATEWAY_URL"),
    consentRegistryAddress: address(env, "VITE_CONSENT_REGISTRY_ADDRESS"),
    professionalRegistryAddress: address(env, "VITE_PROFESSIONAL_REGISTRY_ADDRESS"),
    grantedFromBlock: BigInt(grantedFromBlockRaw),
  };
}
