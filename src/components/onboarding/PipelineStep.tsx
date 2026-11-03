import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, Car, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OnboardingStepProps } from "./types";

// Espelho da função SQL seed_automotive_pipelines (apenas para preview visual).
const SALES_STAGES = [
  "Lead",
  "Qualificado",
  "Test Drive",
  "Proposta",
  "Financiamento/Pagamento",
  "Fechado-Ganho",
  "Fechado-Perdido",
];

const AFTERSALES_STAGES = ["Agendado", "Em serviço", "Aguardando peça", "Concluído"];

export function PipelineStep({ orgId, setCanContinue, setStepData, stepData }: OnboardingStepProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const hasWorkshop: boolean = !!stepData.hasWorkshop;

  useEffect(() => {
    if (!orgId) return;
    let active = true;
    void (async () => {
      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("name", "Venda PF")
        .maybeSingle();
      if (active && pipeline) {
        setSaved(true);
        setCanContinue(true);
        setStepData("pipelineName", pipeline.name);
      }
    })();
    return () => {
      active = false;
    };
  }, [orgId, setCanContinue, setStepData]);

  useEffect(() => {
    if (!saved) setCanContinue(false);
  }, [saved, setCanContinue]);

  const handleSubmit = useCallback(async () => {
    if (!orgId || loading) return;
    setLoading(true);
    try {
      const { error: pipeErr } = await supabase.rpc("seed_automotive_pipelines" as never, {
        p_org_id: orgId,
        p_tem_oficina: hasWorkshop,
      } as never);
      if (pipeErr) throw pipeErr;

      const { error: tagsErr } = await supabase.rpc("seed_automotive_tags" as never, { p_org_id: orgId } as never);
      if (tagsErr) throw tagsErr;

      setStepData("pipelineName", "Venda PF");
      setSaved(true);
      setCanContinue(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao criar pipelines", description: message, variant: "destructive" });
    }
    setLoading(false);
  }, [orgId, hasWorkshop, loading, setStepData, setCanContinue, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">Seus pipelines automotivos</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {saved
            ? "Pipelines criados com sucesso. Você pode editar a qualquer momento."
            : "Vamos criar dois fluxos prontos pra você. Personaliza depois sem dor."}
        </p>
      </div>

      <div className="space-y-3">
        <PipelinePreview
          icon={<Car className="h-5 w-5" />}
          title="Venda PF"
          subtitle="Do lead ao fechamento, focado em consumidor final"
          stages={SALES_STAGES}
          accent="primary"
        />
        {hasWorkshop && (
          <PipelinePreview
            icon={<Wrench className="h-5 w-5" />}
            title="Pós-venda"
            subtitle="Agendamentos da oficina e ordens de serviço"
            stages={AFTERSALES_STAGES}
            accent="muted"
          />
        )}
        {!hasWorkshop && (
          <p className="text-xs text-muted-foreground">
            Sem oficina própria — o pipeline de Pós-venda fica desativado. Você pode ativar depois em Configurações.
          </p>
        )}
      </div>

      <button
        onClick={saved ? undefined : handleSubmit}
        disabled={saved || loading || !orgId}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          saved
            ? "bg-muted text-muted-foreground cursor-default"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Criando pipelines...</>
        ) : saved ? (
          <><Check className="h-4 w-4" /> Pipelines prontos</>
        ) : (
          "Criar pipelines e continuar"
        )}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        Personalizo depois &nbsp;·&nbsp; você poderá editar stages, cores e probabilidades em Configurações
      </p>
    </div>
  );
}

function PipelinePreview({
  icon,
  title,
  subtitle,
  stages,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  stages: string[];
  accent: "primary" | "muted";
}) {
  const iconBg = accent === "primary" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${iconBg}`}>{icon}</div>
        <div className="flex-1">
          <div className="font-medium text-sm">{title}</div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {stages.map((s, i) => (
              <span key={s} className="contents">
                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                  {s}
                </span>
                {i < stages.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
