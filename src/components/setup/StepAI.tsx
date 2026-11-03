import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Check, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

export function StepAI({ orgId, onComplete, setStepData }: SetupStepProps) {
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-copilot", {
        body: { prompt: "Diga 'CRM Automotivo AI ativo!' em uma frase curta.", context: "test" },
      });
      if (error) throw error;
      setTested(true);
      setStepData({ aiConfigured: true });
      toast({ title: "AI Copilot funcionando!", description: data?.response || "Conexão OK" });
    } catch {
      toast({ title: "AI indisponível no momento", description: "Você pode configurar depois em Configurações.", variant: "destructive" });
    }
    setTesting(false);
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Brain className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>AI Copilot</CardTitle>
        <CardDescription>
          Inteligência artificial integrada ao seu CRM para insights, redação de emails e análise de risco.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Funcionalidades incluídas:</span>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
            <li>Chat contextual com dados do CRM</li>
            <li>Redação e revisão de emails</li>
            <li>Insights diários automáticos</li>
            <li>Análise de risco de negócios</li>
          </ul>
        </div>

        {tested ? (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">AI Copilot ativo e funcionando!</span>
          </div>
        ) : (
          <Button className="w-full" onClick={handleTest} disabled={testing}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
            Testar conexão com AI
          </Button>
        )}

        <Button variant={tested ? "default" : "outline"} className="w-full" onClick={() => {
          if (!tested) setStepData({ aiConfigured: false });
          onComplete();
        }}>
          {tested ? "Continuar" : "Pular por agora"}
        </Button>
      </CardContent>
    </Card>
  );
}
