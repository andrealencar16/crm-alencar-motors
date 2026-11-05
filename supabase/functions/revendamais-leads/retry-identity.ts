export type RetryIdentityStatus = "consistent" | "empty" | "incomplete" | "ambiguous";

/** Confirmed only for automatic redelivery of a submission; NOT opportunity ID. */
export function analyzeRetryLeadIds(ids: readonly (string | null)[]): {
  status: RetryIdentityStatus; leadId: string | null;
} {
  if (!ids.length) return { status: "empty", leadId: null };
  const valid = ids.filter((id): id is string => id !== null && /^[1-9][0-9]{0,39}$/.test(id));
  const distinct = new Set(valid);
  if (distinct.size > 1) return { status: "ambiguous", leadId: null };
  if (valid.length !== ids.length) return { status: "incomplete", leadId: null };
  return { status: "consistent", leadId: valid[0] };
}
