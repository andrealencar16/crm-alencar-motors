import { InvalidQuery, parseQuery, queryArgs } from "./query.ts";
import { object, photos, vehicle } from "./dto.ts";

export type RpcResult = { data: unknown; error: { code?: string } | null };
export type Dependencies = {
  read: (args: Record<string, unknown>, signal: AbortSignal) => Promise<RpcResult>;
  allowedOrigins: string[];
  timeoutMs?: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Vary": "Origin", "X-Content-Type-Options": "nosniff" });
    const requestId = crypto.randomUUID();
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    const fail = (code: string, message: string, status: number) => reply({ error: { code, message, request_id: requestId } }, status);
    const origin = req.headers.get("Origin");
    if (origin && deps.allowedOrigins.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, x-client-info, accept");
    if (req.method !== "GET" && req.method !== "OPTIONS") {
      headers.set("Allow", "GET, OPTIONS");
      return fail("METHOD_NOT_ALLOWED", "Método não permitido.", 405);
    }
    if (origin && !deps.allowedOrigins.includes(origin)) return fail("ORIGIN_NOT_ALLOWED", "Origem não permitida.", 403);
    const url = new URL(req.url);
    // Exact logical path, with optional Supabase gateway prefix. No loose split indexes.
    const route = /^\/(?:functions\/v1\/)?stock-api\/v1\/vehicles(?:\/([^/]+)(\/photos)?)?$/.exec(url.pathname);
    if (!route) return fail("NOT_FOUND", "Recurso não encontrado.", 404);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const auth = req.headers.get("Authorization");
    if (!auth || !/^Bearer stk_[A-Za-z0-9_-]{43}$/.test(auth)) {
      return fail("UNAUTHENTICATED", "Credencial inválida.", 401);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 10000);
    const disconnect = () => controller.abort();
    req.signal.addEventListener("abort", disconnect, { once: true });
    if (req.signal.aborted) controller.abort();
    let onAbort: () => void = () => {};
    try {
      const resource = route[2] ? "photos" : route[1] ? "detail" : "list";
      if (route[1] && !uuid.test(route[1])) throw new InvalidQuery();
      const id = route[1]?.toLowerCase();
      if (resource !== "list" && url.search) throw new InvalidQuery();
      const q = parseQuery(url.searchParams);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(auth.slice(7)));
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
      const args = { p_key_hash: hash, p_resource: resource, ...(id ? { p_id: id } : {}), ...queryArgs(q) };
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("deadline"));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      });
      const result = await Promise.race([deps.read(args, controller.signal), aborted]);
      if (result.error) {
        switch (result.error.code) {
          case "P0401": return fail("UNAUTHENTICATED", "Credencial inválida.", 401);
          case "42501": return fail("FORBIDDEN", "Permissão insuficiente.", 403);
          case "P0002": return fail("NOT_FOUND", "Recurso não encontrado.", 404);
          case "22023": return fail("INVALID_QUERY", "Parâmetros inválidos.", 400);
          case "P0429": return fail("RATE_LIMITED", "Limite de requisições excedido.", 429);
          case "57014": case "55P03": return fail("UNAVAILABLE", "Serviço temporariamente indisponível.", 503);
          default: return fail("INTERNAL_ERROR", "Não foi possível processar a solicitação.", 500);
        }
      }
      const envelope = object(result.data);
      if (resource === "photos") {
        const row = object(envelope.data);
        if (row.vehicle_id !== id) throw new Error("Invalid photo response");
        return reply({ data: { vehicle_id: row.vehicle_id, fotos: photos(row.fotos) } });
      }
      if (resource === "detail") {
        const row = vehicle(envelope.data);
        if (row.id !== id) throw new Error("Invalid detail response");
        return reply({ data: row });
      }
      const pagination = object(envelope.pagination);
      if (!Array.isArray(envelope.data) || envelope.data.length > q.limit ||
          pagination.page !== q.page || pagination.limit !== q.limit || typeof pagination.has_more !== "boolean") {
        throw new Error("Invalid list response");
      }
      return reply({ data: envelope.data.map(vehicle), pagination: { page: q.page, limit: q.limit, has_more: pagination.has_more } });
    } catch (error) {
      if (error instanceof InvalidQuery) return fail("INVALID_QUERY", "Parâmetros inválidos.", 400);
      return fail(controller.signal.aborted ? "UNAVAILABLE" : "INTERNAL_ERROR",
        "Não foi possível processar a solicitação.", controller.signal.aborted ? 503 : 500);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      req.signal.removeEventListener("abort", disconnect);
    }
  };
}
