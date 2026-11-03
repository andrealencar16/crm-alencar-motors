import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Lightbulb, AlertTriangle, CheckCircle2, Info, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { useOrg } from "@/hooks/useOrg";
import { supabase } from "@/integrations/supabase/client";

type Insight = {
  title: string;
  description: string;
  type: "warning" | "success" | "info" | "danger";
  action_label: string;
  action_route: string;
};

const typeConfig = {
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  success: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", border: "border-success/20" },
  info: { icon: Info, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
  danger: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
};

export function AIInsightsPanel() {
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState(false);

  const fetchInsights = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      setInsights(data?.insights || []);
      setDismissed(new Set());
    } catch (e) {
      console.error("Failed to fetch insights:", e);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (open && insights.length === 0 && !loading) fetchInsights();
  }, [open, orgId]);

  const visibleInsights = insights.filter((_, i) => !dismissed.has(i));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Lightbulb className="h-4 w-4" />
          {insights.length > 0 && visibleInsights.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-warning text-[8px] font-bold flex items-center justify-center text-warning-foreground">
              {visibleInsights.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[360px] sm:w-[400px] p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10">
                <Lightbulb className="h-4 w-4 text-warning" />
              </div>
              <div>
                <SheetTitle className="text-sm">AI Insights</SheetTitle>
                <p className="text-[9px] text-muted-foreground">Análise automática do seu CRM</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchInsights} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-80px)]">
          <div className="p-3 space-y-2">
            {loading && insights.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Analisando seus dados...</p>
              </div>
            )}

            {!loading && visibleInsights.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="h-8 w-8 text-success/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Tudo em dia! Nenhum insight pendente.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={fetchInsights}>
                  Verificar novamente
                </Button>
              </div>
            )}

            {visibleInsights.map((insight, idx) => {
              const originalIdx = insights.indexOf(insight);
              const config = typeConfig[insight.type] || typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={originalIdx}
                  className={`rounded-lg border ${config.border} ${config.bg} p-3 space-y-2`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={`h-4 w-4 ${config.color} shrink-0 mt-0.5`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold">{insight.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{insight.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[9px]"
                      onClick={() => { navigate(insight.action_route); setOpen(false); }}
                    >
                      {insight.action_label}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[9px] text-muted-foreground"
                      onClick={() => setDismissed((prev) => new Set(prev).add(originalIdx))}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
