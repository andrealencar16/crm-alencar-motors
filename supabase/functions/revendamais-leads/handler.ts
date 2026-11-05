import { createRevendaMaisAdapterFromEnv } from "./server-config.ts";
import { createLeadProcessor } from "./processing.ts";
import type { LeadPersistence } from "./processing.ts";

export const MAX_BYTES = 64 * 1024;
const SECRET_PATTERN = /^[a-f0-9]{64}$/;
async function matches(candidate: string, expected: string) {
  const hashes = await Promise.all([candidate, expected].map(async s =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))));
  let difference = 0;
  for (let i = 0; i < hashes[0].length; i++) difference |= hashes[0][i] ^ hashes[1][i];
  return difference === 0;
}
function reply(status: number, code: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ status: code }), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff", ...(status === 503 || status === 504 ? { "Retry-After": "60" } : {}), ...extra,
  } });
}
export function createHandler(deps: {
  secret?: string;
  dealerId?: string;
  persistenceFactory?: (signal: AbortSignal) => LeadPersistence;
  externalIdIsStable?: boolean;
  unknownTextRetentionApproved?: boolean;
  persistenceTimeoutMs?: number;
  bodyTimeoutMs?: number;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return reply(405, "method_not_allowed", { Allow: "POST" });
    if (!deps.secret || !SECRET_PATTERN.test(deps.secret)) return reply(503, "unavailable");
    try {
      const tokens = new URL(req.url).searchParams.getAll("secret");
      if (tokens.length !== 1 || !SECRET_PATTERN.test(tokens[0]) || !await matches(tokens[0], deps.secret)) return reply(401, "unauthorized");
      let adapter;
      try { adapter = createRevendaMaisAdapterFromEnv(() => deps.dealerId); }
      catch { return reply(503, "unavailable"); }
      const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!(mime === "application/json" || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mime)) ||
        (req.headers.get("content-encoding") ?? "identity") !== "identity") return reply(415, "unsupported_media_type");
      const length = req.headers.get("content-length");
      if (length !== null && !/^\d+$/.test(length)) return reply(400, "invalid_body");
      if (length !== null && Number(length) > MAX_BYTES) return reply(413, "payload_too_large");
      if (!req.body) return reply(400, "invalid_body");
      const reader = req.body.getReader();
      const buffer = new Uint8Array(MAX_BYTES);
      let bytes = 0, reads = 0, timedOut = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true; reject(new Error()); void reader.cancel().catch(() => {});
          }, deps.bodyTimeoutMs ?? 5000);
        });
        while (true) {
          const part = await Promise.race([reader.read(), deadline]);
          if (part.done) break;
          if (++reads > 4096) { void reader.cancel().catch(() => {}); return reply(400, "invalid_body"); }
          if (bytes + part.value.byteLength > MAX_BYTES) {
            void reader.cancel().catch(() => {}); return reply(413, "payload_too_large");
          }
          buffer.set(part.value, bytes); bytes += part.value.byteLength;
        }
      } catch { return reply(timedOut ? 408 : 400, timedOut ? "body_timeout" : "invalid_body"); }
      finally { clearTimeout(timer); reader.releaseLock(); }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes))); }
      catch { return reply(400, "invalid_body"); }
      let event;
      try { event = adapter.inspect(body); }
      catch (error) {
        return error instanceof Error && error.message === "revendamais_dealer_mismatch"
          ? reply(403, "dealer_not_authorized") : reply(400, "invalid_event");
      }
      // Preserve first useful text in source order, without inferring sender or chronology.
      const sourceIndex = event.metadata.interactions.findIndex(i => i.text !== null);
      const unknown = sourceIndex >= 0 ? event.metadata.interactions[sourceIndex] : null;
      const factory = deps.persistenceFactory;
      const controller = new AbortController();
      // channel_name can be a campaign/manual channel; do not label it as a portal.
      const process = createLeadProcessor({ adapter: () => ({ ...event.fields, portal: null }),
        metadata: {
          channelId: event.metadata.channelId,
          channelName: typeof event.fields.portal === "string" ? event.fields.portal : null,
          createdAt: event.metadata.createdAt,
          unknownTextPresent: unknown !== null,
          unknownInteraction: unknown && deps.unknownTextRetentionApproved === true ? { text: unknown.text!, sourceIndex,
            createdAt: unknown.createdAt, authorship: "unknown" } : null,
        },
        externalIdIsStable: deps.externalIdIsStable === true,
        persistence: { commit: command => {
          if (!factory) throw new Error();
          return factory(controller.signal).commit(command);
        } },
      });
      let persistTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          persistTimer = setTimeout(() => { reject(new Error()); controller.abort(); }, deps.persistenceTimeoutMs ?? 8000);
        });
        const result = await Promise.race([process(body), deadline]);
        switch (result.status) {
          case "created": return reply(201, "created");
          case "duplicate": return reply(200, "duplicate");
          case "review": return reply(202, "review_persisted");
          case "invalid": return reply(400, "invalid_event");
          default: return reply(503, "persistence_unavailable");
        }
      } catch { return reply(504, "persistence_timeout"); }
      finally { clearTimeout(persistTimer); }
    } catch { return reply(500, "internal_error"); }
  };
}
