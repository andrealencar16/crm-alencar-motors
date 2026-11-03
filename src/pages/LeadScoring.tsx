import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Zap, Edit2, Trash2, MoreHorizontal, Download, Users, Filter,
  TrendingUp, TrendingDown, Target, Search, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LeadScoreBadge } from "@/components/crm/DealQualification";

type Contact = {
  id: string; first_name: string; last_name: string | null; email: string | null;
  status: string | null; lead_score: number; org_id: string; created_at: string | null;
  owner_id: string | null;
};
type Segment = {
  id: string; org_id: string; name: string; description: string | null;
  filters: any; created_by: string | null; created_at: string | null;
};
type ScoringRule = {
  id: string; org_id: string; event_type: string; label: string;
  points: number; is_active: boolean;
};
type ScoreHistory = {
  id: string; contact_id: string; points: number; reason: string;
  event_type: string | null; created_at: string | null;
};
type Profile = {
  id: string; name: string | null; email: string | null;
};

const DEFAULT_RULES = [
  { event_type: "email_opened", label: "Abertura de email", points: 5 },
  { event_type: "link_clicked", label: "Clique em link", points: 10 },
  { event_type: "meeting_done", label: "Reunião realizada", points: 20 },
  { event_type: "email_replied", label: "Resposta a email", points: 15 },
  { event_type: "website_visit", label: "Visita ao website", points: 3 },
  { event_type: "inactivity_30d", label: "Inatividade 30 dias", points: -10 },
];

type Tab = "scoring" | "segments" | "history";

const EVENT_TYPES = [
  { value: "email_opened", label: "Abertura de email" },
  { value: "link_clicked", label: "Clique em link" },
  { value: "meeting_done", label: "Reunião realizada" },
  { value: "email_replied", label: "Resposta a email" },
  { value: "website_visit", label: "Visita ao website" },
  { value: "form_submitted", label: "Formulário enviado" },
  { value: "deal_created", label: "Negócio criado" },
  { value: "call_done", label: "Ligação realizada" },
  { value: "inactivity_30d", label: "Inatividade 30 dias" },
  { value: "custom", label: "Personalizado" },
];

