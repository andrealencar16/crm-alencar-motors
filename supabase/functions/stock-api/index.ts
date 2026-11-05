import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  allowedOrigins: (Deno.env.get("STOCK_API_ALLOWED_ORIGINS") ?? "")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
  read: async (args, signal) => {
    // Custom stock secrets are NOT JWTs. Never forward them to PostgREST.
    // anon has EXECUTE on one authenticated-by-hash RPC, no new table grants.
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal }) },
    });
    return await client.rpc("stock_catalog_read", args);
  },
}));
