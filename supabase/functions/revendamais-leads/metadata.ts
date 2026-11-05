/** Receipt-only metadata. Unknown authorship is never a customer message. */
export type LeadMetadata = Readonly<{
  deliveryAttemptId?: string | null;
  dealerId?: string | null;
  interactionLeadIds?: readonly (string | null)[];
  // Legacy diagnostic hint only. Never used alone for association.
  sourceLeadIdHint?: string | null;
  channelId: string | null;
  channelName: string | null;
  createdAt: string | null;
  // Presence only: never a digest/preview of text whose retention is not approved.
  unknownTextPresent?: boolean;
  unknownInteraction: Readonly<{
    text: string;
    sourceIndex: number;
    createdAt: string | null;
    authorship: "unknown";
  }> | null;
}>;
