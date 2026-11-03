import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, Clock, Trophy, XCircle, Download,
  ArrowRight, Users, Activity, FileText, BarChart3, Target, Filter,
} from "lucide-react";

// ── Types ─────────────────────────────────────
type Stage = { id: string; name: string; order: number; color: string | null; win_probability: number | null; pipeline_id: string };
type Deal = {
  id: string; title: string; value: number | null; stage_id: string | null;
  status: string | null; loss_reason: string | null; owner_id: string | null;
  created_at: string | null; updated_at: string | null; close_date: string | null;
  probability: number | null; company_id: string | null; contact_id: string | null;
  currency: string | null;
};
type Profile = { id: string; name: string | null; email: string | null };
type Pipeline = { id: string; name: string; is_default: boolean | null };
type ActivityRow = {
  id: string; type: string; title: string; due_date: string | null;
  completed_at: string | null; created_at: string | null; user_id: string | null;
};
type Contact = { id: string; first_name: string; last_name: string | null; status: string | null; lead_score: number | null; created_at: string | null; owner_id: string | null; };
type Company = { id: string; name: string };

type PeriodFilter = "all" | "this_month" | "last_month" | "this_quarter" | "this_year";

// ── Helpers ───────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(190, 95%, 39%)",
  "hsl(326, 78%, 55%)", "hsl(25, 95%, 53%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 11,
};

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getPeriodRange(period: PeriodFilter): { start: Date | null; end: Date | null } {
  const now = new Date();
  switch (period) {
    case "this_month": return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case "last_month": return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0) };
    case "this_quarter": return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end: null };
    case "this_year": return { start: new Date(now.getFullYear(), 0, 1), end: null };
    default: return { start: null, end: null };
  }
}

