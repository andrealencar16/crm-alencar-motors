/** Receipt-only metadata. Unknown authorship is never a customer message. */
export type LeadMetadata = Readonly<{
  channelId: string | null;
  channelName: string | null;
  createdAt: string | null;
  unknownInteraction: Readonly<{
    text: string;
    sourceIndex: number;
    createdAt: string | null;
    authorship: "unknown";
  }> | null;
}>;