export default function LeadScoring() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("scoring");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [history, setHistory] = useState<ScoreHistory[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");

  // Segment form
  const [segFormOpen, setSegFormOpen] = useState(false);
  const [segName, setSegName] = useState("");
  const [segDesc, setSegDesc] = useState("");
  const [segFilters, setSegFilters] = useState<{ minScore: string; maxScore: string; status: string }>({ minScore: "", maxScore: "", status: "all" });
  const [editSegId, setEditSegId] = useState<string | null>(null);

  // New rule form
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleLabel, setRuleLabel] = useState("");
  const [ruleEventType, setRuleEventType] = useState("custom");
  const [ruleCustomEvent, setRuleCustomEvent] = useState("");
  const [rulePoints, setRulePoints] = useState(5);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);

  // Manual score adjust
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustContactId, setAdjustContactId] = useState("");
  const [adjustPoints, setAdjustPoints] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");

  // History filter
  const [historyContactId, setHistoryContactId] = useState("all");

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    const [cRes, rRes, sRes, hRes, mRes] = await Promise.all([
      supabase.from("contacts").select("id,first_name,last_name,email,status,lead_score,org_id,created_at,owner_id").eq("org_id", orgId).order("lead_score", { ascending: false }),
      supabase.from("lead_scoring_rules").select("*").eq("org_id", orgId).order("points", { ascending: false }),
      supabase.from("segments").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("lead_score_history").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200),
      supabase.from("profiles").select("id,name,email").eq("org_id", orgId),
    ]);
    setContacts((cRes.data as Contact[]) || []);
    setRules((rRes.data as ScoringRule[]) || []);
    setSegments((sRes.data as Segment[]) || []);
    setHistory((hRes.data as ScoreHistory[]) || []);
    setMembers((mRes.data as Profile[]) || []);
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Initialize default rules if none
  useEffect(() => {
    if (orgId && rules.length === 0 && contacts.length >= 0) {
      // Only seed once
      const seed = async () => {
        const existing = await supabase.from("lead_scoring_rules").select("id").eq("org_id", orgId).limit(1);
        if ((existing.data || []).length > 0) return;
        await supabase.from("lead_scoring_rules").insert(
          DEFAULT_RULES.map((r) => ({ ...r, org_id: orgId })) as any
        );
        fetchAll();
      };
      seed();
    }
  }, [orgId, rules.length]);

  const toggleRule = async (id: string, active: boolean) => {
    await supabase.from("lead_scoring_rules").update({ is_active: active } as any).eq("id", id);
    fetchAll();
  };

  const updateRulePoints = async (id: string, points: number) => {
    await supabase.from("lead_scoring_rules").update({ points } as any).eq("id", id);
    fetchAll();
  };

  const deleteRule = async (id: string) => {
    await supabase.from("lead_scoring_rules").delete().eq("id", id);
    fetchAll();
  };

  const openNewRule = () => {
    setEditRuleId(null);
    setRuleLabel("");
    setRuleEventType("custom");
    setRuleCustomEvent("");
    setRulePoints(5);
    setRuleFormOpen(true);
  };

  const openEditRule = (r: ScoringRule) => {
    setEditRuleId(r.id);
    setRuleLabel(r.label);
    const known = EVENT_TYPES.find((e) => e.value === r.event_type);
    if (known && known.value !== "custom") {
      setRuleEventType(r.event_type);
      setRuleCustomEvent("");
    } else {
      setRuleEventType("custom");
      setRuleCustomEvent(r.event_type);
    }
    setRulePoints(r.points);
    setRuleFormOpen(true);
  };

  const saveRule = async () => {
    if (!orgId || !ruleLabel.trim()) return;
    const eventType = ruleEventType === "custom" ? (ruleCustomEvent.trim() || "custom") : ruleEventType;
    if (editRuleId) {
      await supabase.from("lead_scoring_rules").update({ label: ruleLabel.trim(), event_type: eventType, points: rulePoints } as any).eq("id", editRuleId);
      toast({ title: "Regra atualizada" });
    } else {
      await supabase.from("lead_scoring_rules").insert({ org_id: orgId, label: ruleLabel.trim(), event_type: eventType, points: rulePoints } as any);
      toast({ title: "Regra criada" });
    }
    setRuleFormOpen(false);
    fetchAll();
  };

  // Manual score adjustment
  const submitAdjust = async () => {
    if (!orgId || !adjustContactId || !adjustReason.trim()) return;
    const contact = contacts.find((c) => c.id === adjustContactId);
    if (!contact) return;
    const newScore = Math.max(0, Math.min(100, (contact.lead_score || 0) + adjustPoints));
    await supabase.from("contacts").update({ lead_score: newScore } as any).eq("id", adjustContactId);
    await supabase.from("lead_score_history").insert({
      org_id: orgId, contact_id: adjustContactId, points: adjustPoints,
      reason: adjustReason, event_type: "manual",
    } as any);
    setAdjustOpen(false);
    fetchAll();
    toast({ title: `Score ajustado em ${adjustPoints > 0 ? "+" : ""}${adjustPoints}` });
  };

  // Segments
  const saveSegment = async () => {
    if (!orgId || !segName.trim()) return;
    const filters = {
      minScore: segFilters.minScore ? Number(segFilters.minScore) : undefined,
      maxScore: segFilters.maxScore ? Number(segFilters.maxScore) : undefined,
      status: segFilters.status !== "all" ? segFilters.status : undefined,
    };
    if (editSegId) {
      await supabase.from("segments").update({ name: segName, description: segDesc || null, filters } as any).eq("id", editSegId);
    } else {
      await supabase.from("segments").insert({ org_id: orgId, name: segName, description: segDesc || null, filters, created_by: user?.id } as any);
    }
    setSegFormOpen(false);
    setEditSegId(null);
    fetchAll();
    toast({ title: editSegId ? "Segmento atualizado" : "Segmento criado" });
  };

  const deleteSegment = async (id: string) => {
    await supabase.from("segments").delete().eq("id", id);
    fetchAll();
    toast({ title: "Segmento excluído" });
  };

  const getSegmentContacts = (seg: Segment) => {
    const f = seg.filters as any;
    return contacts.filter((c) => {
      if (f.minScore !== undefined && (c.lead_score || 0) < f.minScore) return false;
      if (f.maxScore !== undefined && (c.lead_score || 0) > f.maxScore) return false;
      if (f.status && c.status !== f.status) return false;
      return true;
    });
  };

  const exportSegmentCSV = (seg: Segment) => {
    const rows = getSegmentContacts(seg);
    const csv = ["Nome,Email,Status,Score",
      ...rows.map((c) => `"${c.first_name} ${c.last_name || ""}","${c.email || ""}","${c.status || ""}",${c.lead_score || 0}`)
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `segmento-${seg.name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado" });
  };

  const filteredContacts = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(q));
  }, [contacts, search]);

  const filteredHistory = useMemo(() => {
    if (historyContactId === "all") return history;
    return history.filter((h) => h.contact_id === historyContactId);
  }, [history, historyContactId]);

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lead Scoring & Segmentação</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} contatos · {segments.length} segmentos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setAdjustContactId(""); setAdjustPoints(0); setAdjustReason(""); setAdjustOpen(true); }}>
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" />Ajustar Score
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "scoring" as Tab, label: "Regras & Contatos", icon: Target },
          { key: "segments" as Tab, label: "Segmentos", icon: Users },
          { key: "history" as Tab, label: "Histórico", icon: TrendingUp },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* SCORING TAB */}
      {tab === "scoring" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Rules config */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Regras de Pontuação</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openNewRule}>
                <Plus className="mr-1 h-3 w-3" />Nova Regra
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className={`flex items-center justify-between rounded-md border border-border p-2 ${!r.is_active ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch checked={r.is_active} onCheckedChange={(v) => toggleRule(r.id, v)} className="scale-75" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{r.label}</p>
                      <p className="text-[9px] text-muted-foreground">{r.event_type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={r.points}
                      onChange={(e) => updateRulePoints(r.id, Number(e.target.value))}
                      className="w-16 h-6 text-[10px] text-center"
                    />
                    <span className="text-[9px] text-muted-foreground">pts</span>
                    <button onClick={() => openEditRule(r)} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteRule(r.id)} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {rules.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma regra criada</p>
              )}
            </CardContent>
          </Card>

          {/* Contacts with scores */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar contatos..." aria-label="Buscar contatos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
            </div>
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contato</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContacts.slice(0, 50).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-sm">{c.first_name} {c.last_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.email}</TableCell>
                      <TableCell>
                        {c.status && <Badge variant="secondary" className="text-[9px]">{c.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        <LeadScoreBadge score={c.lead_score || 0} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredContacts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum contato</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* SEGMENTS TAB */}
      {tab === "segments" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setSegName(""); setSegDesc(""); setSegFilters({ minScore: "", maxScore: "", status: "all" }); setEditSegId(null); setSegFormOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />Novo Segmento
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {segments.map((seg) => {
              const segContacts = getSegmentContacts(seg);
              const f = seg.filters as any;
              return (
                <Card key={seg.id} className="group hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{seg.name}</p>
                        {seg.description && <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all">
                            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setEditSegId(seg.id); setSegName(seg.name); setSegDesc(seg.description || "");
                            setSegFilters({ minScore: f.minScore?.toString() || "", maxScore: f.maxScore?.toString() || "", status: f.status || "all" });
                            setSegFormOpen(true);
                          }}><Edit2 className="mr-2 h-3.5 w-3.5" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportSegmentCSV(seg)}><Download className="mr-2 h-3.5 w-3.5" />Exportar CSV</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteSegment(seg.id)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[9px]">{segContacts.length} contatos</Badge>
                      {f.minScore !== undefined && <Badge variant="outline" className="text-[8px]">Score ≥ {f.minScore}</Badge>}
                      {f.maxScore !== undefined && <Badge variant="outline" className="text-[8px]">Score ≤ {f.maxScore}</Badge>}
                      {f.status && <Badge variant="outline" className="text-[8px]">{f.status}</Badge>}
                    </div>
                    {/* Mini list */}
                    <div className="mt-2 space-y-0.5 max-h-24 overflow-hidden">
                      {segContacts.slice(0, 4).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-[10px]">
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                          <LeadScoreBadge score={c.lead_score || 0} />
                        </div>
                      ))}
                      {segContacts.length > 4 && <p className="text-[9px] text-muted-foreground">+{segContacts.length - 4} mais</p>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {segments.length === 0 && (
              <div className="col-span-full py-16 text-center text-sm text-muted-foreground">Nenhum segmento criado</div>
            )}
          </div>

          {/* Segment form */}
          <Dialog open={segFormOpen} onOpenChange={setSegFormOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editSegId ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
                <DialogDescription>Defina filtros para criar uma lista dinâmica</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={segName} onChange={(e) => setSegName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={segDesc} onChange={(e) => setSegDesc(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Score mínimo</Label>
                    <Input type="number" value={segFilters.minScore} onChange={(e) => setSegFilters({ ...segFilters, minScore: e.target.value })} className="h-8 text-sm" placeholder="0" aria-label="0" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Score máximo</Label>
                    <Input type="number" value={segFilters.maxScore} onChange={(e) => setSegFilters({ ...segFilters, maxScore: e.target.value })} className="h-8 text-sm" placeholder="100" aria-label="100" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={segFilters.status} onValueChange={(v) => setSegFilters({ ...segFilters, status: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="customer">Cliente</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={saveSegment} disabled={!segName.trim()} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="space-y-3">
          <div className="flex gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Contato</Label>
              <Select value={historyContactId} onValueChange={setHistoryContactId}>
                <SelectTrigger className="w-52 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.slice(0, 100).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-center">Pontos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((h) => {
                  const c = contacts.find((c) => c.id === h.contact_id);
                  const isPositive = h.points > 0;
                  return (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {h.created_at ? new Date(h.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{c ? `${c.first_name} ${c.last_name || ""}` : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[8px]">{h.event_type || "manual"}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.reason}</TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
                          {isPositive ? "+" : ""}{h.points}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredHistory.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum histórico</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Manual adjust dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar Score</DialogTitle>
            <DialogDescription>Adicione ou remova pontos manualmente</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Contato</Label>
              <Select value={adjustContactId} onValueChange={setAdjustContactId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.lead_score || 0} pts)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pontos (positivo ou negativo)</Label>
              <Input type="number" value={adjustPoints} onChange={(e) => setAdjustPoints(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo *</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button onClick={submitAdjust} disabled={!adjustContactId || !adjustReason.trim()} className="w-full">Ajustar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New/Edit Rule dialog */}
      <Dialog open={ruleFormOpen} onOpenChange={setRuleFormOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editRuleId ? "Editar Regra" : "Nova Regra de Pontuação"}</DialogTitle>
            <DialogDescription>Defina o evento e a pontuação atribuída</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome da regra *</Label>
              <Input value={ruleLabel} onChange={(e) => setRuleLabel(e.target.value)} placeholder="Ex: Download de material" aria-label="Ex: Download de material" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo de evento</Label>
              <Select value={ruleEventType} onValueChange={(v) => { setRuleEventType(v); if (v !== "custom") { const found = EVENT_TYPES.find(e => e.value === v); if (found && !ruleLabel) setRuleLabel(found.label); } }}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {ruleEventType === "custom" && (
              <div className="space-y-1">
                <Label className="text-xs">Identificador do evento</Label>
                <Input value={ruleCustomEvent} onChange={(e) => setRuleCustomEvent(e.target.value)} placeholder="ex: webinar_attended" aria-label="ex: webinar_attended" className="h-8 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Pontos (use negativo para penalizar)</Label>
              <Input type="number" value={rulePoints} onChange={(e) => setRulePoints(Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <Button onClick={saveRule} disabled={!ruleLabel.trim()} className="w-full">
              {editRuleId ? "Salvar" : "Criar Regra"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
