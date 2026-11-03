import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car, CheckCircle2, Clock, Wrench, TrendingUp, Repeat, Camera, AlertCircle, Loader2, Calendar,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Vehicle,
  TradeIn,
  ServiceReminder,
  REMINDER_TIPO_LABEL,
  formatCurrencyBRL,
} from "@/types/automotive";

interface Props {
  orgId: string;
}

interface DealRow {
  id: string;
  status: string | null;
  value: number | null;
  created_at: string;
  updated_at: string | null;
  pipeline_stages: { name: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  disponivel: "hsl(var(--success))",
  reservado: "hsl(var(--warning))",
  em_preparacao: "hsl(217 91% 60%)",
  vendido: "hsl(0 0% 50%)",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(142 71% 45%)",
  "hsl(280 70% 55%)",
  "hsl(0 0% 60%)",
];

export function AutomotivePanel({ orgId }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tradeIns, setTradeIns] = useState<TradeIn[]>([]);
  const [reminders, setReminders] = useState<ServiceReminder[]>([]);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [repurchaseCount, setRepurchaseCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
    const next60d = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

    const [vRes, tRes, rRes, dRes, rpRes] = await Promise.all([
      supabase.from("vehicles" as never).select("*").eq("org_id", orgId),
      supabase.from("trade_ins" as never).select("*").eq("org_id", orgId).in("status", ["aguardando", "avaliado"]),
      supabase
        .from("service_reminders" as never)
        .select("*")
        .eq("org_id", orgId)
        .eq("status", "pendente")
        .lte("data_vencimento", next60d)
        .order("data_vencimento", { ascending: true })
        .limit(10),
      supabase
        .from("deals")
        .select("id, status, value, created_at, updated_at, pipeline_stages(name)")
        .eq("org_id", orgId)
        .gte("created_at", since30d),
      // RPC do Arquiteto (Fase 5 SQL); fallback se ainda não existir.
      supabase.rpc("get_repurchase_candidates" as never, { p_org_id: orgId } as never),
    ]);

    setVehicles((vRes.data as Vehicle[] | null) ?? []);
    setTradeIns((tRes.data as TradeIn[] | null) ?? []);
    setReminders((rRes.data as ServiceReminder[] | null) ?? []);
    setDeals((dRes.data as DealRow[] | null) ?? []);

    const rp = rpRes as { error: unknown; data: unknown };
    if (!rp.error && rp.data) {
      const arr = rp.data as unknown[];
      setRepurchaseCount(Array.isArray(arr) ? arr.length : null);
    } else {
      // Fallback: contar via purchase_history (igual /recompra usa).
      const { data: ph } = await supabase
        .from("purchase_history" as never)
        .select("contato_id, data_compra, contacts!inner(purchase_cycle_months)")
        .eq("org_id", orgId);
      type PHRow = { contato_id: string; data_compra: string; contacts: { purchase_cycle_months: number | null } | null };
      const rows = (ph as unknown as PHRow[] | null) ?? [];
      const seen = new Set<string>();
      const today = Date.now();
      const win = 90 * 86400000;
      for (const r of rows) {
        if (!r.contato_id || seen.has(r.contato_id)) continue;
        const cycle = r.contacts?.purchase_cycle_months ?? 36;
        const next = new Date(r.data_compra).getTime() + cycle * 30 * 86400000;
        if (Math.abs(next - today) <= win) seen.add(r.contato_id);
      }
      setRepurchaseCount(seen.size);
    }

    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const byStatus = {
      disponivel: 0,
      reservado: 0,
      em_preparacao: 0,
      vendido: 0,
    } as Record<string, number>;
    for (const v of vehicles) byStatus[v.status] = (byStatus[v.status] ?? 0) + 1;

    const wonDeals = deals.filter((d) => d.status === "won");
    const ticketMedio = wonDeals.length > 0
      ? wonDeals.reduce((acc, d) => acc + (d.value ?? 0), 0) / wonDeals.length
      : 0;

    const cicloMedio = wonDeals.length > 0
      ? wonDeals.reduce((acc, d) => {
          if (!d.updated_at) return acc;
          const days = (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / 86400000;
          return acc + days;
        }, 0) / wonDeals.length
      : 0;

    const testDriveCount = deals.filter((d) => d.pipeline_stages?.name === "Test Drive").length;
    const conversao = testDriveCount > 0 ? (wonDeals.length / testDriveCount) * 100 : 0;

    return {
      byStatus,
      ticketMedio,
      cicloMedio,
      conversao,
      tradeInsAbertos: tradeIns.length,
    };
  }, [vehicles, deals, tradeIns]);

