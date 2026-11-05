import { normalizeLead } from "./lead.ts";
import type { Lead, LeadAdapter } from "./lead.ts";
import type { LeadMetadata } from "./metadata.ts";

export type CommitResult =
  | { status: "created"; contactId: string; dealId: string }
  | { status: "duplicate"; contactId: string; dealId: string }
  | { status: "review"; receiptId: string };

/** Future implementation must resolve main_org_id() server-side, reject any
 * other organization, and atomically persist receipt + contact + deal + note.
 * review means a durable receipt awaiting review, NOT a discarded lead.
 * HTTP calls this interface through the lazy server-only RPC adapter.
 */
export interface LeadPersistence {
  commit(command: Readonly<{
    provider: "revendamais";
    lead: Lead;
    metadata?: LeadMetadata;
    identity: "confirmed_external_id" | "manual_review";
  }>): Promise<CommitResult>;
}

export type ProcessingResult = CommitResult | { status: "invalid" } | { status: "retry" };

export function createLeadProcessor(deps: {
  adapter: LeadAdapter;
  persistence: LeadPersistence;
  metadata?: LeadMetadata;
  // Deprecated and ignored. No stable Revenda Mais lead identifier is confirmed.
  externalIdIsStable: boolean;
}) {
  return async (raw: unknown): Promise<ProcessingResult> => {
    const normalized = normalizeLead(raw, deps.adapter);
    if (!normalized.ok) return { status: "invalid" };
    try {
      const result = await deps.persistence.commit({
        provider: "revendamais",
        lead: Object.freeze({ ...normalized.lead, externalId: null }),
        metadata: deps.metadata,
        identity: "manual_review",
      });
      if (result?.status === "review" && typeof result.receiptId === "string" && result.receiptId) return { status: "review", receiptId: result.receiptId };
      if ((result?.status === "created" || result?.status === "duplicate") &&
        typeof result.contactId === "string" && result.contactId && typeof result.dealId === "string" && result.dealId) {
        return { status: result.status, contactId: result.contactId, dealId: result.dealId };
      }
      return { status: "retry" };
    } catch {
      // Do not log persistence/adapter exception messages or raw input.
      return { status: "retry" };
    }
  };
}
