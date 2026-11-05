import type { CommitResult, LeadPersistence } from "./processing.ts";
import type { LeadMetadata } from "./metadata.ts";

// Inject a server-only service-role client. Never construct/export one in browser code.
export type ReceiptRpc = (name: "revendamais_commit_lead", args: {
  p_lead: Record<string, string | null>; p_identity_confirmed: boolean;
  p_metadata: LeadMetadata;
  p_unknown_text_retention_approved: boolean;
}) => Promise<{ data: unknown; error: unknown }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

export function createReceiptPersistence(rpc: ReceiptRpc, options: { externalIdentityConfirmed?: boolean; unknownTextRetentionApproved?: boolean } = {}): LeadPersistence {
  return {
    async commit(command): Promise<CommitResult> {
      try {
        if (command.provider !== "revendamais") throw new Error();
        const l = command.lead;
        const { data, error } = await rpc("revendamais_commit_lead", {
          p_lead: { name: l.name, phone: l.phone, email: l.email, title: l.title,
            firstMessage: l.firstMessage, portal: l.portal, externalId: null },
          p_identity_confirmed: false,
          p_metadata: {
            deliveryAttemptId: command.metadata?.deliveryAttemptId ?? null,
            dealerId: command.metadata?.dealerId ?? null,
            interactionLeadIds: command.metadata?.interactionLeadIds ? [...command.metadata.interactionLeadIds] : [],
            sourceLeadIdHint: command.metadata?.sourceLeadIdHint ?? null,
            channelId: command.metadata?.channelId ?? null,
            channelName: command.metadata?.channelName ?? null,
            createdAt: command.metadata?.createdAt ?? null,
            unknownTextPresent: command.metadata?.unknownTextPresent === true || !!command.metadata?.unknownInteraction,
            // Defense in depth: do not even send unapproved content to Postgres.
            unknownInteraction: options.unknownTextRetentionApproved === true && command.metadata?.unknownInteraction ? {
              text: command.metadata.unknownInteraction.text,
              sourceIndex: command.metadata.unknownInteraction.sourceIndex,
              createdAt: command.metadata.unknownInteraction.createdAt,
              authorship: "unknown",
            } : null,
          },
          p_unknown_text_retention_approved: options.unknownTextRetentionApproved === true,
        });
        if (error || !data || typeof data !== "object") throw new Error();
        const r = data as Record<string, unknown>;
        if (r.status === "review" && id(r.receiptId)) return { status: "review", receiptId: r.receiptId };
        // Current contract persists EVERY attempt for review. Reject a stale RPC
        // response that still treats the provider delivery ID as a business key.
        throw new Error();
      } catch {
        // Postgres errors may contain PII, SQL details or network credentials.
        throw new Error("lead_persistence_failed");
      }
    },
  };
}
