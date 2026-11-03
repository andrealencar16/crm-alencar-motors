import { supabase } from "@/integrations/supabase/client";

export interface PersistedOnboardingState {
  orgId: string | null;
  stepData: Record<string, any>;
  completedSteps: Set<string>;
}

export async function loadPersistedOnboardingState(userId: string, fallbackOrgId: string | null): Promise<PersistedOnboardingState> {
  const stepData: Record<string, any> = {};
  const completedSteps = new Set<string>();
  let orgId = fallbackOrgId;

  if (!orgId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    orgId = profile?.org_id ?? null;
  }

  if (!orgId) {
    return { orgId: null, stepData, completedSteps };
  }

  const [{ data: org }, { data: pipeline }, { data: integrations }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, settings")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("pipelines")
      .select("id, name, currency, is_default, created_at")
      .eq("org_id", orgId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("integration_configs")
      .select("provider, config")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .in("provider", ["anthropic", "resend", "slack"]),
  ]);

  if (org) {
    const settings = (org.settings ?? {}) as Record<string, any>;
    stepData.orgName = org.name;
    stepData.currency = settings.default_currency ?? "BRL";
    // Company step só vira "completed" quando o usuário salvou os dados automotivos.
    if (settings.cnpj && Array.isArray(settings.marcas_trabalhadas) && settings.marcas_trabalhadas.length > 0) {
      completedSteps.add("company");
      stepData.hasWorkshop = !!settings.tem_oficina;
    } else if (settings.segment) {
      // Org legada (não-automotivo) — marcar como completed pra não travar resume.
      completedSteps.add("company");
    }
    if (settings.consents?.terms && settings.consents?.ai) {
      completedSteps.add("termos");
    }
  }

  if (pipeline) {
    const { count } = await supabase
      .from("pipeline_stages")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", pipeline.id);

    stepData.pipelineName = pipeline.name;
    stepData.stageCount = count ?? 0;
    completedSteps.add("pipeline");
  }

  for (const integration of integrations ?? []) {
    const config = (integration.config ?? {}) as Record<string, any>;

    if (integration.provider === "anthropic") {
      stepData.aiConfigured = true;
      completedSteps.add("ai");
    }

    if (integration.provider === "resend") {
      stepData.emailConfigured = true;
      stepData.emailFrom = config.from_email ?? "";
      completedSteps.add("email");
    }

    if (integration.provider === "slack") {
      stepData.slackConfigured = true;
      stepData.slackWorkspace = config.workspace ?? "Slack";
      completedSteps.add("slack");
    }
  }

  return { orgId, stepData, completedSteps };
}

export function getResumeStep(savedStep: number | null | undefined, completedSteps: Set<string>) {
  // STEPS = [welcome(0), company(1), pipeline(2), termos(3), ai(4), email(5), slack(6), complete(7)]
  if (completedSteps.size === 0) return 0;

  const savedIndex = Math.min(7, Math.max(0, (savedStep ?? 1) - 1));

  if (!completedSteps.has("company")) return 1;
  if (!completedSteps.has("pipeline")) return 2;
  if (!completedSteps.has("termos")) return 3;

  let resume = Math.max(savedIndex, 4);

  if (resume === 4 && completedSteps.has("ai")) resume = 5;
  if (resume === 5 && completedSteps.has("email")) resume = 6;
  if (resume === 6 && completedSteps.has("slack")) resume = 7;

  return resume;
}