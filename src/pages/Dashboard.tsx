import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  DollarSign, Users, Handshake, Activity, TrendingUp, TrendingDown,
  Target, Clock, AlertTriangle, RefreshCw, ArrowRight, Zap,
  CalendarDays, Award, BarChart3,
} from "lucide-react";
import { DashboardAIChat } from "@/components/crm/DashboardAIChat";
import { AutomotivePanel } from "@/components/dashboard/AutomotivePanel";

// ── Helpers ──────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 11,
};

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(190, 95%, 39%)",
  "hsl(326, 78%, 55%)", "hsl(25, 95%, 53%)",
];

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type Deal = {
  id: string; title: string; value: number | null; stage_id: string | null;
  status: string | null; owner_id: string | null; close_date: string | null;
  probability: number | null; created_at: string | null; updated_at: string | null;
  contact_id: string | null; company_id: string | null;
};
type Stage = { id: string; name: string; order: number; color: string | null; win_probability: number | null; pipeline_id: string };
type ActivityRow = {
  id: string; type: string; title: string; due_date: string | null;
  completed_at: string | null; created_at: string | null; user_id: string | null;
  deal_id: string | null; contact_id: string | null;
};
type Contact = { id: string; first_name: string; last_name: string | null; lead_score: number; status: string | null; created_at: string | null };
type Profile = { id: string; name: string | null; email: string | null };
type Pipeline = { id: string; name: string; is_default: boolean | null };

type PeriodFilter = "today" | "this_week" | "this_month" | "this_quarter" | "this_year" | "all";

// ── Period helpers ──────────────────────────
function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  switch (period) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "this_week": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d; }
    case "this_month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "this_quarter": return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case "this_year": return new Date(now.getFullYear(), 0, 1);
    case "all": return null;
  }
}

function inPeriod(dateStr: string | null, start: Date | null): boolean {
  if (!start || !dateStr) return true;
  return new Date(dateStr) >= start;
}

