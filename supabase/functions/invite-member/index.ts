import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: callerUser }, error: callerError } = await anonClient.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = callerUser.id;

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = body.role === "admin" ? "admin" : "member";
    const org_id = body.org_id;

    if (!email || !org_id) {
      return new Response(JSON.stringify({ error: "Email and org_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is admin/owner
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRole } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("org_id", org_id)
      .single();

    if (!callerRole || (callerRole.role !== "owner" && callerRole.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingInvite } = await serviceClient
      .from("invitations").select("id").eq("org_id", org_id).ilike("email", email)
      .is("accepted_at", null).maybeSingle();
    if (existingInvite) {
      return new Response(JSON.stringify({ error: "Já existe um convite pendente para este email" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Is there already an account with this email?
    const { data: existingProfile } = await serviceClient
      .from("profiles").select("id, org_id").ilike("email", email).maybeSingle();

    if (existingProfile?.org_id === org_id) {
      const { data: existingRole } = await serviceClient
        .from("user_roles").select("id").eq("user_id", existingProfile.id).eq("org_id", org_id).maybeSingle();
      if (existingRole) {
        return new Response(JSON.stringify({ error: "Este usuário já é membro da organização" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let invitedUser = null;
    let existingUser = false;
    const { data: inviteData, error: inviteError } =
      await serviceClient.auth.admin.inviteUserByEmail(email, {
        data: { org_id, role },
      });

    if (inviteError) {
      const msg = inviteError.message?.toLowerCase() ?? "";
      const alreadyExists = msg.includes("already been registered") || msg.includes("already registered") ||
        (inviteError as any).code === "email_exists";
      if (!alreadyExists) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Account already exists: just record the invitation; the user accepts it after signing in.
      existingUser = true;
    } else {
      invitedUser = inviteData.user;
    }

    // Record invitation
    const { error: insertError } = await serviceClient.from("invitations").insert({
      org_id,
      email,
      role,
      invited_by: callerId,
    });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, existing_user: existingUser, user: invitedUser }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
