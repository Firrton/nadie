/**
 * Adapter de ChainAuthorizationPort con viem para HashKey Chain Testnet.
 *
 * Lee TODO en un único bloque observado. Falla cerrado: cualquier error RPC
 * lanza y el llamador responde 503.
 */

import { createPublicClient, http, type PublicClient } from "viem";

import type { BlockRef, ChainAuthorizationPort, ConsentSnapshot } from "./ports";
import { ConsentRegistryAbi } from "./consent-abi";

export interface ViemChainConfig {
  rpcUrl: string;
  chainId: number;
  consentRegistryAddress: string;
}

export function createViemChainAuthorization(config: ViemChainConfig): ChainAuthorizationPort {
  const client: PublicClient = createPublicClient({
    transport: http(config.rpcUrl),
  }) as PublicClient;

  const address = config.consentRegistryAddress as `0x${string}`;

  return {
    async getLatestBlock(): Promise<BlockRef> {
      const blockNumber = await client.getBlockNumber();
      return { blockNumber };
    },

    async getConsentSnapshot(consentId: string, at: BlockRef): Promise<ConsentSnapshot> {
      const id = consentId as `0x${string}`;
      // Las dos lecturas usan exactamente el mismo blockNumber.
      const [consent, valid] = await Promise.all([
        client.readContract({
          address,
          abi: ConsentRegistryAbi,
          functionName: "consents",
          args: [id],
          blockNumber: at.blockNumber,
        }),
        client.readContract({
          address,
          abi: ConsentRegistryAbi,
          functionName: "isValid",
          args: [id],
          blockNumber: at.blockNumber,
        }),
      ]);
      const [user, professional, packageHash, , , firstOpenedAt] = consent as [
        string,
        string,
        string,
        string,
        number,
        number,
      ];
      const exists = user !== "0x0000000000000000000000000000000000000000";
      return {
        exists,
        professional: professional.toLowerCase(),
        packageHash: packageHash.toLowerCase(),
        firstOpenedAt: Number(firstOpenedAt),
        valid: Boolean(valid),
      };
    },
  };
}