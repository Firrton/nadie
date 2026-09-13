import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
  isAddress,
  numberToHex,
} from "viem";
import type { Address, EIP1193Provider, Hex } from "viem";

import { CONSENT_REGISTRY_ABI, PROFESSIONAL_REGISTRY_ABI } from "../abi";
import type { ClinicianConfig } from "../config";
import type { ChainPort, ProfessionalConsent, ProfessionalCredential } from "../ports";

export class WalletUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletUnavailableError";
  }
}

export class ViemChainAdapter implements ChainPort {
  readonly #config: ClinicianConfig;
  readonly #provider: EIP1193Provider | undefined;
  readonly #chain: ReturnType<typeof defineChain>;
  readonly #publicClient;
  readonly #walletClient;
  #account: Address | undefined;

  constructor(config: ClinicianConfig, provider: EIP1193Provider | undefined) {
    this.#config = config;
    this.#provider = provider;
    this.#chain = defineChain({
      id: config.chainId,
      name: config.chainId === 133 ? "HashKey Chain Testnet / local demo" : "Configured Nadie chain",
      nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
      testnet: true,
    });
    this.#publicClient = createPublicClient({ chain: this.#chain, transport: http(config.rpcUrl) });
    this.#walletClient = provider
      ? createWalletClient({ chain: this.#chain, transport: custom(provider) })
      : undefined;
  }

  async connect(): Promise<Address> {
    if (!this.#provider || !this.#walletClient) {
      throw new WalletUnavailableError("Instala o activa una wallet EVM para continuar.");
    }
    await this.#ensureChain();
    await this.#assertWalletRpc();
    const addresses = await this.#walletClient.requestAddresses();
    const first = addresses[0];
    if (!first || !isAddress(first)) throw new WalletUnavailableError("La wallet no entregó ninguna cuenta.");
    this.#account = getAddress(first);
    return this.#account;
  }

  async currentAddress(): Promise<Address | undefined> {
    if (!this.#provider || !this.#walletClient) return undefined;
    const addresses = await this.#walletClient.getAddresses();
    const first = addresses[0];
    if (!first || !isAddress(first)) return undefined;
    this.#account = getAddress(first);
    return this.#account;
  }

  async credential(professional: Address): Promise<ProfessionalCredential> {
    await this.#assertRpcChain();
    const [credential, isVerified] = await Promise.all([
      this.#publicClient.readContract({
        address: this.#config.professionalRegistryAddress,
        abi: PROFESSIONAL_REGISTRY_ABI,
        functionName: "credentials",
        args: [professional],
      }),
      this.#publicClient.readContract({
        address: this.#config.professionalRegistryAddress,
        abi: PROFESSIONAL_REGISTRY_ABI,
        functionName: "isVerified",
        args: [professional],
      }),
    ]);
    return {
      publicKey: credential[0],
      displayName: credential[1],
      status: credential[2],
      expiresAt: credential[3],
      issuer: credential[4],
      isVerified,
    };
  }

  async grantedConsents(professional: Address): Promise<ProfessionalConsent[]> {
    await this.#assertRpcChain();
    const logs = await this.#publicClient.getContractEvents({
      address: this.#config.consentRegistryAddress,
      abi: CONSENT_REGISTRY_ABI,
      eventName: "Granted",
      args: { professional },
      fromBlock: this.#config.grantedFromBlock,
      toBlock: "latest",
    });
    const unique = new Map<Hex, bigint>();
    for (const log of logs) {
      const consentId = log.args.consentId;
      if (consentId) unique.set(consentId, log.blockNumber);
    }

    const consents = await Promise.all(
      [...unique].map(async ([consentId, grantedBlock]): Promise<ProfessionalConsent> => {
        const [record, isValid] = await Promise.all([
          this.#publicClient.readContract({
            address: this.#config.consentRegistryAddress,
            abi: CONSENT_REGISTRY_ABI,
            functionName: "consents",
            args: [consentId],
          }),
          this.#publicClient.readContract({
            address: this.#config.consentRegistryAddress,
            abi: CONSENT_REGISTRY_ABI,
            functionName: "isValid",
            args: [consentId],
          }),
        ]);
        return {
          consentId,
          user: record[0],
          professional: record[1],
          packageHash: record[2],
          scope: record[3],
          expiresAt: record[4],
          firstOpenedAt: record[5],
          revoked: record[6],
          isValid,
          grantedBlock,
        };
      }),
    );
    return consents.sort((left, right) => (left.grantedBlock > right.grantedBlock ? -1 : 1));
  }

  async registerKey(publicKey: Hex): Promise<Hex> {
    const account = await this.#requireAccount();
    const simulation = await this.#publicClient.simulateContract({
      account,
      address: this.#config.professionalRegistryAddress,
      abi: PROFESSIONAL_REGISTRY_ABI,
      functionName: "registerKey",
      args: [publicKey],
    });
    const hash = await this.#walletClient?.writeContract(simulation.request);
    if (!hash) throw new WalletUnavailableError("La wallet no está conectada.");
    await this.#waitForSuccess(hash);
    return hash;
  }

  async open(consentId: Hex): Promise<Hex> {
    const account = await this.#requireAccount();
    const simulation = await this.#publicClient.simulateContract({
      account,
      address: this.#config.consentRegistryAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: "open",
      args: [consentId],
    });
    const hash = await this.#walletClient?.writeContract(simulation.request);
    if (!hash) throw new WalletUnavailableError("La wallet no está conectada.");
    await this.#waitForSuccess(hash);
    return hash;
  }

  async signPersonalMessage(message: string): Promise<Hex> {
    const account = await this.#requireAccount();
    const signature = await this.#walletClient?.signMessage({ account, message });
    if (!signature) throw new WalletUnavailableError("La wallet no está conectada.");
    return signature;
  }

  async reply(consentId: Hex, responseHash: Hex): Promise<Hex> {
    const account = await this.#requireAccount();
    const simulation = await this.#publicClient.simulateContract({
      account,
      address: this.#config.consentRegistryAddress,
      abi: CONSENT_REGISTRY_ABI,
      functionName: "reply",
      args: [consentId, responseHash],
    });
    const hash = await this.#walletClient?.writeContract(simulation.request);
    if (!hash) throw new WalletUnavailableError("La wallet no está conectada.");
    await this.#waitForSuccess(hash);
    return hash;
  }

  async #requireAccount(): Promise<Address> {
    await this.#assertRpcChain();
    const account = this.#account ?? (await this.currentAddress());
    if (!account) throw new WalletUnavailableError("Primero conecta la wallet profesional.");
    await this.#ensureChain();
    await this.#assertWalletRpc();
    return account;
  }

  async #assertRpcChain(): Promise<void> {
    const chainId = await this.#publicClient.getChainId();
    if (chainId !== this.#config.chainId) {
      throw new WalletUnavailableError("El RPC configurado apunta a otra cadena.");
    }
  }

  async #ensureChain(): Promise<void> {
    if (!this.#provider) throw new WalletUnavailableError("Hace falta una wallet EVM.");
    const chainId = numberToHex(this.#config.chainId);
    try {
      await this.#provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      if (!isProviderError(error, 4902)) throw error;
      await this.#provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: this.#chain.name,
            nativeCurrency: this.#chain.nativeCurrency,
            rpcUrls: [this.#config.rpcUrl],
          },
        ],
      });
    }
  }

  async #assertWalletRpc(): Promise<void> {
    if (!this.#provider) throw new WalletUnavailableError("Hace falta una wallet EVM.");
    const [walletGenesis, configuredGenesis] = await Promise.all([
      this.#provider.request({ method: "eth_getBlockByNumber", params: ["0x0", false] }),
      this.#publicClient.getBlock({ blockNumber: 0n }),
    ]);
    const walletHash = readBlockHash(walletGenesis);
    if (!walletHash || !configuredGenesis.hash || walletHash.toLowerCase() !== configuredGenesis.hash.toLowerCase()) {
      throw new WalletUnavailableError(
        "La red elegida en la wallet no usa el RPC de este portal. Cambia de red en la wallet.",
      );
    }
  }

  async #waitForSuccess(hash: Hex): Promise<void> {
    const receipt = await this.#publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("La transacción no se confirmó.");
  }
}

function isProviderError(error: unknown, code: number): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === code;
}

function readBlockHash(block: unknown): string | undefined {
  if (block === null || typeof block !== "object" || !("hash" in block)) return undefined;
  return typeof block.hash === "string" ? block.hash : undefined;
}