function inPeriod(dateStr: string | null, range: { start: Date | null; end: Date | null }): boolean {
  if (!dateStr) return !range.start;
  const d = new Date(dateStr);
  if (range.start && d < range.start) return false;
  if (range.end && d > range.end) return false;
  return true;
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════
export default function Reports() {
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Global filters
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [dRes, sRes, pRes, mRes, aRes, cRes, coRes] = await Promise.all([
      supabase.from("deals").select("*").eq("org_id", orgId),
      supabase.from("pipeline_stages").select("*").eq("org_id", orgId).order("order"),
      supabase.from("pipelines").select("id,name,is_default").eq("org_id", orgId),
      supabase.from("profiles").select("id,name,email").eq("org_id", orgId),
      supabase.from("activities").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1000),
      supabase.from("contacts").select("id,first_name,last_name,status,lead_score,created_at,owner_id").eq("org_id", orgId),
      supabase.from("companies").select("id,name").eq("org_id", orgId),
    ]);
    setDeals((dRes.data as Deal[]) || []);
    setStages((sRes.data as Stage[]) || []);
    setPipelines((pRes.data as Pipeline[]) || []);
    setMembers((mRes.data as Profile[]) || []);
    setActivities((aRes.data as ActivityRow[]) || []);
    setContacts((cRes.data as Contact[]) || []);
    setCompanies((coRes.data as Company[]) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtered data ──────────────────
  const periodRange = getPeriodRange(period);

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (ownerFilter !== "all") list = list.filter((d) => d.owner_id === ownerFilter);
    if (pipelineFilter !== "all") {
      const pipeStages = stages.filter((s) => s.pipeline_id === pipelineFilter).map((s) => s.id);
      list = list.filter((d) => d.stage_id && pipeStages.includes(d.stage_id));
    }
    return list.filter((d) => inPeriod(d.created_at, periodRange));
  }, [deals, ownerFilter, pipelineFilter, stages, periodRange]);

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (ownerFilter !== "all") list = list.filter((a) => a.user_id === ownerFilter);
    return list.filter((a) => inPeriod(a.created_at, periodRange));
  }, [activities, ownerFilter, periodRange]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (ownerFilter !== "all") list = list.filter((c) => c.owner_id === ownerFilter);
    return list;
  }, [contacts, ownerFilter]);

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      {/* Header + Global Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-xs text-muted-foreground">Análises completas de vendas, atividades e previsão</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo período</SelectItem>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="last_month">Mês anterior</SelectItem>
              <SelectItem value="this_quarter">Trimestre</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os donos</SelectItem>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {pipelines.length > 1 && (
            <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos pipelines</SelectItem>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="sales" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" />Vendas</TabsTrigger>
          <TabsTrigger value="activities" className="text-xs gap-1"><Activity className="h-3.5 w-3.5" />Atividades</TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" />Forecast</TabsTrigger>
          <TabsTrigger value="contacts" className="text-xs gap-1"><Users className="h-3.5 w-3.5" />Contatos</TabsTrigger>
          <TabsTrigger value="custom" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" />Custom</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ TAB 1: VENDAS ═══════════════════════ */}
        <TabsContent value="sales">
          <SalesReport deals={filteredDeals} stages={stages} members={members} companies={companies} allDeals={deals} periodRange={periodRange} />
        </TabsContent>

        {/* ═══════════════════════ TAB 2: ATIVIDADES ═══════════════════ */}
        <TabsContent value="activities">
          <ActivitiesReport activities={filteredActivities} members={members} />
        </TabsContent>

        {/* ═══════════════════════ TAB 3: FORECAST ═══════════════════ */}
        <TabsContent value="forecast">
          <ForecastReport deals={deals} stages={stages} members={members} ownerFilter={ownerFilter} pipelineFilter={pipelineFilter} />
        </TabsContent>

        {/* ═══════════════════════ TAB 4: CONTATOS ═══════════════════ */}
        <TabsContent value="contacts">
          <ContactsReport contacts={filteredContacts} members={members} />
        </TabsContent>

        {/* ═══════════════════════ TAB 5: CUSTOM ═══════════════════ */}
        <TabsContent value="custom">
          <CustomReportBuilder deals={deals} contacts={contacts} activities={activities} stages={stages} members={members} companies={companies} orgId={orgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB 1: Sales Report
// ══════════════════════════════════════════════
function SalesReport({ deals, stages, members, companies, allDeals, periodRange }: {
  deals: Deal[]; stages: Stage[]; members: Profile[]; companies: Company[]; allDeals: Deal[];
  periodRange: { start: Date | null; end: Date | null };
}) {
  const [groupBy, setGroupBy] = useState<"stage" | "owner" | "company" | "month">("stage");

  const wonDeals = deals.filter((d) => d.status === "won");
  const lostDeals = deals.filter((d) => d.status === "lost");
  const openDeals = deals.filter((d) => d.status === "open");
  const totalClosed = wonDeals.length + lostDeals.length;
  const winRate = pct(wonDeals.length, totalClosed);
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const avgTicket = wonDeals.length > 0 ? wonValue / wonDeals.length : 0;

  // Avg cycle
  const avgCycle = useMemo(() => {
    if (wonDeals.length === 0) return 0;
    const total = wonDeals.reduce((s, d) => {
      const c = new Date(d.created_at!); const u = d.updated_at ? new Date(d.updated_at) : new Date();
      return s + Math.floor((u.getTime() - c.getTime()) / 86400000);
    }, 0);
    return Math.round(total / wonDeals.length);
  }, [wonDeals]);

  // Funnel
  const funnelData = useMemo(() => stages.map((s, i) => {
    const count = deals.filter((d) => d.stage_id === s.id && d.status === "open").length;
    const val = deals.filter((d) => d.stage_id === s.id && d.status === "open").reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    return { name: s.name, count, value: val, color: s.color || CHART_COLORS[i % CHART_COLORS.length] };
  }), [stages, deals]);

  // Waterfall
  const waterfallData = useMemo(() => [
    { name: "Abertos", value: openDeals.length, fill: "hsl(var(--primary))" },
    { name: "Ganhos", value: wonDeals.length, fill: "hsl(var(--success))" },
    { name: "Perdidos", value: lostDeals.length, fill: "hsl(var(--destructive))" },
  ], [openDeals, wonDeals, lostDeals]);

  // Loss reasons
  const lossReasons = useMemo(() => {
    const map = new Map<string, number>();
    lostDeals.forEach((d) => { const r = d.loss_reason?.trim() || "Não informado"; map.set(r, (map.get(r) || 0) + 1); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [lostDeals]);

  // Grouped table
  const groupedData = useMemo(() => {
    const groups: Record<string, { label: string; deals: Deal[]; won: number; lost: number; value: number }> = {};
    deals.forEach((d) => {
      let key: string;
      let label: string;
      if (groupBy === "stage") {
        key = d.stage_id || "none";
        label = stages.find((s) => s.id === d.stage_id)?.name || "Sem estágio";
      } else if (groupBy === "owner") {
        key = d.owner_id || "none";
        label = members.find((m) => m.id === d.owner_id)?.name || members.find((m) => m.id === d.owner_id)?.email || "Sem dono";
      } else if (groupBy === "company") {
        key = d.company_id || "none";
        label = companies.find((c) => c.id === d.company_id)?.name || "Sem empresa";
      } else {
        const date = d.created_at ? new Date(d.created_at) : new Date();
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        label = `${MONTHS_PT[date.getMonth()]}/${date.getFullYear()}`;
      }
      if (!groups[key]) groups[key] = { label, deals: [], won: 0, lost: 0, value: 0 };
      groups[key].deals.push(d);
      if (d.status === "won") { groups[key].won++; groups[key].value += Number(d.value) || 0; }
      if (d.status === "lost") groups[key].lost++;
    });
    return Object.values(groups).sort((a, b) => b.value - a.value);
  }, [deals, groupBy, stages, members, companies]);

  // Owner performance
  const ownerStats = useMemo(() =>
    members.map((m) => {
      const md = deals.filter((d) => d.owner_id === m.id);
      const mw = md.filter((d) => d.status === "won");
      const ml = md.filter((d) => d.status === "lost");
      const mc = mw.length + ml.length;
      return {
        name: m.name || m.email || "—", total: md.length, won: mw.length, lost: ml.length,
        winRate: pct(mw.length, mc), value: mw.reduce((s, d) => s + (Number(d.value) || 0), 0),
      };
    }).filter((m) => m.total > 0).sort((a, b) => b.value - a.value),
    [members, deals]
  );

  // Conversion between stages
  const stageConversion = useMemo(() => stages.map((s, i) => {
    const count = deals.filter((d) => d.stage_id === s.id).length;
    const prevCount = i > 0 ? deals.filter((d) => d.stage_id === stages[i - 1].id).length : count;
    return { name: s.name, rate: i === 0 ? 100 : pct(count, prevCount) };
  }), [stages, deals]);

  // Avg time per stage
  const avgTimePerStage = useMemo(() => stages.map((s) => {
    const sd = deals.filter((d) => d.stage_id === s.id);
    if (sd.length === 0) return { name: s.name, days: 0 };
    const total = sd.reduce((sum, d) => {
      const c = new Date(d.created_at!); const u = d.updated_at ? new Date(d.updated_at) : new Date();
      return sum + Math.floor((u.getTime() - c.getTime()) / 86400000);
    }, 0);
    return { name: s.name, days: Math.round(total / sd.length) };
  }), [stages, deals]);

  const exportDealsCSV = () => {
    downloadCSV(deals.map((d) => ({
      Título: d.title, Valor: d.value, Status: d.status,
      Estágio: stages.find((s) => s.id === d.stage_id)?.name || "",
      Dono: members.find((m) => m.id === d.owner_id)?.name || "",
      Probabilidade: d.probability, "Data Fechamento": d.close_date,
      "Motivo Perda": d.loss_reason || "", Criado: d.created_at,
    })), "relatorio-vendas");
    toast({ title: "CSV exportado!" });
  };

  const { toast } = useToast();

  return (
    <div className="space-y-4 mt-4">
      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Win Rate", value: `${winRate}%`, icon: Trophy, color: "text-primary" },
          { label: "Ganhos", value: `${wonDeals.length}`, sub: fmt(wonValue), icon: TrendingUp, color: "text-success" },
          { label: "Perdidos", value: `${lostDeals.length}`, icon: XCircle, color: "text-destructive" },
          { label: "Ticket Médio", value: fmt(avgTicket), icon: Target, color: "text-primary" },
          { label: "Ciclo Médio", value: `${avgCycle} dias`, icon: Clock, color: "text-warning" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3 flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-muted`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div>
                <p className="text-lg font-bold">{k.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase">{k.label}</p>
                {k.sub && <p className="text-[9px] text-muted-foreground">{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Waterfall */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Waterfall de Negócios</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={waterfallData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline por Estágio</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {funnelData.map((s) => {
                const max = Math.max(...funnelData.map((f) => f.value), 1);
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] font-medium">{s.name}</span>
                      <span className="text-[10px] text-muted-foreground">{s.count} · {fmt(s.value)}</span>
                    </div>
                    <div className="h-4 rounded bg-muted overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${Math.max((s.value / max) * 100, 2)}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Conversion rates */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Taxa de Conversão por Estágio</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageConversion}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg time per stage */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tempo Médio por Estágio (dias)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={avgTimePerStage} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v} dias`} />
                <Bar dataKey="days" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Loss reasons */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Motivos de Perda</CardTitle></CardHeader>
          <CardContent>
            {lossReasons.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={lossReasons} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {lossReasons.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">Nenhuma perda registrada</div>}
          </CardContent>
        </Card>
      </div>

      {/* Grouped deals table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Negócios Agrupados</CardTitle>
            <div className="flex gap-2">
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <SelectTrigger className="h-7 w-32 text-[10px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stage">Por Estágio</SelectItem>
                  <SelectItem value="owner">Por Dono</SelectItem>
                  <SelectItem value="company">Por Empresa</SelectItem>
                  <SelectItem value="month">Por Mês</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportDealsCSV}>
                <Download className="h-3 w-3 mr-1" />CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Grupo</TableHead>
                  <TableHead className="text-[10px] text-center">Total</TableHead>
                  <TableHead className="text-[10px] text-center">Ganhos</TableHead>
                  <TableHead className="text-[10px] text-center">Perdidos</TableHead>
                  <TableHead className="text-[10px] text-center">Win Rate</TableHead>
                  <TableHead className="text-[10px] text-right">Valor Ganho</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedData.map((g) => (
                  <TableRow key={g.label}>
                    <TableCell className="text-xs font-medium">{g.label}</TableCell>
                    <TableCell className="text-xs text-center">{g.deals.length}</TableCell>
                    <TableCell className="text-xs text-center text-success">{g.won}</TableCell>
                    <TableCell className="text-xs text-center text-destructive">{g.lost}</TableCell>
                    <TableCell className="text-xs text-center">
                      <Badge variant={pct(g.won, g.won + g.lost) >= 50 ? "default" : "secondary"} className="text-[9px]">
                        {pct(g.won, g.won + g.lost)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{fmt(g.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Owner performance */}
      {ownerStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Performance por Vendedor</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Vendedor</TableHead>
                    <TableHead className="text-[10px] text-center">Total</TableHead>
                    <TableHead className="text-[10px] text-center">Ganhos</TableHead>
                    <TableHead className="text-[10px] text-center">Perdidos</TableHead>
                    <TableHead className="text-[10px] text-center">Win Rate</TableHead>
                    <TableHead className="text-[10px] text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownerStats.map((o) => (
                    <TableRow key={o.name}>
                      <TableCell className="text-xs font-medium">{o.name}</TableCell>
                      <TableCell className="text-xs text-center">{o.total}</TableCell>
                      <TableCell className="text-xs text-center text-success">{o.won}</TableCell>
                      <TableCell className="text-xs text-center text-destructive">{o.lost}</TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge variant={o.winRate >= 50 ? "default" : "secondary"} className="text-[9px]">{o.winRate}%</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmt(o.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB 2: Activities Report
// ══════════════════════════════════════════════
function ActivitiesReport({ activities, members }: { activities: ActivityRow[]; members: Profile[] }) {
  const typeLabels: Record<string, string> = { call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa" };

  // By type donut
  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    activities.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1; });
    return Object.entries(map).map(([type, count]) => ({ name: typeLabels[type] || type, value: count }));
  }, [activities]);

  type UserActivityRow = { name: string; total: number; call: number; email: number; meeting: number; note: number; task: number };
  // Per-user per-type table
  const userActivity = useMemo<UserActivityRow[]>(() => {
    return members.map((m) => {
      const ma = activities.filter((a) => a.user_id === m.id);
      return {
        name: m.name || m.email || "—", total: ma.length,
        call: ma.filter((a) => a.type === "call").length,
        email: ma.filter((a) => a.type === "email").length,
        meeting: ma.filter((a) => a.type === "meeting").length,
        note: ma.filter((a) => a.type === "note").length,
        task: ma.filter((a) => a.type === "task").length,
      };
    }).filter((m) => m.total > 0).sort((a, b) => b.total - a.total);
  }, [members, activities]);

  // Completion rate
  const completed = activities.filter((a) => a.completed_at).length;
  const completionRate = pct(completed, activities.length);

  const exportCSV = () => {
    downloadCSV(userActivity.map((u) => ({
      Vendedor: u.name, Total: u.total,
      Ligações: u.call, Emails: u.email, Reuniões: u.meeting, Notas: u.note, Tarefas: u.task,
    })), "relatorio-atividades");
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{activities.length}</p><p className="text-[9px] text-muted-foreground uppercase">Total Atividades</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-success">{completed}</p><p className="text-[9px] text-muted-foreground uppercase">Concluídas</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-primary">{completionRate}%</p><p className="text-[9px] text-muted-foreground uppercase">Taxa Conclusão</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Atividades por Tipo</CardTitle></CardHeader>
          <CardContent>
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">Sem dados</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Atividades por Vendedor</CardTitle></CardHeader>
          <CardContent>
            {userActivity.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={userActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="call" name="Ligação" stackId="a" fill={CHART_COLORS[0]} />
                  <Bar dataKey="email" name="Email" stackId="a" fill={CHART_COLORS[1]} />
                  <Bar dataKey="meeting" name="Reunião" stackId="a" fill={CHART_COLORS[2]} />
                  <Bar dataKey="note" name="Nota" stackId="a" fill={CHART_COLORS[3]} />
                  <Bar dataKey="task" name="Tarefa" stackId="a" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">Sem dados</div>}
          </CardContent>
        </Card>
      </div>

      {/* Detailed table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Comparativo por Vendedor</CardTitle>
            <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportCSV}><Download className="h-3 w-3 mr-1" />CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Vendedor</TableHead>
                  <TableHead className="text-[10px] text-center">Ligações</TableHead>
                  <TableHead className="text-[10px] text-center">Emails</TableHead>
                  <TableHead className="text-[10px] text-center">Reuniões</TableHead>
                  <TableHead className="text-[10px] text-center">Notas</TableHead>
                  <TableHead className="text-[10px] text-center">Tarefas</TableHead>
                  <TableHead className="text-[10px] text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userActivity.map((u) => (
                  <TableRow key={u.name}>
                    <TableCell className="text-xs font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs text-center">{u.call}</TableCell>
                    <TableCell className="text-xs text-center">{u.email}</TableCell>
                    <TableCell className="text-xs text-center">{u.meeting}</TableCell>
                    <TableCell className="text-xs text-center">{u.note}</TableCell>
                    <TableCell className="text-xs text-center">{u.task}</TableCell>
                    <TableCell className="text-xs text-center font-bold">{u.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB 3: Forecast
// ══════════════════════════════════════════════
function ForecastReport({ deals, stages, members, ownerFilter, pipelineFilter }: {
  deals: Deal[]; stages: Stage[]; members: Profile[]; ownerFilter: string; pipelineFilter: string;
}) {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const openDeals = useMemo(() => {
    let list = deals.filter((d) => d.status === "open");
    if (ownerFilter !== "all") list = list.filter((d) => d.owner_id === ownerFilter);
    if (pipelineFilter !== "all") {
      const pipeStages = stages.filter((s) => s.pipeline_id === pipelineFilter).map((s) => s.id);
      list = list.filter((d) => d.stage_id && pipeStages.includes(d.stage_id));
    }
    return list;
  }, [deals, ownerFilter, pipelineFilter, stages]);

  // Next 3 months buckets
  const buckets = useMemo(() => {
    const now = new Date();
    const result: { key: string; label: string; pessimist: number; realist: number; optimist: number; pipeline: number; deals: Deal[] }[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      result.push({ key, label, pessimist: 0, realist: 0, optimist: 0, pipeline: 0, deals: [] });
    }
    openDeals.forEach((deal) => {
      const cd = deal.close_date ? new Date(deal.close_date) : new Date();
      const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
      const bucket = result.find((b) => b.key === key);
      if (!bucket) return;
      const val = Number(deal.value) || 0;
      const prob = Number(deal.probability) || 0;
      bucket.pipeline += val;
      if (prob >= 80) bucket.pessimist += val;
      if (prob >= 50) bucket.realist += val;
      if (prob >= 30) bucket.optimist += val;
      bucket.deals.push(deal);
    });
    return result;
  }, [openDeals]);

  const totals = buckets.reduce((a, b) => ({
    pessimist: a.pessimist + b.pessimist, realist: a.realist + b.realist,
    optimist: a.optimist + b.optimist, pipeline: a.pipeline + b.pipeline,
  }), { pessimist: 0, realist: 0, optimist: 0, pipeline: 0 });

  // Chart data
  const chartData = buckets.map((b) => ({
    month: b.label, Pessimista: b.pessimist, Realista: b.realist, Otimista: b.optimist,
  }));

  // Inline probability edit
  const updateProbability = async (dealId: string, newProb: number) => {
    const { error } = await supabase.from("deals").update({ probability: newProb }).eq("id", dealId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Probabilidade atualizada" });
    // Update local state
    const idx = deals.findIndex((d) => d.id === dealId);
    if (idx >= 0) deals[idx].probability = newProb;
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-3"><p className="text-[9px] text-muted-foreground uppercase">Pessimista (≥80%)</p><p className="text-xl font-bold text-destructive">{fmt(totals.pessimist)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[9px] text-muted-foreground uppercase">Realista (≥50%)</p><p className="text-xl font-bold text-primary">{fmt(totals.realist)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[9px] text-muted-foreground uppercase">Otimista (≥30%)</p><p className="text-xl font-bold text-success">{fmt(totals.optimist)}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[9px] text-muted-foreground uppercase">Pipeline Total</p><p className="text-xl font-bold">{fmt(totals.pipeline)}</p></CardContent></Card>
      </div>

      {/* Comparison chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Previsão de Receita — Próximos 3 Meses</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
              <Bar dataKey="Pessimista" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Realista" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Otimista" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly deal breakdown */}
      {buckets.map((bucket) => (
        <Card key={bucket.key}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm capitalize">{bucket.label}</CardTitle>
              <div className="flex items-center gap-3 text-[10px]">
                <span><span className="inline-block h-2 w-2 rounded-full bg-destructive mr-1" />Pess: {fmt(bucket.pessimist)}</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-primary mr-1" />Real: {fmt(bucket.realist)}</span>
                <span><span className="inline-block h-2 w-2 rounded-full bg-success mr-1" />Otim: {fmt(bucket.optimist)}</span>
              </div>
            </div>
            {/* Stacked bar */}
            {bucket.pipeline > 0 && (
              <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-muted flex">
                <div className="h-full bg-destructive" style={{ width: `${(bucket.pessimist / bucket.pipeline) * 100}%` }} />
                <div className="h-full bg-primary" style={{ width: `${((bucket.realist - bucket.pessimist) / bucket.pipeline) * 100}%` }} />
                <div className="h-full bg-success" style={{ width: `${((bucket.optimist - bucket.realist) / bucket.pipeline) * 100}%` }} />
              </div>
            )}
          </CardHeader>
          {bucket.deals.length > 0 && (
            <CardContent>
              <div className="space-y-1">
                {bucket.deals.sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).map((deal) => {
                  const prob = Number(deal.probability) || 0;
                  const stageName = stages.find((s) => s.id === deal.stage_id)?.name || "—";
                  const scenario = prob >= 80 ? "Pessimista" : prob >= 50 ? "Realista" : prob >= 30 ? "Otimista" : "Fora";
                  const scenarioColor = prob >= 80 ? "text-destructive" : prob >= 50 ? "text-primary" : prob >= 30 ? "text-success" : "text-muted-foreground";
                  return (
                    <div key={deal.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{deal.title}</span>
                        <Badge variant="secondary" className="text-[8px] shrink-0">{stageName}</Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-[8px] ${scenarioColor}`}>{scenario}</Badge>
                        <Select
                          value={String(prob)}
                          onValueChange={(v) => updateProbability(deal.id, Number(v))}
                        >
                          <SelectTrigger className="h-5 w-16 text-[9px] border-dashed"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => (
                              <SelectItem key={p} value={String(p)}>{p}%</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="font-bold text-primary">{fmt(Number(deal.value) || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB 4: Contacts Report
// ══════════════════════════════════════════════
function ContactsReport({ contacts, members }: { contacts: Contact[]; members: Profile[] }) {
  // Monthly growth (last 12 months)
  const monthlyGrowth = useMemo(() => {
    const now = new Date();
    const data: { month: string; novos: number; total: number }[] = [];
    let cumulative = 0;
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const newInMonth = contacts.filter((c) => {
        if (!c.created_at) return false;
        const cd = new Date(c.created_at);
        return cd >= d && cd < nextMonth;
      }).length;
      cumulative += newInMonth;
      data.push({ month: MONTHS_PT[d.getMonth()], novos: newInMonth, total: cumulative });
    }
    return data;
  }, [contacts]);

  // By status
  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    const labels: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned" };
    contacts.forEach((c) => { const s = c.status || "lead"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [contacts]);

  // Conversion rate lead → customer
  const totalLeads = contacts.filter((c) => c.status === "lead" || c.status === "prospect" || c.status === "customer").length;
  const totalCustomers = contacts.filter((c) => c.status === "customer").length;
  const conversionRate = pct(totalCustomers, totalLeads);

  // By owner
  const byOwner = useMemo(() =>
    members.map((m) => ({
      name: m.name || m.email || "—",
      count: contacts.filter((c) => c.owner_id === m.id).length,
    })).filter((m) => m.count > 0).sort((a, b) => b.count - a.count),
    [members, contacts]
  );

  const exportCSV = () => {
    downloadCSV(contacts.map((c) => ({
      Nome: `${c.first_name} ${c.last_name || ""}`.trim(),
      Status: c.status, Score: c.lead_score,
      Dono: members.find((m) => m.id === c.owner_id)?.name || "",
      Criado: c.created_at,
    })), "relatorio-contatos");
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid gap-3 grid-cols-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{contacts.length}</p><p className="text-[9px] text-muted-foreground uppercase">Total Contatos</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-success">{totalCustomers}</p><p className="text-[9px] text-muted-foreground uppercase">Clientes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-primary">{conversionRate}%</p><p className="text-[9px] text-muted-foreground uppercase">Lead → Cliente</p></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Crescimento Mensal</CardTitle>
              <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={exportCSV}><Download className="h-3 w-3 mr-1" />CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyGrowth}>
                <defs>
                  <linearGradient id="contactGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="url(#contactGrad)" strokeWidth={2} name="Cumulativo" />
                <Bar dataKey="novos" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} name="Novos" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {byOwner.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Contatos por Dono</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byOwner}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Contatos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════
// TAB 5: Custom Report Builder
// ══════════════════════════════════════════════
function CustomReportBuilder({ deals, contacts, activities, stages, members, companies, orgId }: {
  deals: Deal[]; contacts: Contact[]; activities: ActivityRow[]; stages: Stage[]; members: Profile[]; companies: Company[]; orgId: string;
}) {
  const { toast } = useToast();
  const [entity, setEntity] = useState<"deals" | "contacts" | "activities">("deals");
  const [savedReports, setSavedReports] = useState<{ id: string; name: string; entity: string; fields: string[]; filters: any }[]>([]);
  const [reportName, setReportName] = useState("");

  const fieldOptions: Record<string, { key: string; label: string }[]> = {
    deals: [
      { key: "title", label: "Título" }, { key: "value", label: "Valor" }, { key: "status", label: "Status" },
      { key: "stage", label: "Estágio" }, { key: "owner", label: "Dono" }, { key: "probability", label: "Prob %" },
      { key: "close_date", label: "Data Fechamento" }, { key: "loss_reason", label: "Motivo Perda" },
      { key: "created_at", label: "Criado em" },
    ],
    contacts: [
      { key: "name", label: "Nome" }, { key: "status", label: "Status" }, { key: "lead_score", label: "Score" },
      { key: "owner", label: "Dono" }, { key: "created_at", label: "Criado em" },
    ],
    activities: [
      { key: "title", label: "Título" }, { key: "type", label: "Tipo" }, { key: "user", label: "Responsável" },
      { key: "completed", label: "Concluída" }, { key: "created_at", label: "Criado em" },
    ],
  };

  const [selectedFields, setSelectedFields] = useState<string[]>(fieldOptions.deals.map((f) => f.key));

  const toggleField = (key: string) => {
    setSelectedFields((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  useEffect(() => {
    setSelectedFields(fieldOptions[entity].map((f) => f.key));
  }, [entity]);

  // Load saved reports
  useEffect(() => {
    supabase.from("segments").select("*").eq("org_id", orgId).then(({ data }) => {
      // Reuse segments table with a convention
      const reports = (data || []).filter((s: any) => {
        try { return JSON.parse(JSON.stringify(s.filters))?.type === "custom_report"; } catch { return false; }
      }).map((s: any) => ({
        id: s.id, name: s.name,
        entity: (s.filters as any)?.entity || "deals",
        fields: (s.filters as any)?.fields || [],
        filters: s.filters,
      }));
      setSavedReports(reports);
    });
  }, [orgId]);

  // Generate table data
  const tableData = useMemo(() => {
    if (entity === "deals") {
      return deals.map((d) => ({
        title: d.title, value: fmt(Number(d.value) || 0), status: d.status || "—",
        stage: stages.find((s) => s.id === d.stage_id)?.name || "—",
        owner: members.find((m) => m.id === d.owner_id)?.name || "—",
        probability: `${d.probability || 0}%`, close_date: d.close_date || "—",
        loss_reason: d.loss_reason || "—", created_at: d.created_at?.slice(0, 10) || "—",
      }));
    } else if (entity === "contacts") {
      return contacts.map((c) => ({
        name: `${c.first_name} ${c.last_name || ""}`.trim(), status: c.status || "—",
        lead_score: String(c.lead_score || 0),
        owner: members.find((m) => m.id === c.owner_id)?.name || "—",
        created_at: c.created_at?.slice(0, 10) || "—",
      }));
    } else {
      const typeLabels: Record<string, string> = { call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa" };
      return activities.map((a) => ({
        title: a.title, type: typeLabels[a.type] || a.type,
        user: members.find((m) => m.id === a.user_id)?.name || "—",
        completed: a.completed_at ? "Sim" : "Não",
        created_at: a.created_at?.slice(0, 10) || "—",
      }));
    }
  }, [entity, deals, contacts, activities, stages, members, selectedFields]);

  const exportCSV = () => {
    const filtered = tableData.map((row) => {
      const obj: Record<string, any> = {};
      selectedFields.forEach((f) => { obj[fieldOptions[entity].find((fo) => fo.key === f)?.label || f] = (row as any)[f]; });
      return obj;
    });
    downloadCSV(filtered, `relatorio-${entity}`);
    toast({ title: "CSV exportado!" });
  };

  const saveReport = async () => {
    if (!reportName.trim()) { toast({ title: "Informe um nome", variant: "destructive" }); return; }
    const { error } = await supabase.from("segments").insert({
      org_id: orgId, name: reportName,
      filters: { type: "custom_report", entity, fields: selectedFields } as any,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Relatório salvo!" });
    setReportName("");
  };

  const loadReport = (r: typeof savedReports[0]) => {
    setEntity(r.entity as any);
    setSelectedFields(r.fields);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-[10px]">Entidade</Label>
          <Select value={entity} onValueChange={(v) => setEntity(v as any)}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="deals">Negócios</SelectItem>
              <SelectItem value="contacts">Contatos</SelectItem>
              <SelectItem value="activities">Atividades</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-[10px]">Campos</Label>
          <div className="flex flex-wrap gap-1 mt-1">
            {fieldOptions[entity].map((f) => (
              <Badge
                key={f.key}
                variant={selectedFields.includes(f.key) ? "default" : "outline"}
                className="cursor-pointer text-[9px]"
                onClick={() => toggleField(f.key)}
              >
                {f.label}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex gap-1 items-end ml-auto">
          <Input
            placeholder="Nome do relatório"
            aria-label="Nome do relatório"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            className="h-8 w-40 text-xs"
          />
          <Button size="sm" className="h-8 text-xs" onClick={saveReport}>Salvar</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCSV}>
            <Download className="h-3 w-3 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* Saved reports */}
      {savedReports.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Salvos:</span>
          {savedReports.map((r) => (
            <Badge key={r.id} variant="secondary" className="cursor-pointer text-[9px]" onClick={() => loadReport(r)}>
              {r.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-auto max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectedFields.map((f) => (
                    <TableHead key={f} className="text-[10px] whitespace-nowrap">
                      {fieldOptions[entity].find((fo) => fo.key === f)?.label || f}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.slice(0, 100).map((row, i) => (
                  <TableRow key={i}>
                    {selectedFields.map((f) => (
                      <TableCell key={f} className="text-xs whitespace-nowrap">{(row as any)[f]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {tableData.length > 100 && (
            <p className="text-[10px] text-muted-foreground text-center py-2">Mostrando 100 de {tableData.length} registros. Exporte CSV para ver todos.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
