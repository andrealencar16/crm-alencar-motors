/** Receipt-only metadata. Unknown authorship is never a customer message. */
export type LeadMetadata = Readonly<{
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
