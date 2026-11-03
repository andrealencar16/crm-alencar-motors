import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, Plus, Trash2, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

const DEFAULT_STAGES = [
  { name: "Prospecção", color: "#6366f1", probability: 10 },
  { name: "Qualificação", color: "#8b5cf6", probability: 30 },
  { name: "Proposta", color: "#f59e0b", probability: 50 },
  { name: "Negociação", color: "#ef4444", probability: 75 },
  { name: "Fechamento", color: "#22c55e", probability: 90 },
];

export function StepPipeline({ orgId, onComplete, setStepData }: SetupStepProps) {
  const { toast } = useToast();
  const [pipelineName, setPipelineName] = useState("Pipeline Principal");
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [saving, setSaving] = useState(false);
  const [alreadyCreated, setAlreadyCreated] = useState(false);

  // Idempotency: check if pipeline already exists for this org
  useEffect(() => {
    if (!orgId) return;
    supabase.from("pipelines").select("id").eq("org_id", orgId).limit(1).then(({ data }) => {
      if (data && data.length > 0) setAlreadyCreated(true);
    });
  }, [orgId]);

  const addStage = () => {
    setStages([...stages, { name: "", color: "#94a3b8", probability: 50 }]);
  };
  const removeStage = (idx: number) => {
    setStages(stages.filter((_, i) => i !== idx));
  };
  const updateStage = (idx: number, field: string, value: any) => {
    setStages(stages.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!orgId || !pipelineName.trim() || stages.length === 0) {
      toast({ title: "Preencha o nome e ao menos um estágio", variant: "destructive" });
      return;
    }
    if (alreadyCreated) {
      // Already created, just advance
      setStepData({ pipelineCreated: true, stageCount: stages.length });
      toast({ title: "Pipeline já existe, avançando!" });
      onComplete();
      return;
    }
    setSaving(true);
    const { data: pipeline } = await supabase.from("pipelines").insert({
      name: pipelineName, org_id: orgId, is_default: true, currency: "BRL",
    }).select("id").single();

    if (pipeline) {
      await supabase.from("pipeline_stages").insert(
        stages.map((s, i) => ({
          name: s.name, pipeline_id: pipeline.id, org_id: orgId, order: i,
          color: s.color, win_probability: s.probability,
        }))
      );
      setAlreadyCreated(true);
    }

    setStepData({ pipelineCreated: true, stageCount: stages.length });
    setSaving(false);
    toast({ title: `Pipeline criado com ${stages.length} estágios!` });
    onComplete();
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <GitBranch className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Crie seu pipeline de vendas</CardTitle>
        <CardDescription>Defina os estágios do seu processo comercial</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alreadyCreated && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3">
            <Check className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Pipeline já configurado</span>
          </div>
        )}
        <div className="space-y-2">
          <Label>Nome do pipeline</Label>
          <Input value={pipelineName} onChange={(e) => setPipelineName(e.target.value)} disabled={alreadyCreated} />
        </div>

        <div className="space-y-2">
          <Label>Estágios</Label>
          <div className="space-y-2">
            {stages.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateStage(idx, "color", e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0"
                  aria-label={`Cor do estágio ${idx + 1}`}
                  disabled={alreadyCreated}
                />
                <Input
                  value={stage.name}
                  onChange={(e) => updateStage(idx, "name", e.target.value)}
                  placeholder={`Estágio ${idx + 1}`}
                  aria-label={`Estágio ${idx + 1}`}
                  className="flex-1"
                  disabled={alreadyCreated}
                />
                <Badge variant="outline" className="min-w-[3rem] justify-center text-xs">
                  {stage.probability}%
                </Badge>
                <Input
                  type="range" min="0" max="100" step="5"
                  value={stage.probability}
                  onChange={(e) => updateStage(idx, "probability", Number(e.target.value))}
                  className="w-20"
                  aria-label={`Probabilidade do estágio ${idx + 1}`}
                  disabled={alreadyCreated}
                />
                {stages.length > 1 && !alreadyCreated && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeStage(idx)}
                    aria-label="Remover estágio">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!alreadyCreated && (
            <Button variant="outline" size="sm" onClick={addStage}>
              <Plus className="mr-1 h-3.5 w-3.5" />Adicionar estágio
            </Button>
          )}
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {alreadyCreated ? "Continuar" : "Criar pipeline e continuar"}
        </Button>
      </CardContent>
    </Card>
  );
}
