import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function listAllUsers(admin: ReturnType<typeof createClient>) {
  const all: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Não autenticado" }, 401);
    const caller = { id: claimsData.claims.sub as string };

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: org } = await admin.from("organizations").select("id").order("created_at").limit(1).single();
    if (!org) return json({ error: "Organização não encontrada" }, 500);
    const { data: callerRole } = await admin.from("user_roles").select("role")
      .eq("user_id", caller.id).eq("org_id", org.id).maybeSingle();
    if (!callerRole || !["owner", "admin"].includes(callerRole.role)) return json({ error: "Sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "search") {
      const q = String(body.query ?? "").trim().toLowerCase();
      if (q.length < 2 || q.length > 200) return json({ error: "Digite ao menos 2 caracteres" }, 400);
      const { data: roles } = await admin.from("user_roles").select("user_id").eq("org_id", org.id);
      const memberIds = new Set((roles ?? []).map((r) => r.user_id));
      const users = (await listAllUsers(admin))
        .filter((u) => !memberIds.has(u.id) && (u.email ?? "").toLowerCase().includes(q))
        .slice(0, 20);
      const ids = users.map((u) => u.id);
      const { data: profs } = ids.length
        ? await admin.from("profiles").select("id, name").in("id", ids)
        : { data: [] as any[] };
      return json({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: profs?.find((p) => p.id === u.id)?.name ?? null,
          confirmed: !!u.email_confirmed_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        })),
      });
    }

    if (action === "members-meta") {
      const { data: roles } = await admin.from("user_roles").select("user_id").eq("org_id", org.id);
      const ids = new Set((roles ?? []).map((r) => r.user_id));
      const users = (await listAllUsers(admin)).filter((u) => ids.has(u.id));
      return json({
        meta: Object.fromEntries(users.map((u) => [u.id, {
          last_sign_in_at: u.last_sign_in_at ?? null,
          confirmed: !!u.email_confirmed_at,
        }])),
      });
    }

    if (action === "delete-permanent") {
      const userId = String(body.user_id ?? "");
      const transferTo = String(body.transfer_to ?? caller.id);
      if (!UUID.test(userId) || !UUID.test(transferTo)) return json({ error: "Parâmetros inválidos" }, 400);

      const { data: existing } = await admin.auth.admin.getUserById(userId);
      if (!existing?.user) return json({ success: true, already_deleted: true });

      // Step 1 (transactional, authorization re-checked in the database with the caller's session):
      // transfer history, remove memberships. Safe to retry.
      const { data: transferred, error: prepErr } = await userClient.rpc("prepare_user_deletion", {
        p_user_id: userId, p_transfer_to: transferTo,
      });
      if (prepErr) return json({ error: prepErr.message }, prepErr.code === "42501" ? 403 : 400);

      // Step 2: delete the Auth identity (profile cascades). If this fails, the user is already
      // detached from the organization (consistent state) and the operation can be retried.
      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) {
        return json({
          error: `Histórico transferido e acesso removido, mas a conta não pôde ser excluída: ${delErr.message}. Tente novamente.`,
          partial: true,
        }, 502);
      }
      await admin.from("audit_logs").insert({
        org_id: org.id, user_id: caller.id, action: "user_deleted", entity_type: "user", entity_id: userId,
        old_values: { email: existing.user.email },
      });
      return json({ success: true, transferred });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
