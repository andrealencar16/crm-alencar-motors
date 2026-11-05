import { createHandler } from "./handler.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createReceiptPersistence } from "./persistence.ts";

const identityConfirmed = Deno.env.get("REVENDAMAIS_EXTERNAL_ID_CONFIRMED") === "true";
const retentionApproved = Deno.env.get("REVENDAMAIS_UNKNOWN_TEXT_RETENTION_APPROVED") === "true";

Deno.serve(createHandler({
  secret: Deno.env.get("REVENDAMAIS_WEBHOOK_SECRET"),
  dealerId: Deno.env.get("REVENDAMAIS_DEALER_ID"),
  externalIdIsStable: identityConfirmed,
  unknownTextRetentionApproved: retentionApproved,
  persistenceFactory: Deno.env.get("REVENDAMAIS_INGESTION_ENABLED") === "true" ? (signal) => {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("persistence_unavailable");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return createReceiptPersistence(async (name, args) => {
      const { data, error } = await client.rpc(name, args).abortSignal(signal);
      return { data, error };
    }, { externalIdentityConfirmed: identityConfirmed, unknownTextRetentionApproved: retentionApproved });
  } : undefined,
}));
