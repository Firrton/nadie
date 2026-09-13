import { readFile } from "node:fs/promises";
import { type Abi, createPublicClient, getAddress, http } from "viem";

const RPC_URL = "https://testnet.hsk.xyz";
const PROFESSIONAL_REGISTRY = getAddress("0xD615074c2603336fa0Da8AF44B5CCB9D9C0B2F9c");
const CONSENT_REGISTRY = getAddress("0xdc3c4c07e4675cf1BBDEa627026e92170f9F5AE1");
const DOCUMENTED_ADMIN = getAddress("0x8A387ef9acC800eea39E3E6A2d92694dB6c813Ac");
const DOCUMENTED_VERIFIER = getAddress("0xbC0A1cE90FBD78A8d731127E66B0c16361EA7816");

async function loadAbi(relativeUrl: string): Promise<Abi> {
  const value = JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8")) as unknown;
  if (!Array.isArray(value)) throw new Error("invalid contract ABI");
  return value as Abi;
}

async function main(): Promise<void> {
  const [professionalAbi, consentAbi] = await Promise.all([
    loadAbi("../../contracts/abi/ProfessionalRegistry.json"),
    loadAbi("../../contracts/abi/ConsentRegistry.json"),
  ]);
  const client = createPublicClient({ transport: http(RPC_URL) });
  const [chainId, professionalCode, consentCode, admin, verifierEnabled, wiring] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: PROFESSIONAL_REGISTRY }),
    client.getCode({ address: CONSENT_REGISTRY }),
    client.readContract({ address: PROFESSIONAL_REGISTRY, abi: professionalAbi, functionName: "admin" }),
    client.readContract({
      address: PROFESSIONAL_REGISTRY,
      abi: professionalAbi,
      functionName: "verifiers",
      args: [DOCUMENTED_VERIFIER],
    }),
    client.readContract({
      address: CONSENT_REGISTRY,
      abi: consentAbi,
      functionName: "professionalRegistry",
    }),
  ]);

  if (chainId !== 133) throw new Error("HashKey smoke failed: unexpected chain ID");
  if (!professionalCode || professionalCode === "0x") throw new Error("HashKey smoke failed: ProfessionalRegistry has no bytecode");
  if (!consentCode || consentCode === "0x") throw new Error("HashKey smoke failed: ConsentRegistry has no bytecode");
  if (getAddress(String(admin)) !== DOCUMENTED_ADMIN) throw new Error("HashKey smoke failed: admin mismatch");
  if (verifierEnabled !== true) throw new Error("HashKey smoke failed: documented verifier is not enabled");
  if (getAddress(String(wiring)) !== PROFESSIONAL_REGISTRY) throw new Error("HashKey smoke failed: registry wiring mismatch");

  process.stdout.write("HashKey read-only smoke passed: chain, bytecode, wiring, admin and verifier.\n");
}

void main().catch(() => {
  process.stderr.write("HashKey read-only smoke failed.\n");
  process.exitCode = 1;
});
