import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronDown, Loader2, MessageSquare, Send, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export function StepSlack({ orgId, onComplete, setStepData }: SetupStepProps) {
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceUrl, setWorkspaceUrl] = useState("");

  // Manual token
  const [showManual, setShowManual] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Notification config
  const [notifyWon, setNotifyWon] = useState(true);
  const [notifyLost, setNotifyLost] = useState(true);
  const [dailySummary, setDailySummary] = useState(true);
  const [summaryTime, setSummaryTime] = useState("09:00");
  const [notifyInactive, setNotifyInactive] = useState(false);
  const [notifyLeadScore, setNotifyLeadScore] = useState(false);
  const [channel, setChannel] = useState("#vendas");
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const handleOAuthConnect = async () => {
    setConnectionStatus("connecting");
    // In production, this opens Slack OAuth popup
    toast({
      title: "Configuração necessária",
      description: "Configure SLACK_CLIENT_ID e SLACK_CLIENT_SECRET para ativar OAuth do Slack.",
    });
    setTimeout(() => setConnectionStatus("idle"), 1500);
  };

  const handleVerifyToken = async () => {
    if (!botToken.trim()) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-connect", {
        body: { bot_token: botToken.trim(), org_id: orgId },
      });
      if (error) throw error;
      if (data?.workspace_name) {
        setConnectionStatus("connected");
        setWorkspaceName(data.workspace_name);
        setWorkspaceUrl(data.workspace_url || "");
        toast({ title: `Conectado ao ${data.workspace_name}!` });
      } else {
        throw new Error("Invalid");
      }
    } catch {
      setConnectionStatus("error");
      toast({ title: "Token inválido", variant: "destructive" });
    }
    setVerifying(false);
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      await supabase.functions.invoke("slack-send-test", {
        body: { org_id: orgId, channel, message: "🚀 CRM Automotivo conectado! As notificações de vendas vão aparecer aqui." },
      });
      setTestSent(true);
      toast({ title: "Mensagem de teste enviada!" });
    } catch {
      toast({ title: "Erro ao enviar mensagem", variant: "destructive" });
    }
    setSendingTest(false);
  };

  const handleContinue = () => {
    setStepData({
      slackConnected: connectionStatus === "connected",
      slackChannel: channel,
      slackWorkspace: workspaceName,
    });
    onComplete();
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "#4A154B20" }}>
          <MessageSquare className="h-6 w-6" style={{ color: "#4A154B" }} />
        </div>
        <h2 className="text-xl font-bold">Notificações no Slack</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Receba alertas de deals ganhos, resumo diário e mencione contatos diretamente no Slack.
        </p>
      </div>

      <div className="mx-auto max-w-lg space-y-4">
        {/* Part A — Connect */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Conectar ao Slack</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {connectionStatus === "connected" ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3">
                <Check className="h-4 w-4 text-emerald-600" />
                <div>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    Conectado ao workspace: {workspaceName}
                  </span>
                  {workspaceUrl && (
                    <p className="text-[11px] text-muted-foreground">{workspaceUrl}</p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <Button
                  className="w-full gap-2 text-white"
                  style={{ backgroundColor: "#4A154B" }}
                  onClick={handleOAuthConnect}
                  disabled={connectionStatus === "connecting"}
                >
                  {connectionStatus === "connecting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  Adicionar ao Slack
                </Button>

                {connectionStatus === "error" && (
                  <p className="text-sm text-destructive text-center">Erro na conexão. Tente novamente.</p>
                )}

                <button
                  className="text-[11px] text-muted-foreground underline w-full text-center"
                  onClick={() => setShowManual(!showManual)}
                >
                  {showManual ? "Ocultar configuração manual" : "Configurar manualmente com Bot Token"}
                </button>

                {showManual && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <Label className="text-xs">Bot Token</Label>
                    <div className="flex gap-2">
                      <Input
                        value={botToken}
                        onChange={(e) => setBotToken(e.target.value)}
                        placeholder="xoxb-..."
                        aria-label="xoxb-..."
                        type="password"
                        className="flex-1"
                      />
                      <Button variant="outline" size="sm" onClick={handleVerifyToken} disabled={verifying || !botToken.trim()}>
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verificar"}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Part B — Notification config (only after connected) */}
        {connectionStatus === "connected" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Configurar notificações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notifyWon} onCheckedChange={(v) => setNotifyWon(!!v)} />
                  Deal ganho — celebrar vitórias 🎉
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notifyLost} onCheckedChange={(v) => setNotifyLost(!!v)} />
                  Deal perdido — para aprendizado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={dailySummary} onCheckedChange={(v) => setDailySummary(!!v)} />
                  <span className="flex items-center gap-1">
                    Resumo diário às
                    <Input
                      type="time"
                      value={summaryTime}
                      onChange={(e) => setSummaryTime(e.target.value)}
                      className="h-7 w-24 text-xs"
                    />
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notifyInactive} onCheckedChange={(v) => setNotifyInactive(!!v)} />
                  Deal sem atividade há 14 dias
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notifyLeadScore} onCheckedChange={(v) => setNotifyLeadScore(!!v)} />
                  Lead score atingiu 70+ pontos
                </label>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Canal para notificações</Label>
                <Input
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="#vendas"
                  aria-label="#vendas"
                />
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleSendTest}
                disabled={sendingTest || testSent}
              >
                {sendingTest ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : testSent ? (
                  <Check className="mr-2 h-4 w-4 text-emerald-600" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {testSent ? "Mensagem enviada!" : "Enviar mensagem de teste"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Button className="w-full" onClick={handleContinue}>
          {connectionStatus === "connected" ? "Continuar" : "Pular por agora"}
        </Button>
      </div>
    </div>
  );
}
