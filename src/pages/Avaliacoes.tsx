import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Camera, Plus, Loader2, MoreHorizontal, Pencil, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  TradeIn,
  TradeInStatus,
  TRADE_IN_STATUS_LABEL,
  formatCurrencyBRL,
} from "@/types/automotive";
import { TradeInEditDialog } from "@/components/avaliacoes/TradeInEditDialog";

const STATUS_VARIANT: Record<TradeInStatus, "default" | "secondary" | "destructive" | "outline"> = {
  aguardando: "secondary",
  avaliado: "default",
  aceito: "default",
  rejeitado: "destructive",
};

export default function Avaliacoes() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const orgId = profile?.org_id ?? null;

  const [items, setItems] = useState<TradeIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<TradeIn | null>(null);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("trade_ins" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar avaliações", description: error.message, variant: "destructive" });
    } else {
      setItems((data as TradeIn[] | null) ?? []);
    }
    setLoading(false);
  }, [orgId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`trade_ins:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trade_ins", filter: `org_id=eq.${orgId}` },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, load]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter((t) => t.status === statusFilter);
  }, [items, statusFilter]);

  const runAI = useCallback(
    async (t: TradeIn) => {
      setEvaluatingId(t.id);
      toast({ title: "Rodando avaliação IA...", description: `${t.marca ?? ""} ${t.modelo ?? ""}`.trim() });
      try {
        const { error } = await supabase.functions.invoke("evaluate-trade-in", {
          body: { trade_in_id: t.id },
        });
        if (error) throw error;
        toast({ title: "Avaliação IA concluída", description: "Status atualizado para 'avaliado'." });
        await load();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const notDeployed = msg.includes("not found") || msg.includes("404");
        toast({
          title: "Erro na avaliação IA",
          description: notDeployed
            ? "Edge function evaluate-trade-in ainda não está deployada."
            : msg,
          variant: "destructive",
        });
      }
      setEvaluatingId(null);
    },
    [load, toast]
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Avaliações de troca</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando..." : `${filtered.length} avaliações`}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/avaliacoes/nova">
            <Plus className="mr-1 h-4 w-4" /> Nova avaliação
          </Link>
        </Button>
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          {(Object.keys(TRADE_IN_STATUS_LABEL) as TradeInStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {TRADE_IN_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Camera className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma avaliação encontrada.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Veículo</th>
                <th className="px-4 py-2 text-left">Ano</th>
                <th className="px-4 py-2 text-left">KM</th>
                <th className="px-4 py-2 text-left">FIPE</th>
                <th className="px-4 py-2 text-left">IA</th>
                <th className="px-4 py-2 text-left">Ofertado</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Deal</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((t) => {
                const canRunAI = t.status === "aguardando" || t.status === "avaliado";
                const isEvaluating = evaluatingId === t.id;
                return (
                  <tr key={t.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      {t.marca ?? "—"} {t.modelo ?? ""}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{t.ano ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.km?.toLocaleString("pt-BR") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrencyBRL(t.estimativa_fipe)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatCurrencyBRL(t.estimativa_ia)}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrencyBRL(t.valor_final_ofertado)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[t.status]}>{TRADE_IN_STATUS_LABEL[t.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.deal_id ? (
                        <Link to={`/deals/${t.deal_id}`} className="text-primary hover:underline">
                          ver deal
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canRunAI && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => void runAI(t)}
                            disabled={isEvaluating}
                            title={t.status === "avaliado" ? "Reavaliar com IA" : "Rodar avaliação IA"}
                          >
                            {isEvaluating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(t)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {canRunAI && (
                              <DropdownMenuItem
                                onClick={() => void runAI(t)}
                                disabled={isEvaluating}
                              >
                                <Sparkles className="mr-2 h-4 w-4" />
                                {t.status === "avaliado" ? "Reavaliar IA" : "Rodar IA"}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TradeInEditDialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        tradeIn={editing}
        onSaved={() => void load()}
      />
    </div>
  );
}
