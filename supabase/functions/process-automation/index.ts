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

  const start = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { automation_id, trigger_payload, org_id, retry_count = 0 } = body;

    if (!automation_id || !org_id) {
      return new Response(JSON.stringify({ error: "Missing automation_id or org_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch automation
    const { data: auto, error: autoErr } = await supabase
      .from("automations")
      .select("*")
      .eq("id", automation_id)
      .eq("org_id", org_id)
      .single();

    if (autoErr || !auto) {
      return new Response(JSON.stringify({ error: "Automation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!auto.is_active) {
      return new Response(JSON.stringify({ error: "Automation is not active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Evaluate conditions (simplified)
    const conditions = auto.conditions || [];
    let conditionsMet = true;
    for (const cond of conditions) {
      const fieldVal = trigger_payload?.[cond.field];
      switch (cond.operator) {
        case "equals":
          if (String(fieldVal) !== String(cond.value)) conditionsMet = false;
          break;
        case "not_equals":
          if (String(fieldVal) === String(cond.value)) conditionsMet = false;
          break;
        case "greater_than":
          if (Number(fieldVal) <= Number(cond.value)) conditionsMet = false;
          break;
        case "less_than":
          if (Number(fieldVal) >= Number(cond.value)) conditionsMet = false;
          break;
        case "contains":
          if (!String(fieldVal).includes(String(cond.value))) conditionsMet = false;
          break;
        case "not_contains":
          if (String(fieldVal).includes(String(cond.value))) conditionsMet = false;
          break;
      }
      if (!conditionsMet) break;
    }

    if (!conditionsMet) {
      await supabase.from("automation_logs").insert({
        org_id,
        automation_id,
        status: "skipped",
        trigger_payload,
        actions_result: { reason: "Conditions not met" },
        duration_ms: Date.now() - start,
      });
      return new Response(JSON.stringify({ status: "skipped", reason: "Conditions not met" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Execute actions sequentially
    const actionsResult: any[] = [];
    for (const action of auto.actions || []) {
      try {
        const result = await executeAction(supabase, org_id, action, trigger_payload);
        actionsResult.push({ type: action.type, status: "ok", result });
      } catch (err: any) {
        actionsResult.push({ type: action.type, status: "error", error: err.message });
        // Continue executing remaining actions
      }
    }

    const hasErrors = actionsResult.some((r) => r.status === "error");
    const duration = Date.now() - start;

    // Update automation stats
    await supabase
      .from("automations")
      .update({
        run_count: (auto.run_count || 0) + 1,
        error_count: hasErrors ? (auto.error_count || 0) + 1 : auto.error_count,
        last_run_at: new Date().toISOString(),
      })
      .eq("id", automation_id);

    // Log execution
    await supabase.from("automation_logs").insert({
      org_id,
      automation_id,
      status: hasErrors ? "partial_error" : "success",
      trigger_payload,
      actions_result: actionsResult,
      duration_ms: duration,
      error_message: hasErrors
        ? actionsResult.filter((r) => r.status === "error").map((r) => r.error).join("; ")
        : null,
    });

    // Retry on full failure
    if (hasErrors && actionsResult.every((r) => r.status === "error") && retry_count < 3) {
      // Could schedule a retry here via pg_cron or delayed fetch
      console.log(`Automation ${automation_id} failed, retry ${retry_count + 1}/3`);
    }

    return new Response(JSON.stringify({ status: hasErrors ? "partial_error" : "success", actions: actionsResult, duration_ms: duration }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const duration = Date.now() - start;
    return new Response(JSON.stringify({ error: err.message, duration_ms: duration }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeAction(supabase: any, orgId: string, action: any, payload: any) {
  const cfg = action.config || {};

  switch (action.type) {
    case "create_task": {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (cfg.due_days || 1));
      const { error } = await supabase.from("activities").insert({
        org_id: orgId,
        type: "task",
        title: cfg.title || "Tarefa automática",
        body: cfg.body || `Criada pela automação. Prioridade: ${cfg.priority || "medium"}`,
        due_date: dueDate.toISOString(),
        deal_id: payload?.deal_id || null,
        contact_id: payload?.contact_id || null,
        company_id: payload?.company_id || null,
      });
      if (error) throw new Error(`create_task: ${error.message}`);
      return { created: true };
    }

    case "create_note": {
      const { error } = await supabase.from("activities").insert({
        org_id: orgId,
        type: "note",
        title: "Nota automática",
        body: cfg.body || "Nota criada por automação",
        deal_id: payload?.deal_id || null,
        contact_id: payload?.contact_id || null,
      });
      if (error) throw new Error(`create_note: ${error.message}`);
      return { created: true };
    }

    case "move_deal_stage": {
      if (!payload?.deal_id) throw new Error("No deal_id in payload");
      // Find stage by name
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id,name")
        .eq("org_id", orgId)
        .ilike("name", `%${cfg.to_stage}%`)
        .limit(1);
      const stageId = stages?.[0]?.id;
      if (!stageId) throw new Error(`Stage '${cfg.to_stage}' not found`);
      const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", payload.deal_id);
      if (error) throw new Error(`move_deal_stage: ${error.message}`);
      return { moved_to: stageId };
    }

    case "assign_owner": {
      const entityTable = payload?.deal_id ? "deals" : payload?.contact_id ? "contacts" : null;
      const entityId = payload?.deal_id || payload?.contact_id;
      if (!entityTable || !entityId) throw new Error("No entity to assign");

      let ownerId = cfg.user_id;
      if (cfg.strategy === "round_robin") {
        const { data: members } = await supabase.from("profiles").select("id").eq("org_id", orgId);
        if (members?.length) {
          ownerId = members[Math.floor(Math.random() * members.length)].id;
        }
      }
      if (!ownerId) throw new Error("No owner to assign");
      const { error } = await supabase.from(entityTable).update({ owner_id: ownerId }).eq("id", entityId);
      if (error) throw new Error(`assign_owner: ${error.message}`);
      return { assigned: ownerId };
    }

    case "add_tag": {
      if (!cfg.tag_name) throw new Error("No tag name");
      // Find or create tag
      let { data: existing } = await supabase.from("tags").select("id").eq("org_id", orgId).eq("name", cfg.tag_name).single();
      if (!existing) {
        const { data: created, error } = await supabase.from("tags").insert({ org_id: orgId, name: cfg.tag_name }).select("id").single();
        if (error) throw new Error(`add_tag create: ${error.message}`);
        existing = created;
      }
      if (payload?.deal_id) {
        await supabase.from("deal_tags").insert({ deal_id: payload.deal_id, tag_id: existing.id });
      } else if (payload?.contact_id) {
        await supabase.from("contact_tags").insert({ contact_id: payload.contact_id, tag_id: existing.id });
      }
      return { tag_added: cfg.tag_name };
    }

    case "call_webhook": {
      if (!cfg.url) throw new Error("No webhook URL");
      const resp = await fetch(cfg.url, {
        method: cfg.method || "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, automation_action: action.type }),
      });
      const text = await resp.text();
      return { status: resp.status, body: text.slice(0, 500) };
    }

    case "wait": {
      // In a real system, this would schedule the next action
      // For now, just log the delay
      return { delay_days: cfg.days || 1, note: "Delay logged; real scheduling requires pg_cron" };
    }

    case "notify_user":
      // Placeholder: in production, use push/email/slack
      return { notified: true, message: cfg.message };

    case "send_whatsapp": {
      // Determine phone number
      let phone = cfg.phone_override || "";
      if (cfg.phone_source === "contact" && payload?.contact_id) {
        const { data: contact } = await supabase.from("contacts").select("phone, first_name, last_name").eq("id", payload.contact_id).single();
        if (!contact?.phone) throw new Error("Contato sem telefone cadastrado");
        phone = contact.phone;
        // Replace message variables
        let msg = cfg.message || "";
        msg = msg.replace(/\{\{nome\}\}/g, `${contact.first_name || ""} ${contact.last_name || ""}`.trim());
        cfg.message = msg;
      }
      if (!phone) throw new Error("Nenhum telefone definido para envio");

      // Find default whatsapp instance
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("id, server_url, api_key, instance_name")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .single();

      if (!instance) throw new Error("Nenhuma instância WhatsApp ativa encontrada");

      // Send via Evolution API
      const sendUrl = `${instance.server_url}/message/sendText/${instance.instance_name}`;
      const resp = await fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: instance.api_key,
        },
        body: JSON.stringify({
          number: phone.replace(/\D/g, ""),
          text: cfg.message || "Mensagem automática",
        }),
      });

      const respText = await resp.text();
      if (!resp.ok) throw new Error(`WhatsApp send failed [${resp.status}]: ${respText.slice(0, 200)}`);

      // Log message in whatsapp_messages
      // Find or create conversation
      const normalizedPhone = phone.replace(/\D/g, "");
      let { data: conv } = await supabase
        .from("whatsapp_conversations")
        .select("id")
        .eq("org_id", orgId)
        .eq("phone_number", normalizedPhone)
        .limit(1)
        .single();

      if (!conv) {
        const { data: newConv } = await supabase
          .from("whatsapp_conversations")
          .insert({
            org_id: orgId,
            phone_number: normalizedPhone,
            instance_id: instance.id,
            instance_name: instance.instance_name,
            status: "open",
            mode: "human",
            last_message: cfg.message,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        conv = newConv;
      }

      if (conv) {
        await supabase.from("whatsapp_messages").insert({
          org_id: orgId,
          conversation_id: conv.id,
          direction: "outbound",
          content: cfg.message,
          type: "text",
          status: "sent",
          is_ai: false,
        });
      }

      return { sent: true, phone: normalizedPhone };
    }

    case "send_email_template":
      return { template_id: cfg.template_id, note: "Email sending requires email integration" };

    case "remove_tag":
      return { tag_removed: cfg.tag_name, note: "Remove tag not fully implemented" };

    default:
      return { note: `Action type '${action.type}' not implemented` };
  }
}
