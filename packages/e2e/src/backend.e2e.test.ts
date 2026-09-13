import { serve, type ServerType } from "@hono/node-server";
import {
  decryptPackage,
  deserializeEncryptedPackage,
  encryptPackage,
  generateEncryptionKeyPair,
  hashEncryptedPackage,
  serializeEncryptedPackage,
} from "@nadie/core";
import {
  createGatewayApp,
  createViemChainAuthorization,
  createViemSignatureVerifier,
  FilePackageStore,
} from "@nadie/gateway";
import {
  createRelayerApp,
  createViemRelayer,
  createViemSignatureRecovery,
  GRANT_TYPES,
  MemoryIdempotencyStore,
  RelayService,
  REVOKE_TYPES,
} from "@nadie/relayer";
import { createServer } from "node:net";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import {
  type Abi,
  type Hex,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEventLogs,
  stringToBytes,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

interface ContractArtifact {
  abi: Abi;
  bytecode: { object: Hex };
}

interface ChallengeResponse {
  challengeId: Hex;
  message: string;
  expiresAt: number;
}

const chain = defineChain({
  id: 133,
  name: "Nadie local E2E",
  nativeCurrency: { name: "Test HSK", symbol: "tHSK", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  testnet: true,
});

async function freePort(): Promise<number> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (address === null || typeof address === "string") throw new Error("failed to allocate local port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForRpc(rpcUrl: string, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error("anvil exited before its RPC was ready");
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const body = await response.json() as { result?: string };
      if (body.result === "0x85") return;
    } catch {
      // The child may still be binding its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("anvil RPC did not become ready");
}

async function setBalance(rpcUrl: string, address: Hex): Promise<void> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "anvil_setBalance",
      params: [address, "0x8ac7230489e80000"],
    }),
  });
  const body = await response.json() as { error?: unknown };
  if (!response.ok || body.error !== undefined) throw new Error("failed to fund an ephemeral account");
}

async function startHttp(fetchHandler: (request: Request) => Response | Promise<Response>): Promise<{
  server: ServerType;
  url: string;
}> {
  const server = serve({ fetch: fetchHandler, port: 0, hostname: "127.0.0.1" });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("HTTP server did not bind a TCP port");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function closeHttp(server: ServerType): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function loadArtifact(relativeUrl: string): Promise<ContractArtifact> {
  const value = JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), "utf8")) as ContractArtifact;
  if (!Array.isArray(value.abi) || !value.bytecode?.object?.startsWith("0x")) {
    throw new Error("invalid Foundry artifact");
  }
  return value;
}

