import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { createHandler } from "./handler.ts";
import { createUserBackend } from "./user-backend.ts";

// ANON identifies the project; Authorization carries the user's JWT.
// No service-role credential or client is used.
const backend = createUserBackend((jwt, signal) => createClient(
  Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
      fetch: (input, init) => fetch(input, { ...init, signal }),
    },
  },
));

Deno.serve(createHandler({
  ...backend,
  allowedOrigins: (Deno.env.get("STOCK_KEY_ADMIN_ALLOWED_ORIGINS") ?? "")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
}));
