import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Check, ShieldCheck, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { OnboardingStepProps } from "./types";

export function TermosStep({ orgId, setCanContinue, setStepData }: OnboardingStepProps) {
  const { toast } = useToast();
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAI, setAcceptedAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle().then(({ data }) => {
      const s = (data?.settings as Record<string, unknown>) || {};
      const consents = s.consents as { terms?: boolean; ai?: boolean } | undefined;
      if (consents?.terms && consents?.ai) {
        setAcceptedTerms(true);
        setAcceptedAI(true);
        setSaved(true);
        setCanContinue(true);
      }
    });
  }, [orgId, setCanContinue]);

  useEffect(() => {
    if (!saved) setCanContinue(false);
  }, [saved, setCanContinue]);

  const handleSubmit = useCallback(async () => {
    if (!orgId || loading) return;
    if (!acceptedTerms || !acceptedAI) return;
    setLoading(true);
    try {
      const { data: current } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", orgId)
        .maybeSingle();
      const prev = (current?.settings as Record<string, unknown>) || {};
      const settings = {
        ...prev,
        consents: {
          terms: true,
          ai: true,
          accepted_at: new Date().toISOString(),
        },
      };
      const { error } = await supabase
        .from("organizations")
        .update({ settings } as never)
        .eq("id", orgId);
      if (error) throw error;
      setStepData("consents", settings.consents);
      setSaved(true);
      setCanContinue(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao registrar consentimentos", description: message, variant: "destructive" });
    }
    setLoading(false);
  }, [orgId, loading, acceptedTerms, acceptedAI, setStepData, setCanContinue, toast]);

  const canSubmit = acceptedTerms && acceptedAI;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary mt-0.5">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold">Termos e privacidade</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Para usar o CRM Automotivo precisamos do seu aceite. Leia com calma.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label
          className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
            acceptedTerms ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <Checkbox
            checked={acceptedTerms}
            onCheckedChange={(c) => {
              setAcceptedTerms(c === true);
              setSaved(false);
              setCanContinue(false);
            }}
            className="mt-0.5"
          />
          <div className="flex-1 text-sm">
            <span className="font-medium">Aceito os Termos de Uso e a Política de Privacidade</span>
            <p className="text-xs text-muted-foreground mt-1">
              Inclui as regras de uso da plataforma, responsabilidades e tratamento de dados pessoais conforme a LGPD.
            </p>
          </div>
        </label>

        <label
          className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
            acceptedAI ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          }`}
        >
          <Checkbox
            checked={acceptedAI}
            onCheckedChange={(c) => {
              setAcceptedAI(c === true);
              setSaved(false);
              setCanContinue(false);
            }}
            className="mt-0.5"
          />
          <div className="flex-1 text-sm">
            <span className="font-medium">Autorizo o uso de IA com dados de leads e clientes</span>
            <p className="text-xs text-muted-foreground mt-1">
              A IA gera resumos de conversas, sugere respostas, avalia trade-ins e identifica oportunidades de
              recompra. Eu me comprometo a não inserir dados pessoais sensíveis (CPF/RG/CRLV completos) em campos
              livres do CRM.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Resumo LGPD:</strong> tratamos dados de leads e clientes em bases legais
        de execução de contrato e legítimo interesse para operação comercial. Você pode revogar consentimentos e
        solicitar exclusão a qualquer momento em Configurações &gt; Privacidade.
      </div>

      <button
        onClick={saved ? undefined : handleSubmit}
        disabled={saved || loading || !canSubmit || !orgId}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          saved
            ? "bg-muted text-muted-foreground cursor-default"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Registrando aceite...</>
        ) : saved ? (
          <><Check className="h-4 w-4" /> Termos aceitos</>
        ) : !canSubmit ? (
          <><X className="h-4 w-4" /> Marque os dois aceites</>
        ) : (
          <><ShieldCheck className="h-4 w-4" /> Aceitar e continuar</>
        )}
      </button>
    </div>
  );
}
