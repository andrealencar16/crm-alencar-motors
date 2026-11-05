import type { PendingRevendaMaisLeads, RevendaMaisApproval } from "./revendamais-review-contract.ts";

// Narrow bridge until generated database types include the homologated RPCs.
// The caller supplies the existing authenticated Supabase client, never an admin key.
export type ReviewTransport = {
  rpc(name: "get_pending_revendamais_leads" | "approve_revendamais_lead",
    args: { p_limit: number; p_offset: number } | { p_receipt_id: string }): PromiseLike<{
      data: unknown; error: { code?: string } | null;
    }>;
};
export class ReviewUnavailable extends Error {}
const identities = new Set(["consistent", "empty", "incomplete", "ambiguous", "unscoped"]);
const blockers = new Set(["retry_scope_conflict", "review_expired", "insufficient_contact", "processed_group_conflict"]);
const conflicts = new Set([...blockers, "processed_links_missing", "ambiguous_contact", "missing_name", "pipeline_not_unique", "stage_not_unique"]);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function parsePendingReview(data: unknown): PendingRevendaMaisLeads {
  if (!object(data) || !integer(data.total) || !Array.isArray(data.items) || data.items.length > 50 || data.items.length > (data.total as number)) throw new Error("invalid_response");
  const items = data.items.map(item => {
    if (!object(item) || !uuid(item.receipt_id) || !integer(item.attempt_count) || (item.attempt_count as number) < 1
      || !identities.has(item.identity_status as string) || !(item.approval_blocker === null || blockers.has(item.approval_blocker as string))
      || typeof item.received_at !== "string" || !Number.isFinite(Date.parse(item.received_at))) throw new Error("invalid_response");
    const fields = ["name", "phone", "email", "title", "portal", "channel_name", "source_created_at"] as const;
    for (const field of fields) if (item[field] !== null && typeof item[field] !== "string") throw new Error("invalid_response");
    // Explicit allowlist: unexpected text/administrative fields never reach UI state.
    return { receipt_id: item.receipt_id, name: item.name, phone: item.phone, email: item.email,
      title: item.title, portal: item.portal, channel_name: item.channel_name, source_created_at: item.source_created_at,
      received_at: item.received_at, attempt_count: item.attempt_count, identity_status: item.identity_status,
      approval_blocker: item.approval_blocker } as PendingRevendaMaisLeads["items"][number];
  });
  if (new Set(items.map(i => i.receipt_id)).size !== items.length) throw new Error("invalid_response");
  return { total: data.total as number, items };
}
export function parseReviewApproval(data: unknown): RevendaMaisApproval {
  if (!object(data)) throw new Error("invalid_response");
  if ((data.status === "approved" || data.status === "already_processed") && uuid(data.contact_id) && uuid(data.deal_id)) {
    return { status: data.status, contact_id: data.contact_id, deal_id: data.deal_id };
  }
  if (data.status === "conflict" && conflicts.has(data.code as string)) return { status: "conflict", code: data.code } as RevendaMaisApproval;
  throw new Error("invalid_response");
}
async function call(transport: ReviewTransport, name: Parameters<ReviewTransport["rpc"]>[0], args: Parameters<ReviewTransport["rpc"]>[1]) {
  const { data, error } = await transport.rpc(name, args);
  if (error?.code === "PGRST202" || error?.code === "42883") throw new ReviewUnavailable("unavailable");
  if (error) throw new Error("request_failed");
  return data;
}
export async function getPendingReview(transport: ReviewTransport, offset = 0) {
  if (!integer(offset)) throw new Error("invalid_offset");
  return parsePendingReview(await call(transport, "get_pending_revendamais_leads", { p_limit: 50, p_offset: offset }));
}
export async function approvePendingReview(transport: ReviewTransport, receiptId: string) {
  if (!uuid(receiptId)) throw new Error("invalid_receipt");
  return parseReviewApproval(await call(transport, "approve_revendamais_lead", { p_receipt_id: receiptId }));
}
export const reviewConflictMessage: Record<Extract<RevendaMaisApproval, { status: "conflict" }>["code"], string> = {
  retry_scope_conflict: "Há divergências entre as tentativas deste lead. A aprovação foi bloqueada.",
  review_expired: "O prazo de revisão expirou. Solicite orientação ao administrador.",
  insufficient_contact: "Faltam dados de contato ou o título do interesse para aprovar.",
  processed_group_conflict: "Existem resultados conflitantes para este grupo. Solicite revisão ao administrador.",
  processed_links_missing: "Os registros vinculados não estão disponíveis. Solicite revisão ao administrador.",
  ambiguous_contact: "Mais de um contato ou dados conflitantes foram encontrados. Nenhum negócio foi criado nesta aprovação.",
  missing_name: "É necessário informar o nome antes de criar um novo contato.",
  pipeline_not_unique: "O pipeline Venda PF precisa ser configurado pelo administrador.",
  stage_not_unique: "A etapa Lead do pipeline Venda PF precisa ser configurada pelo administrador.",
};
