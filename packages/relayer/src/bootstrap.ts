import type { ChainRelayerPort } from "./ports";

/**
 * Fail-fast checks that must complete before the HTTP listener starts.
 * The error names every failed check, so a failed deploy says why. It carries
 * only public chain data: never configuration values.
 */
export async function validateRelayerStartup(chain: ChainRelayerPort, minimumBalanceWei: bigint): Promise<void> {
  const [chainId, code, balance] = await Promise.all([
    chain.getChainId(),
    chain.getCode(),
    chain.getRelayerBalance(),
  ]);
  const failures: string[] = [];
  if (chainId !== 133) failures.push(`chain ID ${chainId}, expected 133`);
  if (code === "0x") failures.push("contract bytecode missing at CONSENT_REGISTRY_ADDRESS");
  if (balance < minimumBalanceWei) failures.push(`balance ${balance} wei below minimum ${minimumBalanceWei} wei`);
  if (failures.length > 0) {
    throw new Error("relayer startup validation failed: " + failures.join("; "));
  }
}
