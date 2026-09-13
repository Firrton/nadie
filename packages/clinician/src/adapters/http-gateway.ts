import { isHex } from "viem";
import type { Address, Hex } from "viem";

import type { AccessChallenge, GatewayPort } from "../ports";

export class GatewayAccessError extends Error {
  constructor(message = "Esto ya no está disponible para ti.") {
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
    /* Envuelto, no guardado tal cual: `this.#fetch(...)` llamaría a fetch con
       `this` = el adaptador, y Chrome lanza "Illegal invocation" antes de mandar
       el pedido. En Node no falla, por eso pasó los tests; en el demo, la
       psicóloga pagó el open y vio "No pudimos conectar con el servicio". */
    this.#fetch = (input, init) => fetchImplementation(input, init);
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
      throw new GatewayAccessError("No pudimos conectar con el servicio. Intenta de nuevo en un momento.");
    }
    if (!response.ok) throw new GatewayAccessError("No se pudo confirmar tu acceso. Intenta de nuevo.");

    const body: unknown = await response.json().catch(() => undefined);
    if (!isChallenge(body)) throw new GatewayAccessError("No se pudo confirmar tu acceso. Intenta de nuevo.");
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
      throw new GatewayAccessError("No pudimos conectar con el servicio. Intenta de nuevo en un momento.");
    }
    if (!response.ok) throw new GatewayAccessError();
    return new Uint8Array(await response.arrayBuffer());
  }
}
