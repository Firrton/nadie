import { isHex } from "viem";
import type { Address, Hex } from "viem";

import type { AccessChallenge, GatewayPort } from "../ports";

export class GatewayAccessError extends Error {
  constructor(message = "The package is not available for this professional.") {
    super(message);
    this.name = "GatewayAccessError";
  }
}

function isChallenge(value: unknown): value is AccessChallenge {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.challengeId === "string" &&
    isHex(candidate.challengeId) &&
    candidate.challengeId.length === 66 &&
    typeof candidate.message === "string" &&
    candidate.message.length > 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isSafeInteger(candidate.expiresAt)
  );
}

export class HttpGatewayAdapter implements GatewayPort {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, fetchImplementation: typeof fetch = fetch) {
    this.#baseUrl = baseUrl.replace(/\/$/, "");
    this.#fetch = fetchImplementation;
  }

  async requestChallenge(consentId: Hex, professional: Address): Promise<AccessChallenge> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/v1/access/challenges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId, professional: professional.toLowerCase() }),
      });
    } catch {
      throw new GatewayAccessError("The package service is unavailable.");
    }
    if (!response.ok) throw new GatewayAccessError("Could not create an access challenge.");

    const body: unknown = await response.json().catch(() => undefined);
    if (!isChallenge(body)) throw new GatewayAccessError("The package service returned an invalid challenge.");
    return body;
  }

  async download(consentId: Hex, challengeId: Hex, signature: Hex): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/v1/packages/${consentId}/access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId, signature }),
      });
    } catch {
      throw new GatewayAccessError("The package service is unavailable.");
    }
    if (!response.ok) throw new GatewayAccessError();
    return new Uint8Array(await response.arrayBuffer());
  }
}
