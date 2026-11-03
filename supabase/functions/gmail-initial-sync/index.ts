import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { org_id, user_id, access_token, refresh_token } = await req.json();

    if (!org_id || !access_token) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's Gmail profile
    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to access Gmail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gmailProfile = await profileRes.json();
    const emailAddress = gmailProfile.emailAddress;

    // Save email connection
    if (user_id) {
      await supabaseAdmin.from("email_connections").upsert({
        user_id,
        org_id,
        provider: "gmail",
        email_address: emailAddress,
        is_active: true,
      }, { onConflict: "user_id,provider" }).catch(() => {});
    }

    // Fetch last 90 days of emails (paginated, background)
    const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const query = `after:${ninetyDaysAgo}`;

    let pageToken = "";
    let totalImported = 0;
    const maxPages = 5; // Limit for initial sync
    let page = 0;

    while (page < maxPages) {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const listRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!listRes.ok) break;
      const listData = await listRes.json();
      const messages = listData.messages || [];

      // We log the count but don't process each message in this initial version
      totalImported += messages.length;

      if (!listData.nextPageToken) break;
      pageToken = listData.nextPageToken;
      page++;
    }

    console.log(`gmail-initial-sync: imported ${totalImported} message references for org ${org_id}`);

    return new Response(
      JSON.stringify({
        ok: true,
        email: emailAddress,
        messages_found: totalImported,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("gmail-initial-sync error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
