import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Repeat, Loader2, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyBRL } from "@/types/automotive";

interface RecompraRow {
  contato_id: string;
  contato_nome: string;
  contato_email: string | null;
  preferred_brand: string | null;
  purchase_cycle_months: number;
  ultima_compra: string;
  vehicle_marca: string | null;
  vehicle_modelo: string | null;
  valor: number;
  vehicle_id: string | null;
  has_open_deal: boolean;
}

const WINDOW_DAYS = 90;

export default function Recompra() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const orgId = profile?.org_id ?? null;

  const [rows, setRows] = useState<RecompraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterNoDeal, setFilterNoDeal] = useState(false);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Pega purchase_history + dados de contato + vehicle
      const { data: history, error } = await supabase
        .from("purchase_history" as never)
        .select("contato_id, vehicle_id, data_compra, valor, contacts!inner(first_name, last_name, email, purchase_cycle_months, preferred_brand), vehicles(marca, modelo)")
        .eq("org_id", orgId)
        .order("data_compra", { ascending: false });

      if (error) throw error;

      type RawRow = {
        contato_id: string | null;
        vehicle_id: string | null;
        data_compra: string;
        valor: number;
        contacts: { first_name: string; last_name: string | null; email: string | null; purchase_cycle_months: number | null; preferred_brand: string | null } | null;
        vehicles: { marca: string; modelo: string } | null;
      };

      const raw = (history as unknown as RawRow[] | null) ?? [];
      const today = new Date();
      const lowerMs = today.getTime() - WINDOW_DAYS * 86400000;
      const upperMs = today.getTime() + WINDOW_DAYS * 86400000;

      const inWindow: RecompraRow[] = [];
      const seen = new Set<string>();
      for (const r of raw) {
        if (!r.contato_id || seen.has(r.contato_id) || !r.contacts) continue;
        const cycle = r.contacts.purchase_cycle_months ?? 36;
        const purchaseTime = new Date(r.data_compra).getTime();
        const nextWindowMs = purchaseTime + cycle * 30 * 86400000;
        if (nextWindowMs >= lowerMs && nextWindowMs <= upperMs) {
          seen.add(r.contato_id);
          inWindow.push({
            contato_id: r.contato_id,
            contato_nome: `${r.contacts.first_name} ${r.contacts.last_name ?? ""}`.trim(),
            contato_email: r.contacts.email,
            preferred_brand: r.contacts.preferred_brand,
            purchase_cycle_months: cycle,
            ultima_compra: r.data_compra,
            vehicle_marca: r.vehicles?.marca ?? null,
            vehicle_modelo: r.vehicles?.modelo ?? null,
            valor: r.valor,
            vehicle_id: r.vehicle_id,
            has_open_deal: false,
          });
        }
      }

      // Marcar quem já tem deal aberto
      if (inWindow.length > 0) {
        const ids = inWindow.map((r) => r.contato_id);
        const { data: openDeals } = await supabase
          .from("deals")
          .select("contact_id, status")
          .eq("org_id", orgId)
          .in("contact_id", ids)
          .neq("status", "won")
          .neq("status", "lost");
        const openSet = new Set(((openDeals as { contact_id: string }[] | null) ?? []).map((d) => d.contact_id));
        inWindow.forEach((r) => {
          r.has_open_deal = openSet.has(r.contato_id);
        });
      }

      setRows(inWindow);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao carregar recompra", description: msg, variant: "destructive" });
    }
    setLoading(false);
  }, [orgId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterNoDeal && r.has_open_deal) return false;
      if (!term) return true;
      const hay = `${r.contato_nome} ${r.preferred_brand ?? ""} ${r.vehicle_marca ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search, filterNoDeal]);

  const createDeal = useCallback(
    async (row: RecompraRow) => {
      if (!orgId) return;
      setCreatingFor(row.contato_id);
      try {
        const { data: pipeline } = await supabase
          .from("pipelines")
          .select("id")
          .eq("org_id", orgId)
          .eq("name", "Venda PF")
          .maybeSingle();
        if (!pipeline) throw new Error("Pipeline 'Venda PF' não encontrado. Rode o onboarding novamente.");

        const { data: stage } = await supabase
          .from("pipeline_stages")
          .select("id")
          .eq("pipeline_id", pipeline.id)
          .eq("name", "Lead")
          .maybeSingle();
        if (!stage) throw new Error("Stage 'Lead' não encontrado.");

        const title = `Recompra · ${row.contato_nome}${row.preferred_brand ? ` (${row.preferred_brand})` : ""}`;
        const { data: deal, error } = await supabase
          .from("deals")
          .insert({
            org_id: orgId,
            title,
            contact_id: row.contato_id,
            pipeline_id: pipeline.id,
            stage_id: stage.id,
            value: row.valor,
          })
          .select("id")
          .single();
        if (error) throw error;

        toast({ title: "Deal de recompra criado" });
        navigate(`/deals/${deal.id}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast({ title: "Erro ao criar deal", description: msg, variant: "destructive" });
      }
      setCreatingFor(null);
    },
    [orgId, toast, navigate]
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recompra</h1>
          <p className="text-sm text-muted-foreground">
            Clientes na janela de ±{WINDOW_DAYS} dias do ciclo de troca.
            {!loading && ` · ${filtered.length} encontrados`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, marca preferida..."
            aria-label="Nome, marca preferida..."
            className="pl-9"
          />
        </div>
        <Button
          variant={filterNoDeal ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterNoDeal((v) => !v)}
        >
          Sem deal aberto
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Repeat className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum cliente na janela de recompra agora.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Cliente</th>
                <th className="px-4 py-2 text-left">Última compra</th>
                <th className="px-4 py-2 text-left">Veículo</th>
                <th className="px-4 py-2 text-left">Valor</th>
                <th className="px-4 py-2 text-left">Ciclo</th>
                <th className="px-4 py-2 text-left">Marca pref.</th>
                <th className="px-4 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.contato_id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/contacts`} className="font-medium hover:text-primary">
                      {r.contato_nome}
                    </Link>
                    {r.contato_email && <div className="text-xs text-muted-foreground">{r.contato_email}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(r.ultima_compra).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.vehicle_marca ? `${r.vehicle_marca} ${r.vehicle_modelo ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{formatCurrencyBRL(r.valor)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.purchase_cycle_months}m</td>
                  <td className="px-4 py-3">
                    {r.preferred_brand ? (
                      <Badge variant="secondary">{r.preferred_brand}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.has_open_deal ? (
                      <Badge variant="outline">Deal aberto</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => void createDeal(r)}
                        disabled={creatingFor === r.contato_id}
                      >
                        {creatingFor === r.contato_id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="mr-1 h-3 w-3" />
                        )}
                        Criar deal
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
