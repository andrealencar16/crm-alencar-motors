import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Loader2, Check, AlertTriangle, X, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

type TestStatus = "idle" | "loading" | "success" | "domain_error" | "key_error";

export function StepResend({ orgId, userId, userEmail, onComplete, setStepData }: SetupStepProps) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");

  const handleTest = async () => {
    if (!apiKey.trim() || !fromEmail.trim()) {
      toast({ title: "Preencha a API Key e o email de envio", variant: "destructive" });
      return;
    }
    setTestStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("validate-resend-key", {
        body: {
          api_key: apiKey.trim(),
          from_email: fromEmail.trim(),
          from_name: fromName.trim() || "CRM Automotivo",
          test_to: userEmail,
          org_id: orgId,
        },
      });
      if (error) throw error;

      if (data?.valid) {
        setTestStatus("success");
        setStepData({ resendConfigured: true });
      } else if (data?.error_code === "domain_not_verified") {
        setTestStatus("domain_error");
      } else {
        setTestStatus("key_error");
      }
    } catch {
      setTestStatus("key_error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold">Configure o envio de emails</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Necessário para enviar emails de sequências e automações pelo CRM Automotivo.
          Não é necessário para a sincronização da sua caixa de entrada — isso é configurado no próximo passo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left column — instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Como configurar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <span>
                Acesse{" "}
                <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  resend.com <ExternalLink className="h-3 w-3" />
                </a>{" "}
                e crie uma conta gratuita
              </span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <span>
                Vá em <strong>"API Keys"</strong> → <strong>"Create API Key"</strong><br />
                Permissão necessária: <Badge variant="outline" className="text-[10px]">Sending access</Badge>
              </span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <span>
                Em <strong>"Domains"</strong>, adicione e verifique seu domínio
                (necessário para enviar como contato@suaempresa.com)
              </span>
            </div>
            <div className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">4</span>
              <span>Copie a key e cole ao lado</span>
            </div>
          </CardContent>
        </Card>

        {/* Right column — inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Credenciais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend-key">Resend API Key</Label>
              <Input
                id="resend-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="re_..."
                type="password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resend-from">Email de envio padrão</Label>
              <Input
                id="resend-from"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="vendas@suaempresa.com"
                type="email"
              />
              <p className="text-[11px] text-muted-foreground">
                Emails de sequências e automações sairão deste endereço
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="resend-name">Nome de exibição</Label>
              <Input
                id="resend-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Time Comercial — Acme Corp"
              />
            </div>

            {/* Test button / status */}
            {testStatus === "idle" && (
              <Button variant="outline" className="w-full" onClick={handleTest}>
                Testar envio
              </Button>
            )}
            {testStatus === "loading" && (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Enviando email de teste...</span>
              </div>
            )}
            {testStatus === "success" && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3">
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Email enviado! Verifique sua caixa de entrada.
                </span>
              </div>
            )}
            {testStatus === "domain_error" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Domínio não verificado no Resend.
                  </span>
                  <p className="text-[11px] text-amber-600/80 dark:text-amber-400/70 mt-0.5">
                    Você pode continuar, mas os emails podem cair no spam.
                  </p>
                </div>
              </div>
            )}
            {testStatus === "key_error" && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3">
                <X className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  Chave inválida. Verifique e tente novamente.
                </span>
              </div>
            )}

            {/* Always show continue/skip button */}
            {(testStatus === "success" || testStatus === "domain_error") && (
              <Button className="w-full" onClick={onComplete}>
                Continuar
              </Button>
            )}
            {testStatus === "key_error" && (
              <Button variant="outline" className="w-full" onClick={() => setTestStatus("idle")}>
                Tentar novamente
              </Button>
            )}
            {testStatus === "idle" && (
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => {
                setStepData({ resendConfigured: false });
                onComplete();
              }}>
                Pular por agora
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
