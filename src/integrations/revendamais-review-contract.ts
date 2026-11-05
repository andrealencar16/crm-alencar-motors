/** Public RPC DTOs only. No service-role key, raw receipt or grouping digest. */
export type PendingRevendaMaisLead = {
  receipt_id: string;
  name: string | null; phone: string | null; email: string | null; title: string | null;
  portal: string | null; channel_name: string | null;
  source_created_at: string | null; // Original wall-clock text, timezone unspecified.
  received_at: string; // Server timestamptz; do not substitute for original date.
  attempt_count: number;
  identity_status: "consistent" | "empty" | "incomplete" | "ambiguous" | "unscoped";
  approval_blocker: "retry_scope_conflict" | "review_expired" | "insufficient_contact" | "processed_group_conflict" | null;
};
export type PendingRevendaMaisLeads = { total: number; items: PendingRevendaMaisLead[] };
export type RevendaMaisApproval =
  | { status: "approved" | "already_processed"; contact_id: string; deal_id: string }
  | { status: "conflict"; code: "processed_group_conflict" | "processed_links_missing" |
      "retry_scope_conflict" | "review_expired" | "insufficient_contact" | "ambiguous_contact" |
      "missing_name" | "pipeline_not_unique" | "stage_not_unique" };