  const byBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vehicles.filter((x) => x.status !== "vendido")) {
      map.set(v.marca, (map.get(v.marca) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [vehicles]);

  const dealsByWeek = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; ts: number; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 7 * 86400000);
      buckets.push({
        label: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`,
        ts: d.getTime(),
        count: 0,
      });
    }
    const weekMs = 7 * 86400000;
    for (const d of deals) {
      if (d.status !== "won" || !d.updated_at) continue;
      const t = new Date(d.updated_at).getTime();
      const idx = buckets.findIndex((b, i) => t >= b.ts - weekMs / 2 && (i === buckets.length - 1 || t < buckets[i + 1].ts - weekMs / 2));
      if (idx >= 0) buckets[idx].count++;
    }
    return buckets;
  }, [deals]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando painel automotivo...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Painel automotivo
      </h2>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Disponíveis"
          value={kpis.byStatus.disponivel ?? 0}
          color={STATUS_COLOR.disponivel}
          href="/estoque"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Reservados"
          value={kpis.byStatus.reservado ?? 0}
          color={STATUS_COLOR.reservado}
          href="/estoque"
        />
        <KpiCard
          icon={<Wrench className="h-4 w-4" />}
          label="Em preparação"
          value={kpis.byStatus.em_preparacao ?? 0}
          color={STATUS_COLOR.em_preparacao}
          href="/estoque"
        />
        <KpiCard
          icon={<Car className="h-4 w-4" />}
          label="Vendidos (total)"
          value={kpis.byStatus.vendido ?? 0}
          color={STATUS_COLOR.vendido}
          href="/estoque"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Conversão TD→W"
          value={`${kpis.conversao.toFixed(0)}%`}
          color="hsl(var(--primary))"
          subtitle="últimos 30d"
        />
        <KpiCard
          icon={<Camera className="h-4 w-4" />}
          label="Trade-ins abertos"
          value={kpis.tradeInsAbertos}
          color="hsl(38 92% 50%)"
          href="/avaliacoes"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Ticket médio"
          value={formatCurrencyBRL(kpis.ticketMedio)}
          color="hsl(var(--primary))"
          subtitle="últimos 30d"
        />
        <KpiCard
          icon={<Clock className="h-4 w-4" />}
          label="Ciclo médio"
          value={`${kpis.cicloMedio.toFixed(0)}d`}
          color="hsl(217 91% 60%)"
          subtitle="lead → ganho"
        />
        <KpiCard
          icon={<Repeat className="h-4 w-4" />}
          label="Recompras na janela"
          value={repurchaseCount ?? "—"}
          color="hsl(var(--primary))"
          href="/recompra"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Deals ganhos por semana (últimas 12)</CardTitle>
          </CardHeader>
          <CardContent>
            {dealsByWeek.every((b) => b.count === 0) ? (
              <EmptyChart text="Sem deals ganhos ainda" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dealsByWeek}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Estoque ativo por marca</CardTitle>
          </CardHeader>
          <CardContent>
            {byBrand.length === 0 ? (
              <EmptyChart text="Sem veículos em estoque" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byBrand}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={75}
                    label={(props: { name?: string; value?: number }) => `${props.name ?? ""} (${props.value ?? 0})`}
                    labelLine={false}
                  >
                    {byBrand.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service reminders */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Próximas obrigações
          </CardTitle>
          <span className="text-xs text-muted-foreground">{reminders.length} pendentes (60d)</span>
        </CardHeader>
        <CardContent>
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nada vencendo nos próximos 60 dias.</p>
          ) : (
            <ul className="divide-y divide-border">
              {reminders.map((r) => (
                <li key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium">{REMINDER_TIPO_LABEL[r.tipo]}</span>
                      <span className="text-xs text-muted-foreground ml-2 truncate">
                        vence em {new Date(r.data_vencimento).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {r.tipo}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
  href,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  color: string;
  href?: string;
  subtitle?: string;
}) {
  const inner = (
    <Card className={href ? "hover:border-primary/60 transition-colors cursor-pointer" : ""}>
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
          <span style={{ color }} className="opacity-80">
            {icon}
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tight" style={{ color }}>
          {value}
        </div>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
  if (href) return <Link to={href}>{inner}</Link>;
  return inner;
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
