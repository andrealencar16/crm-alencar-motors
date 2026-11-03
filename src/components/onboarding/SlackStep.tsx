import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, X, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OnboardingStepProps } from "./types";

const NOTIFICATION_OPTIONS = [
  { key: "deal_won", label: "Deal ganho 🎉", default: true },
  { key: "deal_lost", label: "Deal perdido", default: true },
  { key: "daily_summary", label: "Resumo diário do pipeline", default: true },
  { key: "deal_stale", label: "Deal parado há 14 dias", default: false },
  { key: "lead_hot", label: "Lead score atingiu 70+", default: false },
  { key: "urgent_task", label: "Nova tarefa urgente", default: false },
];

export function SlackStep({ orgId, setCanContinue, setStepData }: OnboardingStepProps) {
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [notifications, setNotifications] = useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICATION_OPTIONS.map(o => [o.key, o.default]))
  );
  const [connectLoading, setConnectLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);

  // Allow skipping
  useEffect(() => { setCanContinue(true); }, [setCanContinue]);

  useEffect(() => {
    if (!orgId) return;
    let active = true;

    void supabase
      .from("integration_configs")
      .select("config")
      .eq("org_id", orgId)
      .eq("provider", "slack")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;

        const config = (data.config ?? {}) as Record<string, any>;
        const workspace = config.workspace || "Slack";

        setWorkspaceName(workspace);
        setSelectedChannel(config.channel || "");
        setNotifications((prev) => ({ ...prev, ...(config.notifications || {}) }));
        setAlreadyConfigured(true);
        setTestSent(true);
        setCanContinue(true);
        setStepData("slackConfigured", true);
        setStepData("slackWorkspace", workspace);
      });

    return () => {
      active = false;
    };
  }, [orgId, setCanContinue, setStepData]);

  const handleConnect = async () => {
    if (!orgId) return;
    setConnectLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("slack-connect", {
        body: { org_id: orgId },
      });
      if (fnError) throw fnError;
      if (data?.workspace_name) {
        setWorkspaceName(data.workspace_name);
        setChannels(data.channels || []);
      } else if (data?.error?.includes("API_KEY")) {
        setError("O conector do Slack não está configurado. Vá em Settings → Connectors no Lovable e conecte o Slack primeiro. Depois volte aqui e tente novamente.");
      } else {
        setError(data?.error || "Erro ao conectar. Verifique se o Slack está configurado.");
      }
    } catch {
      setError("Erro ao conectar com o Slack. Verifique se a integração está ativa.");
    }
    setConnectLoading(false);
  };

  const handleTest = async () => {
    if (!selectedChannel || !orgId) return;
    setTestLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("slack-send-test", {
        body: { org_id: orgId, channel: selectedChannel },
      });
      if (fnError) throw fnError;
      if (data?.ok) {
        const config = { workspace: workspaceName, channel: selectedChannel, notifications };
        const { data: existing } = await supabase
          .from("integration_configs")
          .select("id")
          .eq("org_id", orgId)
          .eq("provider", "slack")
          .maybeSingle();

        setTestSent(true);
        setAlreadyConfigured(true);
        setCanContinue(true);
        setStepData("slackConfigured", true);
        setStepData("slackWorkspace", workspaceName);

        if (existing) {
          await supabase
            .from("integration_configs")
            .update({ config: config as any, is_active: true } as any)
            .eq("id", existing.id);
        } else {
          await supabase
            .from("integration_configs")
            .insert({ org_id: orgId, provider: "slack", is_active: true, config: config as any } as any);
        }
      } else {
        toast({ title: "Erro", description: data?.error || "Falha ao enviar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao enviar mensagem de teste", variant: "destructive" });
    }
    setTestLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">Receba alertas no Slack</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Notificações de deals ganhos, resumo diário do pipeline e alertas de negócios em risco direto no seu canal.
        </p>
      </div>

      {!workspaceName ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
            <p className="text-sm font-medium">Como funciona:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Clique em "Conectar Slack" abaixo</li>
              <li>O CRM Automotivo se conecta automaticamente ao seu workspace</li>
              <li>Escolha o canal para receber notificações</li>
              <li>Pronto! Você receberá alertas de vendas em tempo real</li>
            </ol>
          </div>
          <Button className="w-full" onClick={handleConnect} disabled={connectLoading}>
            {connectLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conectando...</> : "Conectar Slack"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Você pode pular esta etapa e configurar depois em Integrações.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-primary rounded-lg bg-primary/10 p-3">
            <Check className="h-4 w-4" /> Workspace conectado: <strong>{workspaceName}</strong>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">O que notificar?</p>
            <div className="grid grid-cols-2 gap-2">
              {NOTIFICATION_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={notifications[opt.key]}
                    onCheckedChange={(v) => setNotifications({ ...notifications, [opt.key]: !!v })}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Canal de notificações</Label>
            <Select value={selectedChannel} onValueChange={setSelectedChannel}>
              <SelectTrigger><SelectValue placeholder="Selecione um canal..." /></SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" /> {ch.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="secondary" className="w-full" onClick={alreadyConfigured ? undefined : handleTest} disabled={alreadyConfigured || !selectedChannel || testLoading}>
            {testLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enviando...</> : alreadyConfigured ? "Salvo com sucesso" : "Enviar mensagem de teste"}
          </Button>

          {testSent && (
            <div className="flex items-center gap-2 text-sm text-primary rounded-lg bg-primary/10 p-3" role="status">
              <Check className="h-4 w-4" /> Mensagem enviada em #{channels.find(c => c.id === selectedChannel)?.name}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive rounded-lg bg-destructive/10 p-3" role="alert">
          <X className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
