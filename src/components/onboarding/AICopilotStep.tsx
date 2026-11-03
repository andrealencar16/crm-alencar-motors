import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Loader2, Check, X, AlertTriangle, Eye, EyeOff } from "lucide-react";
import type { OnboardingStepProps } from "./types";

type TestStatus = "idle" | "testing" | "success" | "invalid_key" | "no_credits" | "error";

export function AICopilotStep({ orgId, setCanContinue, setStepData }: OnboardingStepProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<TestStatus>("idle");
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);

  // Check if AI is already configured (idempotency)
  useEffect(() => {
    if (!orgId) return;
    supabase
      .from("integration_configs")
      .select("id, config")
      .eq("org_id", orgId)
      .eq("provider", "anthropic")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setAlreadyConfigured(true);
          setStatus("success");
          setCanContinue(true);
          setStepData("aiConfigured", true);
        }
      });
  }, [orgId, setCanContinue, setStepData]);

  const handleTest = async () => {
    if (!apiKey.trim() || !orgId) return;
    setStatus("testing");
    try {
      const { data, error } = await supabase.functions.invoke("validate-anthropic-key", {
        body: { api_key: apiKey.trim(), org_id: orgId },
      });
      if (error) throw error;
      if (data?.valid) {
        setStatus("success");
        setAlreadyConfigured(true);
        setCanContinue(true);
        setStepData("aiConfigured", true);
      } else {
        setStatus(data?.error === "no_credits" ? "no_credits" : "invalid_key");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">Ative o AI Copilot</h3>
        <p className="text-sm text-muted-foreground mt-1">
          O CRM Automotivo usa Claude da Anthropic para gerar emails, analisar negócios e sugerir próximos passos.
        </p>
      </div>

      {!alreadyConfigured && (
        <>
          <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-3">
            <p className="text-sm font-medium">Como obter sua chave:</p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Acesse <span className="font-mono text-foreground">console.anthropic.com</span> e crie uma conta</li>
              <li>Clique em "API Keys" → "Create Key"</li>
              <li>Copie e cole a chave abaixo</li>
            </ol>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="anthropic-key">Anthropic API Key</Label>
              <div className="relative">
                <Input
                  id="anthropic-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setStatus("idle"); setCanContinue(false); }}
                  placeholder="sk-ant-api03-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {status === "invalid_key" && (
              <div className="flex items-center gap-2 text-sm text-destructive rounded-lg bg-destructive/10 p-3" role="alert">
                <X className="h-4 w-4" /> Chave inválida. Verifique e tente novamente.
              </div>
            )}
            {status === "no_credits" && (
              <div className="flex items-center gap-2 text-sm text-warning rounded-lg bg-warning/10 p-3" role="alert">
                <AlertTriangle className="h-4 w-4" /> Chave válida mas sem créditos na conta Anthropic.
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center gap-2 text-sm text-destructive rounded-lg bg-destructive/10 p-3" role="alert">
                <X className="h-4 w-4" /> Erro ao verificar. Tente novamente.
              </div>
            )}
          </div>
        </>
      )}

      <button
        onClick={alreadyConfigured ? undefined : handleTest}
        disabled={alreadyConfigured || !apiKey.trim() || status === "testing"}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          alreadyConfigured
            ? "bg-muted text-muted-foreground cursor-default"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {status === "testing" ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Verificando chave...</>
        ) : alreadyConfigured ? (
          <><Check className="h-4 w-4" /> Salvo com sucesso — Claude ativo</>
        ) : (
          <><Brain className="h-4 w-4" /> Testar e salvar chave</>
        )}
      </button>
    </div>
  );
}