// ── Gauge component ─────────────────────────
function GaugeChart({ value, max, label }: { value: number; max: number; label: string }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const angle = (percentage / 100) * 180;
  const color = percentage >= 100 ? "hsl(var(--success))" : percentage >= 70 ? "hsl(var(--primary))" : percentage >= 40 ? "hsl(var(--warning))" : "hsl(var(--destructive))";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
        {/* Background arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
        {/* Value arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 251.2} 251.2`}
        />
        <text x="100" y="85" textAnchor="middle" className="fill-foreground" fontSize="28" fontWeight="700">
          {Math.round(percentage)}%
        </text>
        <text x="100" y="110" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="10">
          {label}
        </text>
      </svg>
      <p className="text-xs text-muted-foreground mt-1">{fmt(value)} / {fmt(max)}</p>
    </div>
  );
}

// ── Main ─────────────────────────────────────
export default function Dashboard() {
  const { orgId } = useOrg();
  const navigate = useNavigate();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isAutomotive, setIsAutomotive] = useState(false);

  // Filters
  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");

  // Revenue goal (from org settings or default)
  const monthlyGoal = 100000;

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const [dRes, sRes, aRes, cRes, mRes, pRes] = await Promise.all([
      supabase.from("deals").select("*").eq("org_id", orgId),
      supabase.from("pipeline_stages").select("*").eq("org_id", orgId).order("order"),
      supabase.from("activities").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(500),
      supabase.from("contacts").select("id,first_name,last_name,lead_score,status,created_at").eq("org_id", orgId),
      supabase.from("profiles").select("id,name,email").eq("org_id", orgId),
      supabase.from("pipelines").select("id,name,is_default").eq("org_id", orgId),
    ]);
    setDeals((dRes.data as Deal[]) || []);
    setStages((sRes.data as Stage[]) || []);

    // Detect automotive segment (CRM Automotivo) from organizations.settings.
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    const settings = (org?.settings as { segment?: string } | null) ?? {};
    setIsAutomotive(settings.segment === "automotivo");

    setActivities((aRes.data as ActivityRow[]) || []);
    setContacts((cRes.data as Contact[]) || []);
    setMembers((mRes.data as Profile[]) || []);
    setPipelines((pRes.data as Pipeline[]) || []);
    setLoading(false);
    setLastRefresh(new Date());
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const timer = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  // ── Filtered data ──────────────────
  const periodStart = getPeriodStart(period);

  const filteredDeals = useMemo(() => {
    let list = deals;
    if (ownerFilter !== "all") list = list.filter((d) => d.owner_id === ownerFilter);
    if (pipelineFilter !== "all") {
      const pipeStages = stages.filter((s) => s.pipeline_id === pipelineFilter).map((s) => s.id);
      list = list.filter((d) => d.stage_id && pipeStages.includes(d.stage_id));
    }
    return list;
  }, [deals, ownerFilter, pipelineFilter, stages]);

  const periodDeals = useMemo(() =>
    filteredDeals.filter((d) => inPeriod(d.created_at, periodStart)),
    [filteredDeals, periodStart]
  );

  const filteredActivities = useMemo(() => {
    let list = activities;
    if (ownerFilter !== "all") list = list.filter((a) => a.user_id === ownerFilter);
    return list.filter((a) => inPeriod(a.created_at, periodStart));
  }, [activities, ownerFilter, periodStart]);

  // ── KPIs ───────────────────────────
  const wonDeals = periodDeals.filter((d) => d.status === "won");
  const lostDeals = periodDeals.filter((d) => d.status === "lost");
  const openDeals = filteredDeals.filter((d) => d.status === "open");
  const totalClosed = wonDeals.length + lostDeals.length;
  const wonRevenue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const winRate = pct(wonDeals.length, totalClosed);
  const avgTicket = wonDeals.length > 0 ? wonRevenue / wonDeals.length : 0;
  const pipelineValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  // Avg cycle (days from created to won)
  const avgCycle = useMemo(() => {
    if (wonDeals.length === 0) return 0;
    const total = wonDeals.reduce((s, d) => {
      const created = new Date(d.created_at!);
      const updated = d.updated_at ? new Date(d.updated_at) : new Date();
      return s + Math.floor((updated.getTime() - created.getTime()) / 86400000);
    }, 0);
    return Math.round(total / wonDeals.length);
  }, [wonDeals]);

  // Previous period comparison
  const prevPeriodRevenue = useMemo(() => {
    if (period === "all") return 0;
    const now = new Date();
    let prevStart: Date;
    let prevEnd: Date;
    switch (period) {
      case "this_month":
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "this_quarter":
        const qStart = Math.floor(now.getMonth() / 3) * 3;
        prevStart = new Date(now.getFullYear(), qStart - 3, 1);
        prevEnd = new Date(now.getFullYear(), qStart, 0);
        break;
      default:
        return 0;
    }
    return filteredDeals
      .filter((d) => d.status === "won" && d.created_at && new Date(d.created_at) >= prevStart && new Date(d.created_at) <= prevEnd)
      .reduce((s, d) => s + (Number(d.value) || 0), 0);
  }, [filteredDeals, period]);

  const revenueVariation = prevPeriodRevenue > 0 ? Math.round(((wonRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100) : 0;

  // ── Monthly revenue (last 12 months) ───────
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const data: { month: string; receita: number; tendencia: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthWon = filteredDeals.filter((deal) => {
        if (deal.status !== "won" || !deal.created_at) return false;
        const c = new Date(deal.created_at);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
      });
      data.push({
        month: MONTHS_PT[d.getMonth()],
        receita: monthWon.reduce((s, deal) => s + (Number(deal.value) || 0), 0),
        tendencia: 0,
      });
    }
    // Simple moving average for trend
    for (let i = 0; i < data.length; i++) {
      const window = data.slice(Math.max(0, i - 2), i + 1);
      data[i].tendencia = Math.round(window.reduce((s, d) => s + d.receita, 0) / window.length);
    }
    return data;
  }, [filteredDeals]);

  // ── Pipeline funnel ────────────────
  const funnelData = useMemo(() => {
    const pipeStages = pipelineFilter !== "all"
      ? stages.filter((s) => s.pipeline_id === pipelineFilter)
      : stages;
    return pipeStages.map((s) => {
      const stageDeals = openDeals.filter((d) => d.stage_id === s.id);
      return {
        name: s.name,
        count: stageDeals.length,
        value: stageDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
        color: s.color || "hsl(var(--primary))",
      };
    });
  }, [stages, openDeals, pipelineFilter]);

  // ── Activities by type (donut) ────
  const actByType = useMemo(() => {
    const map: Record<string, number> = {};
    filteredActivities.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1; });
    const labels: Record<string, string> = { call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa" };
    return Object.entries(map).map(([type, count]) => ({ name: labels[type] || type, value: count }));
  }, [filteredActivities]);

  // ── Top performers ─────────────────
  const topPerformers = useMemo(() => {
    return members.map((m) => {
      const mWon = wonDeals.filter((d) => d.owner_id === m.id);
      return {
        name: m.name || m.email || "—",
        deals: mWon.length,
        revenue: mWon.reduce((s, d) => s + (Number(d.value) || 0), 0),
      };
    }).filter((m) => m.deals > 0).sort((a, b) => b.revenue - a.revenue);
  }, [members, wonDeals]);

  // ── Activity heatmap (by day of week) ─────
  const actByDay = useMemo(() => {
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const counts = new Array(7).fill(0);
    filteredActivities.forEach((a) => {
      if (a.created_at) counts[new Date(a.created_at).getDay()]++;
    });
    return days.map((d, i) => ({ day: d, count: counts[i] }));
  }, [filteredActivities]);

  // ── Lead score distribution ────────
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { label: "0-20", min: 0, max: 20, count: 0 },
      { label: "21-40", min: 21, max: 40, count: 0 },
      { label: "41-60", min: 41, max: 60, count: 0 },
      { label: "61-80", min: 61, max: 80, count: 0 },
      { label: "81-100", min: 81, max: 100, count: 0 },
    ];
    contacts.forEach((c) => {
      const s = c.lead_score || 0;
      const bucket = buckets.find((b) => s >= b.min && s <= b.max);
      if (bucket) bucket.count++;
    });
    return buckets;
  }, [contacts]);

  // ── At-risk deals ──────────────────
  const atRiskDeals = useMemo(() => {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 86400000);

    const inactive = openDeals.filter((d) => {
      if (!d.updated_at) return true;
      return new Date(d.updated_at) < fourteenDaysAgo;
    }).sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 5);

    const closingSoon = openDeals.filter((d) => {
      if (!d.close_date) return false;
      const cd = new Date(d.close_date);
      return cd <= sevenDaysFromNow && (Number(d.probability) || 0) < 50;
    }).sort((a, b) => new Date(a.close_date!).getTime() - new Date(b.close_date!).getTime());

    return { inactive, closingSoon };
  }, [openDeals]);

  // ── New leads by source (simplified) ──────
  const newLeadsByStatus = useMemo(() => {
    const periodContacts = contacts.filter((c) => inPeriod(c.created_at, periodStart));
    const map: Record<string, number> = {};
    periodContacts.forEach((c) => {
      const s = c.status || "lead";
      map[s] = (map[s] || 0) + 1;
    });
    const labels: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned" };
    return Object.entries(map).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [contacts, periodStart]);

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="mb-2 text-xl font-semibold">Bem-vindo ao CRM Automotivo!</h2>
        <p className="text-muted-foreground">Vá em Configurações para criar sua organização.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header + Filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            Atualizado {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {isAutomotive && <span className="ml-2 text-primary">· CRM Automotivo</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="this_week">Esta semana</SelectItem>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="this_quarter">Trimestre</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda equipe</SelectItem>
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
          <Button variant="outline" size="sm" className="h-8" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* ── Painel automotivo (apenas se segment=automotivo) ── */}
      {isAutomotive && orgId && <AutomotivePanel orgId={orgId} />}

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Receita</span>
              <DollarSign className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="text-xl font-bold">{fmt(wonRevenue)}</p>
            {revenueVariation !== 0 && (
              <div className={`flex items-center gap-0.5 text-[10px] ${revenueVariation > 0 ? "text-success" : "text-destructive"}`}>
                {revenueVariation > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                {revenueVariation > 0 ? "+" : ""}{revenueVariation}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ganhos</span>
              <Handshake className="h-3.5 w-3.5 text-success" />
            </div>
            <p className="text-xl font-bold">{wonDeals.length}</p>
            <p className="text-[10px] text-muted-foreground">{fmt(pipelineValue)} em pipeline</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Win Rate</span>
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground">{totalClosed} fechados</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/deals")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ticket Médio</span>
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{fmt(avgTicket)}</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/activities")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ciclo Médio</span>
              <Clock className="h-3.5 w-3.5 text-warning" />
            </div>
            <p className="text-xl font-bold">{avgCycle}</p>
            <p className="text-[10px] text-muted-foreground">dias</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/contacts")}>
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Contatos</span>
              <Users className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-xl font-bold">{contacts.length}</p>
            <p className="text-[10px] text-muted-foreground">{contacts.filter((c) => inPeriod(c.created_at, periodStart)).length} novos</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 1: Revenue chart + Goal gauge ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Receita Mensal (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={monthlyRevenue}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmt(v)} />
                <Area type="monotone" dataKey="receita" stroke="hsl(var(--primary))" fill="url(#colorRevenue)" strokeWidth={2} />
                <Line type="monotone" dataKey="tendencia" stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Meta do Mês</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <GaugeChart value={wonRevenue} max={monthlyGoal} label={fmt(monthlyGoal)} />
          </CardContent>
        </Card>
      </div>



      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Pipeline por Estágio</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => navigate("/deals")}>
                Ver pipeline <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {funnelData.length > 0 ? (
              <div className="space-y-2">
                {funnelData.map((s, i) => {
                  const maxVal = Math.max(...funnelData.map((f) => f.value), 1);
                  return (
                    <div key={s.name}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium">{s.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{s.count} negócios</span>
                          <span className="font-medium text-foreground">{fmt(s.value)}</span>
                        </div>
                      </div>
                      <div className="h-5 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full rounded transition-all flex items-center justify-end pr-1"
                          style={{
                            width: `${Math.max((s.value / maxVal) * 100, 3)}%`,
                            backgroundColor: s.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividades por Tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {actByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={actByType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {actByType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-muted-foreground text-sm">Nenhuma atividade</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Top performers + Activity heatmap ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Award className="h-4 w-4 text-warning" />Top Performers</CardTitle>
          </CardHeader>
          <CardContent>
            {topPerformers.length > 0 ? (
              <div className="space-y-2">
                {topPerformers.slice(0, 5).map((p, i) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? "bg-warning/20 text-warning" : i === 1 ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <span className="text-xs font-medium truncate">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="secondary" className="text-[9px]">{p.deals} deals</Badge>
                      <span className="text-xs font-bold text-success">{fmt(p.revenue)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Atividades por Dia da Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={actByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Leads + Score distribution ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Novos Contatos por Status</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => navigate("/contacts")}>
                Ver todos <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {newLeadsByStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={newLeadsByStatus}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {newLeadsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-muted-foreground text-sm">Nenhum dado</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Distribuição de Lead Score</CardTitle>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => navigate("/lead-scoring")}>
                Ver scoring <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {scoreDistribution.map((_, i) => (
                    <Cell key={i} fill={["hsl(var(--muted-foreground))", "hsl(var(--warning))", "hsl(38, 92%, 50%)", "hsl(var(--primary))", "hsl(var(--success))"][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: At-risk deals ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />Negócios sem Atividade ({">"}14 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskDeals.inactive.length > 0 ? (
              <div className="space-y-2">
                {atRiskDeals.inactive.map((d) => {
                  const daysSince = d.updated_at ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000) : 999;
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 p-2 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => navigate(`/deals/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground">{daysSince} dias sem atividade</p>
                      </div>
                      <span className="text-xs font-bold text-destructive shrink-0">{fmt(Number(d.value) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">Nenhum negócio em risco 🎉</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-warning" />Fechamento Próximo (prob {"<"} 50%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRiskDeals.closingSoon.length > 0 ? (
              <div className="space-y-2">
                {atRiskDeals.closingSoon.slice(0, 5).map((d) => {
                  const daysLeft = d.close_date ? Math.ceil((new Date(d.close_date).getTime() - Date.now()) / 86400000) : 0;
                  return (
                    <div key={d.id} className="flex items-center justify-between rounded-md border border-warning/20 bg-warning/5 p-2 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => navigate(`/deals/${d.id}`)}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{d.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {daysLeft <= 0 ? "Vencido" : `${daysLeft} dias`} · {Number(d.probability) || 0}% prob
                        </p>
                      </div>
                      <span className="text-xs font-bold text-warning shrink-0">{fmt(Number(d.value) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center text-muted-foreground text-sm">Nenhum negócio com fechamento próximo</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── AI Sales Manager Chat ── */}
      <DashboardAIChat
        crmData={{
          wonRevenue,
          pipelineValue,
          openDealsCount: openDeals.length,
          winRate,
          avgTicket,
          avgCycle,
          wonDealsCount: wonDeals.length,
          lostDealsCount: lostDeals.length,
          pendingActivities: filteredActivities.filter((a) => !a.completed_at).length,
          newLeadsCount: contacts.filter((c) => inPeriod(c.created_at, periodStart)).length,
          atRiskDeals: atRiskDeals.inactive.map((d) => ({
            title: d.title,
            value: Number(d.value) || 0,
            daysSinceUpdate: d.updated_at ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000) : 999,
          })),
          closingSoonDeals: atRiskDeals.closingSoon.map((d) => ({
            title: d.title,
            value: Number(d.value) || 0,
            daysLeft: d.close_date ? Math.ceil((new Date(d.close_date).getTime() - Date.now()) / 86400000) : 0,
            probability: Number(d.probability) || 0,
          })),
          topPerformers,
          funnelData: funnelData.map((f) => ({ name: f.name, count: f.count, value: f.value })),
        }}
      />
    </div>
  );
}