async function waitForRelay(url: string, hash: Hex): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${url}/v1/transactions/${hash}`);
    if (response.ok) {
      const body = await response.json() as { status: string };
      if (body.status === "confirmed") return;
      if (body.status === "reverted") throw new Error("relayed transaction reverted");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("relayed transaction was not confirmed");
}

describe("Goal 9 backend integration", () => {
  it("runs encrypt, upload, grant, open, access, reply, revoke and suspend end to end", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nadie-backend-e2e-"));
    const storageDirectory = join(directory, "gateway");
    const httpServers: ServerType[] = [];
    let anvil: ChildProcess | undefined;

    try {
      const anvilPort = await freePort();
      const rpcUrl = `http://127.0.0.1:${anvilPort}`;
      anvil = spawn("anvil", ["--chain-id", "133", "--port", String(anvilPort), "--silent"], {
        stdio: "ignore",
      });
      await waitForRpc(rpcUrl, anvil);

      const deployerKey = generatePrivateKey();
      const verifierKey = generatePrivateKey();
      const psychologistKey = generatePrivateKey();
      const userKey = generatePrivateKey();
      const relayerKey = generatePrivateKey();
      const wrongWalletKey = generatePrivateKey();
      const deployer = privateKeyToAccount(deployerKey);
      const verifier = privateKeyToAccount(verifierKey);
      const psychologist = privateKeyToAccount(psychologistKey);
      const user = privateKeyToAccount(userKey);
      const relayer = privateKeyToAccount(relayerKey);
      const wrongWallet = privateKeyToAccount(wrongWalletKey);

      for (const account of [deployer, verifier, psychologist, user, relayer]) {
        await setBalance(rpcUrl, account.address);
      }

      const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
      const deployerClient = createWalletClient({ account: deployer, chain, transport: http(rpcUrl) });
      const verifierClient = createWalletClient({ account: verifier, chain, transport: http(rpcUrl) });
      const psychologistClient = createWalletClient({ account: psychologist, chain, transport: http(rpcUrl) });
      const userClient = createWalletClient({ account: user, chain, transport: http(rpcUrl) });

      const professionalArtifact = await loadArtifact("../../contracts/out/ProfessionalRegistry.sol/ProfessionalRegistry.json");
      const consentArtifact = await loadArtifact("../../contracts/out/ConsentRegistry.sol/ConsentRegistry.json");

      const professionalDeployHash = await deployerClient.deployContract({
        abi: professionalArtifact.abi,
        bytecode: professionalArtifact.bytecode.object,
      });
      const professionalReceipt = await publicClient.waitForTransactionReceipt({ hash: professionalDeployHash });
      const professionalRegistry = professionalReceipt.contractAddress;
      if (!professionalRegistry) throw new Error("ProfessionalRegistry deployment had no address");

      const consentDeployHash = await deployerClient.deployContract({
        abi: consentArtifact.abi,
        bytecode: consentArtifact.bytecode.object,
        args: [professionalRegistry],
      });
      const consentReceipt = await publicClient.waitForTransactionReceipt({ hash: consentDeployHash });
      const consentRegistry = consentReceipt.contractAddress;
      if (!consentRegistry) throw new Error("ConsentRegistry deployment had no address");

      const writeAndWait = async (
        client: typeof deployerClient,
        address: Hex,
        abi: Abi,
        functionName: string,
        args: readonly unknown[],
      ) => {
        const hash = await client.writeContract({ address, abi, functionName, args });
        return publicClient.waitForTransactionReceipt({ hash });
      };

      await writeAndWait(deployerClient, professionalRegistry, professionalArtifact.abi, "setVerifier", [verifier.address, true]);
      const encryptionKeys = await generateEncryptionKeyPair();
      await writeAndWait(
        psychologistClient as typeof deployerClient,
        professionalRegistry,
        professionalArtifact.abi,
        "registerKey",
        [encryptionKeys.publicKey],
      );
      const chainTime = Number((await publicClient.getBlock()).timestamp);
      await writeAndWait(
        verifierClient as typeof deployerClient,
        professionalRegistry,
        professionalArtifact.abi,
        "issue",
        [psychologist.address, "Synthetic Psychologist", chainTime + 7_200],
      );

      const store = new FilePackageStore(storageDirectory);
      await store.init();
      const gatewayShell = await startHttp(() => new Response(null, { status: 503 }));
      await closeHttp(gatewayShell.server);
      const gatewayUrl = gatewayShell.url;
      const gatewayApp = createGatewayApp({
        store,
        chain: createViemChainAuthorization({ rpcUrl, chainId: 133, consentRegistryAddress: consentRegistry }),
        verifier: createViemSignatureVerifier(),
        config: {
          chainId: 133,
          consentRegistryAddress: consentRegistry.toLowerCase(),
          gatewayUrl,
          allowedOrigins: ["http://localhost:5173"],
          maxPackageBytes: 1_048_576,
          retentionSeconds: 3_600,
          challengeTtlSeconds: 60,
          maxActiveChallenges: 100,
        },
      });
      const gatewayServer = serve({ fetch: gatewayApp.fetch, port: Number(new URL(gatewayUrl).port), hostname: "127.0.0.1" });
      httpServers.push(gatewayServer);
      if (!gatewayServer.listening) await once(gatewayServer, "listening");

      const relayerAdapter = createViemRelayer({
        rpcUrl,
        consentRegistryAddress: consentRegistry,
        privateKey: relayerKey,
      });
      const relayService = new RelayService({
        chain: relayerAdapter,
        signatures: createViemSignatureRecovery(),
        idempotency: new MemoryIdempotencyStore(100),
        config: {
          chainId: 133,
          consentRegistryAddress: consentRegistry,
          maxGas: 1_000_000n,
          minBalanceWei: 0n,
          idempotencyTtlSeconds: 3_600,
        },
      });
      const relayerApp = createRelayerApp({
        service: relayService,
        config: {
          allowedOrigin: "http://localhost:5173",
          maxRequestBytes: 16_384,
          rateLimitPerMinute: 100,
          maxInFlight: 8,
        },
      });
      const relayerHttp = await startHttp(relayerApp.fetch);
      httpServers.push(relayerHttp.server);

      const plaintext = new TextEncoder().encode("Synthetic private session: steady progress, no real person.");
      const envelope = await encryptPackage(plaintext, encryptionKeys.publicKey, {
        professional: psychologist.address.toLowerCase(),
        scope: "graph-summary",
      });
      const packageBytes = serializeEncryptedPackage(envelope);
      const packageHash = hashEncryptedPackage(envelope) as Hex;

      const uploadResponse = await fetch(`${gatewayUrl}/v1/packages/${packageHash}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: Buffer.from(packageBytes),
      });
      expect(uploadResponse.status).toBe(201);

      const alteredEnvelope = {
        ...envelope,
        ciphertext: `${envelope.ciphertext[0] === "A" ? "B" : "A"}${envelope.ciphertext.slice(1)}`,
      };
      const alteredResponse = await fetch(`${gatewayUrl}/v1/packages/${packageHash}`, {
        method: "PUT",
        headers: { "content-type": "application/octet-stream" },
        body: Buffer.from(serializeEncryptedPackage(alteredEnvelope)),
      });
      expect(alteredResponse.status).toBe(400);

      const domain = {
        name: "NadieConsentRegistry",
        version: "1",
        chainId: 133,
        verifyingContract: consentRegistry,
      } as const;
      const scope = keccak256(stringToBytes("graph-summary"));
      const consentId = keccak256(stringToBytes("goal-09-primary-consent"));
      const expiresAt = BigInt(chainTime + 3_600);
      const grantDeadline = BigInt(chainTime + 600);
      const grantMessage = {
        consentId,
        user: user.address,
        professional: psychologist.address,
        packageHash,
        scope,
        expiresAt,
        nonce: 0n,
        deadline: grantDeadline,
      };
      const grantSignature = await userClient.signTypedData({
        domain,
        types: GRANT_TYPES,
        primaryType: "Grant",
        message: { ...grantMessage, expiresAt: Number(expiresAt) },
      });
      const grantResponse = await fetch(`${relayerHttp.url}/v1/transactions/grants`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "goal09-grant-0001" },
        body: JSON.stringify({
          domain,
          message: { ...grantMessage, expiresAt: expiresAt.toString(), nonce: "0", deadline: grantDeadline.toString() },
          signature: grantSignature,
        }),
      });
      expect(grantResponse.status).toBe(202);
      const grantResult = await grantResponse.json() as { transactionHash: Hex };
      await waitForRelay(relayerHttp.url, grantResult.transactionHash);
      expect(await publicClient.readContract({
        address: consentRegistry,
        abi: consentArtifact.abi,
        functionName: "isValid",
        args: [consentId],
      })).toBe(true);

      const firstOpenReceipt = await writeAndWait(
        psychologistClient as typeof deployerClient,
        consentRegistry,
        consentArtifact.abi,
        "open",
        [consentId],
      );
      const firstConsent = await publicClient.readContract({
        address: consentRegistry,
        abi: consentArtifact.abi,
        functionName: "consents",
        args: [consentId],
      }) as readonly unknown[];
      const firstOpenedAt = firstConsent[5] as bigint;
      expect(firstOpenedAt).toBeGreaterThan(0n);
      const secondOpenReceipt = await writeAndWait(
        psychologistClient as typeof deployerClient,
        consentRegistry,
        consentArtifact.abi,
        "open",
        [consentId],
      );
      const secondConsent = await publicClient.readContract({
        address: consentRegistry,
        abi: consentArtifact.abi,
        functionName: "consents",
        args: [consentId],
      }) as readonly unknown[];
      expect(secondConsent[5]).toBe(firstOpenedAt);
      const openedEvents = await publicClient.getContractEvents({
        address: consentRegistry,
        abi: consentArtifact.abi,
        eventName: "Opened",
        fromBlock: firstOpenReceipt.blockNumber,
        toBlock: secondOpenReceipt.blockNumber,
      });
      expect(openedEvents).toHaveLength(1);

      const requestChallenge = async (id: Hex): Promise<ChallengeResponse> => {
        const response = await fetch(`${gatewayUrl}/v1/access/challenges`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consentId: id, professional: psychologist.address.toLowerCase() }),
        });
        expect(response.status).toBe(200);
        return response.json() as Promise<ChallengeResponse>;
      };
      const access = (id: Hex, challenge: ChallengeResponse, signature: Hex) => fetch(
        `${gatewayUrl}/v1/packages/${id}/access`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId: challenge.challengeId, signature }),
        },
      );

      const wrongChallenge = await requestChallenge(consentId);
      const wrongSignature = await wrongWallet.signMessage({ message: wrongChallenge.message });
      expect((await access(consentId, wrongChallenge, wrongSignature)).status).toBe(404);

      const validChallenge = await requestChallenge(consentId);
      const validSignature = await psychologist.signMessage({ message: validChallenge.message });
      const downloadResponse = await access(consentId, validChallenge, validSignature);
      expect(downloadResponse.status).toBe(200);
      const downloadedEnvelope = deserializeEncryptedPackage(new Uint8Array(await downloadResponse.arrayBuffer()));
      const decrypted = await decryptPackage(downloadedEnvelope, encryptionKeys.privateKey);
      expect(decrypted).toEqual(plaintext);

      const responseHash = keccak256(stringToBytes("Synthetic encrypted response"));
      const replyReceipt = await writeAndWait(
        psychologistClient as typeof deployerClient,
        consentRegistry,
        consentArtifact.abi,
        "reply",
        [consentId, responseHash],
      );
      const replyLogs = parseEventLogs({ abi: consentArtifact.abi, logs: replyReceipt.logs, eventName: "Replied" });
      expect(replyLogs).toHaveLength(1);
      expect(replyLogs[0]?.args).toEqual({ consentId, responseHash });

      const revokeDeadline = BigInt(chainTime + 900);
      const revokeMessage = { consentId, user: user.address, nonce: 1n, deadline: revokeDeadline };
      const revokeSignature = await userClient.signTypedData({
        domain,
        types: REVOKE_TYPES,
        primaryType: "Revoke",
        message: revokeMessage,
      });
      const revokeResponse = await fetch(`${relayerHttp.url}/v1/transactions/revocations`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "goal09-revoke-0001" },
        body: JSON.stringify({
          domain,
          message: { ...revokeMessage, nonce: "1", deadline: revokeDeadline.toString() },
          signature: revokeSignature,
        }),
      });
      expect(revokeResponse.status).toBe(202);
      const revokeResult = await revokeResponse.json() as { transactionHash: Hex };
      await waitForRelay(relayerHttp.url, revokeResult.transactionHash);
      expect(await publicClient.readContract({
        address: consentRegistry,
        abi: consentArtifact.abi,
        functionName: "isValid",
        args: [consentId],
      })).toBe(false);
      const revokedChallenge = await requestChallenge(consentId);
      const revokedSignature = await psychologist.signMessage({ message: revokedChallenge.message });
      // Anvil instamine puede incluir el revoke en el MISMO número de bloque
      // que el gateway aún reporta como latest; un snapshot en ese bloque ve
      // el estado previo al revoke. Avanzar la cadena un bloque garantiza
      // que el snapshot posterior incluya la revocación.
      const advanceAnvilBlock = async (): Promise<void> => {
        await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_mine", params: [1] }),
        });
      };
      const revokeReceiptBlock = await (async () => {
        const receipt = await publicClient.getTransactionReceipt({ hash: revokeResult.transactionHash });
        return receipt.blockNumber;
      })();
      const revocationVisibleDeadline = Date.now() + 5_000;
      while ((await publicClient.getBlockNumber()) <= revokeReceiptBlock) {
        if (Date.now() > revocationVisibleDeadline) throw new Error("chain never moved past the revocation block");
        await advanceAnvilBlock();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const revokedAccessResponse = await access(consentId, revokedChallenge, revokedSignature);
      expect(revokedAccessResponse.status).toBe(404);
      expect(revokedAccessResponse.status).toBe(404);

      const suspendedConsentId = keccak256(stringToBytes("goal-09-suspended-consent"));
      const secondGrantMessage = { ...grantMessage, consentId: suspendedConsentId, nonce: 2n };
      const secondGrantSignature = await userClient.signTypedData({
        domain,
        types: GRANT_TYPES,
        primaryType: "Grant",
        message: { ...secondGrantMessage, expiresAt: Number(expiresAt) },
      });
      const secondGrantResponse = await fetch(`${relayerHttp.url}/v1/transactions/grants`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "goal09-grant-0002" },
        body: JSON.stringify({
          domain,
          message: { ...secondGrantMessage, expiresAt: expiresAt.toString(), nonce: "2", deadline: grantDeadline.toString() },
          signature: secondGrantSignature,
        }),
      });
      expect(secondGrantResponse.status).toBe(202);
      const secondGrantResult = await secondGrantResponse.json() as { transactionHash: Hex };
      await waitForRelay(relayerHttp.url, secondGrantResult.transactionHash);
      await writeAndWait(
        psychologistClient as typeof deployerClient,
        consentRegistry,
        consentArtifact.abi,
        "open",
        [suspendedConsentId],
      );
      await writeAndWait(
        verifierClient as typeof deployerClient,
        professionalRegistry,
        professionalArtifact.abi,
        "suspend",
        [psychologist.address],
      );
      const suspendedChallenge = await requestChallenge(suspendedConsentId);
      const suspendedSignature = await psychologist.signMessage({ message: suspendedChallenge.message });
      expect((await access(suspendedConsentId, suspendedChallenge, suspendedSignature)).status).toBe(404);

      const unavailablePort = await freePort();
      const unavailableGateway = createGatewayApp({
        store,
        chain: createViemChainAuthorization({
          rpcUrl: `http://127.0.0.1:${unavailablePort}`,
          chainId: 133,
          consentRegistryAddress: consentRegistry,
        }),
        verifier: createViemSignatureVerifier(),
        config: {
          chainId: 133,
          consentRegistryAddress: consentRegistry.toLowerCase(),
          gatewayUrl: "http://127.0.0.1",
          allowedOrigins: ["http://localhost:5173"],
          maxPackageBytes: 1_048_576,
          retentionSeconds: 3_600,
          challengeTtlSeconds: 60,
          maxActiveChallenges: 100,
        },
      });
      const unavailableHttp = await startHttp(unavailableGateway.fetch);
      httpServers.push(unavailableHttp.server);
      const unavailableChallengeResponse = await fetch(`${unavailableHttp.url}/v1/access/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId, professional: psychologist.address.toLowerCase() }),
      });
      const unavailableChallenge = await unavailableChallengeResponse.json() as ChallengeResponse;
      const unavailableSignature = await psychologist.signMessage({ message: unavailableChallenge.message });
      const unavailableAccess = await fetch(`${unavailableHttp.url}/v1/packages/${consentId}/access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: unavailableChallenge.challengeId, signature: unavailableSignature }),
      });
      expect(unavailableAccess.status).toBe(503);

      const storedFiles = await readdir(storageDirectory);
      for (const filename of storedFiles) {
        const contents = await readFile(join(storageDirectory, filename));
        expect(contents.includes(Buffer.from(plaintext))).toBe(false);
      }
    } finally {
      await Promise.allSettled(httpServers.map(closeHttp));
      if (anvil) await stopChild(anvil);
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
