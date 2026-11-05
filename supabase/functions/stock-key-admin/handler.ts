export type Action = "create" | "list" | "revoke";
export type RpcResult = { data: unknown; error: { code?: string } | null };
export type Dependencies = {
  authenticate: (jwt: string, signal: AbortSignal) => Promise<string | null>;
  execute: (jwt: string, action: Action, args: Record<string, unknown>, signal: AbortSignal) => Promise<RpcResult>;
  allowedOrigins: string[];
  timeoutMs?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const metadataFields = ["id", "name", "key_prefix", "scopes", "created_by", "created_at",
  "is_active", "revoked_at", "revoked_by", "last_used_at"] as const;

function metadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid RPC result");
  const row = value as Record<string, unknown>;
  return Object.fromEntries(metadataFields.map((field) => [field, row[field]]));
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error("deadline"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try { return await Promise.race([operation, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("Origin");
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", "Pragma": "no-cache", "Vary": "Origin",
      "X-Content-Type-Options": "nosniff" });
    const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    const fail = (code: string, status: number) => reply({ error: { code } }, status);
    if (origin && !deps.allowedOrigins.includes(origin)) return fail("ORIGIN_NOT_ALLOWED", 403);
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") { headers.set("Allow", "POST, OPTIONS"); return fail("METHOD_NOT_ALLOWED", 405); }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10000);
    const onDisconnect = () => controller.abort();
    req.signal.addEventListener("abort", onDisconnect, { once: true });
    if (req.signal.aborted) controller.abort();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const auth = req.headers.get("Authorization");
      if (!auth || !/^Bearer [^\s]+$/.test(auth) || auth.length > 8192) return fail("UNAUTHENTICATED", 401);
      const jwt = auth.slice(7);
      const actor = await abortable(deps.authenticate(jwt, controller.signal), controller.signal);
      if (!actor || !UUID.test(actor)) return fail("UNAUTHENTICATED", 401);
      if (new URL(req.url).search) return fail("INVALID_REQUEST", 400);
      if (req.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return fail("UNSUPPORTED_MEDIA_TYPE", 415);
      }
      // Bounded streaming read; do not trust Content-Length.
      reader = req.body?.getReader();
      if (!reader) return fail("INVALID_REQUEST", 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await abortable(reader.read(), controller.signal);
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { void reader.cancel().catch(() => {}); return fail("REQUEST_TOO_LARGE", 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body: Record<string, unknown>;
      try {
        const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("INVALID_REQUEST", 400);
        body = parsed;
      } catch { return fail("INVALID_REQUEST", 400); }
      const action = body.action;
      if (action !== "create" && action !== "list" && action !== "revoke") return fail("INVALID_REQUEST", 400);
      const allowed = action === "create" ? ["action", "name"] : action === "revoke"
        ? ["action", "id"] : ["action", "page", "limit"];
      if (Object.keys(body).some((key) => !allowed.includes(key))) return fail("INVALID_REQUEST", 400);
      const args: Record<string, unknown> = {};
      if (action === "create") {
        if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 100) {
          return fail("INVALID_REQUEST", 400);
        }
        args.p_name = body.name.trim();
      } else if (action === "revoke") {
        if (typeof body.id !== "string" || !UUID.test(body.id)) return fail("INVALID_REQUEST", 400);
        args.p_id = body.id;
      } else {
        const page = body.page ?? 1;
        const limit = body.limit ?? 20;
        if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > 10000 ||
            !Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100) return fail("INVALID_REQUEST", 400);
        args.p_page = page;
        args.p_limit = limit;
      }
      const result = await abortable(deps.execute(jwt, action, args, controller.signal), controller.signal);
      if (result.error) {
        const code = result.error.code;
        if (code === "42501") return fail("FORBIDDEN", 403);
        if (code === "P0002") return fail("NOT_FOUND", 404);
        if (code === "22023") return fail("INVALID_REQUEST", 400);
        if (code === "P0429") return fail("ISSUANCE_LIMIT", 429);
        if (code === "55P03" || code === "57014") return fail("TEMPORARILY_UNAVAILABLE", 503);
        return fail("INTERNAL_ERROR", 500);
      }
      if (action === "list") {
        if (!Array.isArray(result.data)) throw new Error("Invalid RPC result");
        return reply({ data: result.data.map(metadata), pagination: { page: args.p_page, limit: args.p_limit } });
      }
      if (action === "create") {
        const created = result.data as { data?: unknown; secret?: unknown } | null;
        if (!created || typeof created.secret !== "string" || !/^stk_[A-Za-z0-9_-]{43}$/.test(created.secret)) {
          throw new Error("Invalid issuance result");
        }
        return reply({ data: metadata(created.data), secret: created.secret }, 201);
      }
      return reply({ data: metadata(result.data) });
    } catch {
      // Never log JWTs, request bodies, RPC diagnostics, hashes or generated secrets.
      return fail(controller.signal.aborted ? "REQUEST_TIMEOUT" : "INTERNAL_ERROR", controller.signal.aborted ? 504 : 500);
    } finally {
      clearTimeout(timer);
      req.signal.removeEventListener("abort", onDisconnect);
      if (controller.signal.aborted) void reader?.cancel().catch(() => {});
    }
  };
}
