import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { org_id, visitor_id, event_type, page_url, page_title, referrer, metadata } = body;

    if (!org_id) return new Response("org_id required", { status: 400, headers: corsHeaders });

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Try to link visitor to contact by email
    let contactId: string | null = null;
    if (visitor_id && visitor_id.includes("@")) {
      const { data: contact } = await sb
        .from("contacts")
        .select("id,lead_score")
        .eq("org_id", org_id)
        .eq("email", visitor_id)
        .single();

      if (contact) {
        contactId = contact.id;
        // Increment lead score
        const points = event_type === "identify" ? 5 : event_type === "pageview" ? 1 : 10;
        await sb.from("contacts").update({
          lead_score: Math.min(100, (contact.lead_score || 0) + points),
        }).eq("id", contact.id);
      }
    }

    // Insert tracking event
    await sb.from("tracking_events").insert({
      org_id, visitor_id, event_type: event_type || "pageview",
      page_url, page_title, referrer, metadata: metadata || {},
      contact_id: contactId,
    });

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("tracking error:", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
