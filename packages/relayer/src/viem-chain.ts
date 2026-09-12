import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  TransactionReceiptNotFoundError,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { consentRegistryAbi } from "./consent-abi";
import type { ChainRelayerPort } from "./ports";
import { ChainUnavailableError, SimulationRejectedError } from "./relayer";
import type { PreparedTransaction, TransactionStatus } from "./types";

const hashKeyTestnet = defineChain({
  id: 133,
  name: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet.hsk.xyz"] } },
  blockExplorers: { default: { name: "HashKey Testnet Explorer", url: "https://testnet-explorer.hsk.xyz" } },
  testnet: true,
});

export interface ViemRelayerOptions {
  rpcUrl: string;
  consentRegistryAddress: `0x${string}`;
  privateKey: `0x${string}`;
}

export interface ViemRelayerAdapter extends ChainRelayerPort {
  readonly accountAddress: `0x${string}`;
}

export function createViemRelayer(options: ViemRelayerOptions): ViemRelayerAdapter {
  const account = privateKeyToAccount(options.privateKey);
  const publicClient = createPublicClient({ chain: hashKeyTestnet, transport: http(options.rpcUrl) });
  const walletClient = createWalletClient({ account, chain: hashKeyTestnet, transport: http(options.rpcUrl) });
  return createAdapter(publicClient, walletClient, account, options.consentRegistryAddress);
}

function createAdapter(
  publicClient: PublicClient,
  walletClient: WalletClient,
  account: Account,
  contract: `0x${string}`,
): ViemRelayerAdapter {
  async function prepare(functionName: "grantWithSig" | "revokeWithSig", args: readonly unknown[]): Promise<PreparedTransaction> {
    try {
      const simulation = await publicClient.simulateContract({
        account,
        address: contract,
        abi: consentRegistryAbi,
        functionName,
        args,
      });
      const gas = await publicClient.estimateContractGas({
        account,
        address: contract,
        abi: consentRegistryAbi,
        functionName,
        args,
      });
      const gasPrice = await publicClient.getGasPrice();
      return {
        request: { ...simulation.request, gas, gasPrice },
        gas,
        feePerGas: gasPrice,
        maxCostWei: gas * gasPrice,
      };
    } catch (error) {
      // viem does not reliably distinguish transport and contract reverts across all RPCs.
      // A deterministic contract rejection is not relayable; transport failures remain fail-closed.
      if (error instanceof Error && /revert|execution reverted/i.test(error.message)) {
        throw new SimulationRejectedError();
      }
      throw new ChainUnavailableError();
    }
  }

  return {
    accountAddress: account.address,
    async getChainId() {
      try {
        return await publicClient.getChainId();
      } catch {
        throw new ChainUnavailableError();
      }
    },
    async getCode() {
      try {
        return (await publicClient.getCode({ address: contract })) ?? "0x";
      } catch {
        throw new ChainUnavailableError();
      }
    },
    async getRelayerBalance() {
      try {
        return await publicClient.getBalance({ address: account.address });
      } catch {
        throw new ChainUnavailableError();
      }
    },
    async getUserNonce(user) {
      try {
        return await publicClient.readContract({
          address: contract,
          abi: consentRegistryAbi,
          functionName: "nonces",
          args: [user],
        }) as bigint;
      } catch {
        throw new ChainUnavailableError();
      }
    },
    simulateGrant(request) {
      const { message, signature } = request;
      return prepare("grantWithSig", [
        message.consentId,
        message.user,
        message.professional,
        message.packageHash,
        message.scope,
        message.expiresAt,
        message.nonce,
        message.deadline,
        signature,
      ]);
    },
    simulateRevoke(request) {
      const { message, signature } = request;
      return prepare("revokeWithSig", [message.consentId, message.user, message.nonce, message.deadline, signature]);
    },
    async submit(prepared) {
      try {
        const request = prepared.request as Parameters<typeof walletClient.writeContract>[0];
        return await walletClient.writeContract(request);
      } catch {
        throw new ChainUnavailableError();
      }
    },
    async getTransactionStatus(hash): Promise<TransactionStatus> {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        return {
          status: receipt.status === "success" ? "confirmed" : "reverted",
          blockNumber: receipt.blockNumber,
        };
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return { status: "pending" };
        throw new ChainUnavailableError();
      }
    },
  };
}
