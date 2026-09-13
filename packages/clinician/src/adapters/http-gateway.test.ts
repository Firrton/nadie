import { describe, expect, it } from "vitest";

import { HttpGatewayAdapter } from "./http-gateway";

const consentId = `0x${"11".repeat(32)}` as const;
const professional = "0x1000000000000000000000000000000000000001" as const;

/* Chrome exige que fetch se llame con `this` = window. Llamado como método de
   otro objeto lanza "Illegal invocation" ANTES de mandar el pedido. En Node no
   pasa, por eso ningún test lo había visto: en el demo, la psicóloga pagó el
   open y vio "No pudimos conectar con el servicio". Este doble imita a Chrome. */
function fetchLikeChrome(response: Response) {
  return function strictFetch(this: unknown): Promise<Response> {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return Promise.resolve(response);
  } as unknown as typeof fetch;
}

describe("HttpGatewayAdapter", () => {
  it("requests the challenge with a fetch that must not be detached from window", async () => {
    const challenge = { challengeId: `0x${"22".repeat(32)}`, message: "challenge", expiresAt: 9999999999 };
    const adapter = new HttpGatewayAdapter("/api/gateway", fetchLikeChrome(Response.json(challenge)));

    await expect(adapter.requestChallenge(consentId, professional)).resolves.toEqual(challenge);
  });

  it("downloads with a fetch that must not be detached from window", async () => {
    const adapter = new HttpGatewayAdapter("/api/gateway", fetchLikeChrome(new Response(new Uint8Array([1, 2, 3]))));

    await expect(adapter.download(consentId, `0x${"22".repeat(32)}`, `0x${"33".repeat(65)}`)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
