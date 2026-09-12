import type { ChainRelayerPort } from "./ports";

/** Fail-fast checks that must complete before the HTTP listener starts. */
export async function validateRelayerStartup(chain: ChainRelayerPort, minimumBalanceWei: bigint): Promise<void> {
  const [chainId, code, balance] = await Promise.all([
    chain.getChainId(),
    chain.getCode(),
    chain.getRelayerBalance(),
  ]);
  if (chainId !== 133 || code === "0x" || balance < minimumBalanceWei) {
    throw new Error("relayer startup validation failed");
  }
}
