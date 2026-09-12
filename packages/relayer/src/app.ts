import { Hono, type Context } from "hono";
import { cors } from "hono/cors";

import { RelayService, RelayerError } from "./relayer";
import { parseGrantRequest, parseRevokeRequest } from "./schemas";

export interface RelayerHttpConfig {
  allowedOrigin: string;
  maxRequestBytes: number;
  rateLimitPerMinute: number;
  maxInFlight: number;
}

export interface RelayerAppDeps {
  service: RelayService;
  config: RelayerHttpConfig;
  now?: () => number;
}

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

type ErrorCode =
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "CONFLICT"
  | "NOT_RELAYABLE"
  | "RATE_LIMITED"
  | "SUBMISSION_FAILED"
  | "UNAVAILABLE"
  | "NOT_FOUND";

function errorResponse(c: { json: (body: { error: ErrorCode }, status: number) => Response }, code: ErrorCode, status: number): Response {
  return c.json({ error: code }, status);
}

/** Reads at most maxBytes, including bodies without Content-Length. */
async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function createRelayerApp(deps: RelayerAppDeps): Hono {
  const { service, config } = deps;
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const app = new Hono();
  let windowStart = now();
  let requestsInWindow = 0;
  let inFlight = 0;

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin !== undefined && origin !== config.allowedOrigin) {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }
    return cors({
      origin: config.allowedOrigin,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Idempotency-Key"],
      credentials: false,
    })(c, next);
  });

  app.use("/v1/transactions/*", async (c, next) => {
    const current = now();
    if (current - windowStart >= 60) {
      windowStart = current;
      requestsInWindow = 0;
    }
    requestsInWindow += 1;
    if (requestsInWindow > config.rateLimitPerMinute) {
      return errorResponse(c, "RATE_LIMITED", 429);
    }
    if (inFlight >= config.maxInFlight) {
      return errorResponse(c, "RATE_LIMITED", 429);
    }
    inFlight += 1;
    try {
      await next();
    } finally {
      inFlight -= 1;
    }
    return undefined;
  });

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  const relay = async (c: Context, kind: "grant" | "revoke"): Promise<Response> => {
    const contentType = (c.req.header("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }
    const idempotencyKey = c.req.header("idempotency-key") ?? "";
    if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }
    const contentLength = c.req.header("content-length");
    if (contentLength !== undefined) {
      const parsed = Number(contentLength);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        return errorResponse(c, "INVALID_REQUEST", 400);
      }
      if (parsed > config.maxRequestBytes) return errorResponse(c, "PAYLOAD_TOO_LARGE", 413);
    }

    let bytes: Uint8Array;
    try {
      const limited = await readLimitedBody(c.req.raw, config.maxRequestBytes);
      if (!limited) return errorResponse(c, "PAYLOAD_TOO_LARGE", 413);
      bytes = limited;
    } catch {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }
    if (bytes.byteLength === 0) {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }

    let request;
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      request = kind === "grant" ? parseGrantRequest(value) : parseRevokeRequest(value);
    } catch {
      return errorResponse(c, "INVALID_REQUEST", 400);
    }

    try {
      const result = await service.relay(request, idempotencyKey);
      return c.json(result, 202);
    } catch (error) {
      if (error instanceof RelayerError) return errorResponse(c, error.code, error.httpStatus);
      return errorResponse(c, "UNAVAILABLE", 503);
    }
  };

  app.post("/v1/transactions/grants", (c) => relay(c, "grant"));
  app.post("/v1/transactions/revocations", (c) => relay(c, "revoke"));

  app.get("/v1/transactions/:transactionHash", async (c) => {
    const rawHash = c.req.param("transactionHash");
    if (!TX_HASH_RE.test(rawHash)) return errorResponse(c, "NOT_FOUND", 404);
    const hash = rawHash.toLowerCase() as `0x${string}`;
    try {
      const status = await service.transactionStatus(hash);
      if (!status) return errorResponse(c, "NOT_FOUND", 404);
      if (status.status === "pending") return c.json({ status: "pending" });
      return c.json({ status: status.status, blockNumber: status.blockNumber?.toString() });
    } catch (error) {
      if (error instanceof RelayerError) return errorResponse(c, error.code, error.httpStatus);
      return errorResponse(c, "UNAVAILABLE", 503);
    }
  });

  app.notFound((c) => errorResponse(c, "NOT_FOUND", 404));
  app.onError((_error, c) => errorResponse(c, "UNAVAILABLE", 503));
  return app;
}
