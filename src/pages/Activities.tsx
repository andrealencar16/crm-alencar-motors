import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus, Phone, Mail, Calendar, FileText, CheckSquare, List,
  CalendarDays, Clock, AlertTriangle, Trash2, Edit2, MoreHorizontal,
  ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ActivityType = Database["public"]["Enums"]["activity_type"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const typeIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone, email: Mail, meeting: Calendar, note: FileText, task: CheckSquare,
};
const typeLabels: Record<ActivityType, string> = {
  call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa",
};
const typeColors: Record<ActivityType, string> = {
  call: "text-emerald-600",
  email: "text-blue-600",
  meeting: "text-amber-600",
  note: "text-muted-foreground",
  task: "text-violet-600",
};

type ViewMode = "list" | "calendar";
type DateFilter = "todo" | "overdue" | "today" | "tomorrow" | "this_week" | "next_week" | "next_30_days";

const dateFilterLabels: Record<DateFilter, string> = {
  todo: "Para fazer",
  overdue: "Vencido",
  today: "Hoje",
  tomorrow: "Amanhã",
  this_week: "Esta semana",
  next_week: "Próxima semana",
  next_30_days: "Próximos 30 dias",
};

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

function getWeekRange(offset: number) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: startOfDay(monday), end: endOfDay(sunday) };
}

export default function Activities() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("todo");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setCreateOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Calendar state
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [aRes, cRes, coRes, dRes, mRes] = await Promise.all([
      supabase.from("activities").select("*").eq("org_id", orgId).order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("contacts").select("*").eq("org_id", orgId),
      supabase.from("companies").select("*").eq("org_id", orgId),
      supabase.from("deals").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
    ]);
    setActivities(aRes.data || []);
    setContacts(cRes.data || []);
    setCompanies(coRes.data || []);
    setDeals(dRes.data || []);
    setMembers(mRes.data || []);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleComplete = async (activity: Activity) => {
    const completed_at = activity.completed_at ? null : new Date().toISOString();
    await supabase.from("activities").update({ completed_at }).eq("id", activity.id);
    fetchData();
  };

  const deleteActivity = async (id: string) => {
    await supabase.from("activities").delete().eq("id", id);
    fetchData();
    toast({ title: "Atividade excluída" });
  };

  const getContact = (id: string | null) => id ? contacts.find((c) => c.id === id) : null;
  const getCompany = (id: string | null) => id ? companies.find((c) => c.id === id) : null;
  const getDeal = (id: string | null) => id ? deals.find((d) => d.id === id) : null;
  const getMember = (id: string | null) => id ? members.find((m) => m.id === id) : null;

  const isOverdue = (a: Activity) => !a.completed_at && a.due_date && new Date(a.due_date) < new Date();

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const tomorrowEnd = endOfDay(tomorrowStart);
    const thisWeek = getWeekRange(0);
    const nextWeek = getWeekRange(1);
    const next30End = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));

    return activities.filter((a) => {
      // Type filter
      if (typeFilter !== "all" && a.type !== typeFilter) return false;

      // Owner filter
      if (ownerFilter !== "all" && a.user_id !== ownerFilter) return false;

      // Search
      if (search) {
        const q = search.toLowerCase();
        const contact = getContact(a.contact_id);
        const deal = getDeal(a.deal_id);
        const haystack = `${a.title} ${contact?.first_name || ""} ${contact?.last_name || ""} ${contact?.email || ""} ${deal?.title || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Date filter
      const dueDate = a.due_date ? new Date(a.due_date) : null;
      switch (dateFilter) {
        case "todo":
          return !a.completed_at;
        case "overdue":
          return !a.completed_at && dueDate !== null && dueDate < now;
        case "today":
          return !a.completed_at && dueDate !== null && dueDate >= todayStart && dueDate <= todayEnd;
        case "tomorrow":
          return !a.completed_at && dueDate !== null && dueDate >= tomorrowStart && dueDate <= tomorrowEnd;
        case "this_week":
          return !a.completed_at && dueDate !== null && dueDate >= thisWeek.start && dueDate <= thisWeek.end;
        case "next_week":
          return !a.completed_at && dueDate !== null && dueDate >= nextWeek.start && dueDate <= nextWeek.end;
        case "next_30_days":
          return !a.completed_at && dueDate !== null && dueDate >= todayStart && dueDate <= next30End;
      }
      return true;
    });
  }, [activities, typeFilter, dateFilter, ownerFilter, search, contacts, deals]);

  // Count per date filter (for badges)
  const counts = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    const tomorrowEnd = endOfDay(tomorrowStart);
    const thisWeek = getWeekRange(0);
    const nextWeek = getWeekRange(1);
    const next30End = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));

    const pending = activities.filter((a) => !a.completed_at);
    return {
      todo: pending.length,
      overdue: pending.filter((a) => a.due_date && new Date(a.due_date) < now).length,
      today: pending.filter((a) => a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= todayEnd).length,
      tomorrow: pending.filter((a) => a.due_date && new Date(a.due_date) >= tomorrowStart && new Date(a.due_date) <= tomorrowEnd).length,
      this_week: pending.filter((a) => a.due_date && new Date(a.due_date) >= thisWeek.start && new Date(a.due_date) <= thisWeek.end).length,
      next_week: pending.filter((a) => a.due_date && new Date(a.due_date) >= nextWeek.start && new Date(a.due_date) <= nextWeek.end).length,
      next_30_days: pending.filter((a) => a.due_date && new Date(a.due_date) >= todayStart && new Date(a.due_date) <= next30End).length,
    };
  }, [activities]);

  // Calendar helpers
  const calendarDays = useMemo(() => {
    const { year, month } = calMonth;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= last.getDate(); d++) {
      days.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      days.push({ date: new Date(year, month + 1, days.length - last.getDate() - startDay + 1), inMonth: false });
    }
    return days;
  }, [calMonth]);

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    filtered.forEach((a) => {
      const dateStr = a.due_date
        ? new Date(a.due_date).toISOString().split("T")[0]
        : a.created_at
          ? new Date(a.created_at).toISOString().split("T")[0]
          : null;
      if (dateStr) {
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr)!.push(a);
      }
    });
    return map;
  }, [filtered]);

  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Atividades</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} atividades
            {counts.overdue > 0 && <span className="text-destructive font-medium ml-1">· {counts.overdue} atrasadas</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button onClick={() => setViewMode("list")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode("calendar")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />Atividade
          </Button>
        </div>
      </div>

      {/* Type filter tabs */}
      <div className="flex items-center gap-1 pb-2 border-b border-border flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
        >
          Tudo
        </button>
        {(["call", "meeting", "task", "email", "note"] as ActivityType[]).map((t) => {
          const Icon = typeIcons[t];
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              <Icon className="h-3 w-3" />
              {typeLabels[t]}
            </button>
          );
        })}

        {/* Right side: search + owner filter */}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              aria-label="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 w-44 text-xs"
            />
          </div>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Date filter tabs */}
      <div className="flex items-center gap-0.5 py-2 text-xs">
        {(Object.keys(dateFilterLabels) as DateFilter[]).map((key) => {
          const count = counts[key];
          const isActive = dateFilter === key;
          const isOverdueTab = key === "overdue";
          return (
            <button
              key={key}
              onClick={() => setDateFilter(key)}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${
                isActive
                  ? isOverdueTab && count > 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {dateFilterLabels[key]}
              {count > 0 && (
                <span className={`ml-1 text-[10px] ${isOverdueTab ? "text-destructive" : ""}`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table view */}
      {viewMode === "list" && (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[200px]">Assunto</TableHead>
                <TableHead>Negócio</TableHead>
                <TableHead>Pessoa de contato</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Organização</TableHead>
                <TableHead>Data de venc.</TableHead>
                <TableHead>Atribuído a</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => {
                const Icon = typeIcons[a.type];
                const contact = getContact(a.contact_id);
                const deal = getDeal(a.deal_id);
                const company = getCompany(a.company_id) || (contact?.company_id ? getCompany(contact.company_id) : null);
                const member = getMember(a.user_id);
                const overdue = isOverdue(a);

                return (
                  <TableRow
                    key={a.id}
                    className={`group ${a.completed_at ? "opacity-40" : ""} ${overdue ? "bg-destructive/[0.03]" : ""}`}
                  >
                    <TableCell className="pr-0">
                      <Checkbox
                        checked={!!a.completed_at}
                        onCheckedChange={() => toggleComplete(a)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${typeColors[a.type]}`} />
                        <span className={`text-sm font-medium truncate ${a.completed_at ? "line-through" : ""}`}>
                          {a.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {deal && (
                        <Badge variant="secondary" className="text-[10px] font-normal max-w-[160px] truncate">
                          {deal.title}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact && (
                        <span className="text-sm">
                          {contact.first_name} {contact.last_name || ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact?.email && (
                        <a href={`mailto:${contact.email}`} className="text-xs text-primary hover:underline truncate block max-w-[180px]">
                          {contact.email}
                        </a>
                      )}
                    </TableCell>
                    <TableCell>
                      {contact?.phone && (
                        <span className="text-xs text-muted-foreground">{contact.phone}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {company && (
                        <span className="text-xs text-muted-foreground">{company.name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.due_date && (
                        <span className={`text-xs whitespace-nowrap ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {new Date(a.due_date).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {member && (
                        <span className="text-xs text-muted-foreground">{member.name || member.email}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent transition-all">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditActivity(a)}>
                            <Edit2 className="mr-2 h-3.5 w-3.5" />Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteActivity(a.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-16 text-muted-foreground">
                    <div className="space-y-2">
                      <CheckSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <p className="text-sm">Nenhuma atividade encontrada</p>
                      <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Criar atividade
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setCalMonth((p) => {
              const d = new Date(p.year, p.month - 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })}><ChevronLeft className="h-4 w-4" /></Button>
            <h3 className="text-sm font-semibold">{monthNames[calMonth.month]} {calMonth.year}</h3>
            <Button variant="outline" size="sm" onClick={() => setCalMonth((p) => {
              const d = new Date(p.year, p.month + 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-px rounded-lg border border-border bg-border overflow-hidden">
            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => (
              <div key={d} className="bg-muted px-2 py-1.5 text-center text-[10px] font-medium text-muted-foreground">{d}</div>
            ))}
            {calendarDays.map((day, i) => {
              const dateStr = day.date.toISOString().split("T")[0];
              const dayActivities = activitiesByDate.get(dateStr) || [];
              const isToday = dateStr === new Date().toISOString().split("T")[0];
              return (
                <div key={i} className={`min-h-[80px] bg-background p-1 ${!day.inMonth ? "opacity-40" : ""}`}>
                  <div className={`text-xs font-medium mb-0.5 ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                    {day.date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayActivities.slice(0, 3).map((a) => {
                      const ActIcon = typeIcons[a.type];
                      return (
                        <div key={a.id} className={`flex items-center gap-1 rounded px-1 py-0.5 text-[9px] truncate bg-muted/50 ${isOverdue(a) ? "ring-1 ring-destructive" : ""}`}>
                          <ActIcon className={`h-2.5 w-2.5 shrink-0 ${typeColors[a.type]}`} />
                          <span className="truncate">{a.title}</span>
                        </div>
                      );
                    })}
                    {dayActivities.length > 3 && (
                      <span className="text-[9px] text-muted-foreground px-1">+{dayActivities.length - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <ActivityCreateEditModal
        open={createOpen || !!editActivity}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditActivity(null); } }}
        activity={editActivity}
        contacts={contacts}
        companies={companies}
        deals={deals}
        members={members}
        onSaved={fetchData}
      />
    </div>
  );
}

// ─── Create / Edit Modal ────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activity: Activity | null;
  contacts: Contact[];
  companies: Company[];
  deals: Deal[];
  members: Profile[];
  onSaved: () => void;
}

function ActivityCreateEditModal({ open, onOpenChange, activity, contacts, companies, deals, members, onSaved }: ModalProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const isEdit = !!activity;

  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dealId, setDealId] = useState<string>("none");
  const [contactId, setContactId] = useState<string>("none");
  const [assignee, setAssignee] = useState<string>("none");

  const selectedDeal = deals.find((d) => d.id === dealId);
  const resolvedContactId = dealId !== "none" && selectedDeal?.contact_id
    ? selectedDeal.contact_id
    : contactId !== "none" ? contactId : null;
  const selectedContact = contacts.find((c) => c.id === resolvedContactId);
  const resolvedCompanyId = selectedDeal?.company_id || selectedContact?.company_id || null;
  const resolvedCompany = companies.find((c) => c.id === resolvedCompanyId);

  useEffect(() => {
    if (activity) {
      setType(activity.type);
      setTitle(activity.title);
      setBody(activity.body || "");
      setDueDate(activity.due_date ? activity.due_date.slice(0, 16) : "");
      setDealId(activity.deal_id || "none");
      setContactId(activity.contact_id || "none");
      setAssignee(activity.user_id || "none");
    } else {
      setType("task");
      setTitle("");
      setBody("");
      setDueDate("");
      setDealId("none");
      setContactId("none");
      setAssignee("none");
    }
  }, [activity, open]);

  const handleDealChange = (val: string) => {
    setDealId(val);
    if (val !== "none") {
      const deal = deals.find((d) => d.id === val);
      if (deal?.contact_id) setContactId(deal.contact_id);
    }
  };

  const handleSave = async () => {
    if (!orgId || !title.trim()) return;
    const payload = {
      org_id: orgId,
      type,
      title: title.trim(),
      body: body || null,
      due_date: dueDate || null,
      deal_id: dealId !== "none" ? dealId : null,
      contact_id: resolvedContactId,
      company_id: resolvedCompanyId,
      user_id: assignee !== "none" ? assignee : user?.id,
    };

    const { error } = isEdit
      ? await supabase.from("activities").update(payload).eq("id", activity!.id)
      : await supabase.from("activities").insert(payload);

    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    onOpenChange(false);
    onSaved();
    toast({ title: isEdit ? "Atividade atualizada" : "Atividade criada" });
  };

  const typeHints: Record<ActivityType, string> = {
    note: "Registre observações sobre contatos, negócios ou empresas",
    task: "Crie uma tarefa com prazo e responsável",
    meeting: "Agende uma reunião com data, horário e participantes",
    call: "Registre uma ligação com contato e resultado",
    email: "Crie um rascunho de email para acompanhamento",
  };

  const availableContacts = dealId !== "none" && selectedDeal?.company_id
    ? contacts.filter((c) => c.company_id === selectedDeal.company_id || !c.company_id)
    : contacts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
          <DialogDescription>{typeHints[type]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {(["task", "note", "call", "meeting", "email"] as ActivityType[]).map((t) => {
              const Icon = typeIcons[t];
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors ${type === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {typeLabels[t]}
                </button>
              );
            })}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              {type === "note" ? "Assunto" : type === "call" ? "Resumo da ligação" : "Título"} *
            </Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={
              type === "note" ? "Assunto da nota..." : type === "call" ? "Resumo da ligação..." : type === "meeting" ? "Nome da reunião..." : type === "email" ? "Assunto do email..." : "Título da tarefa..."
            } aria-label={
              type === "note" ? "Assunto da nota..." : type === "call" ? "Resumo da ligação..." : type === "meeting" ? "Nome da reunião..." : type === "email" ? "Assunto do email..." : "Título da tarefa..."
            } />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              {type === "note" ? "Conteúdo" : type === "call" ? "Notas da ligação" : type === "meeting" ? "Pauta / Notas" : type === "email" ? "Corpo do email" : "Descrição"}
            </Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={type === "note" || type === "email" ? 6 : 3} />
          </div>

          {(type === "task" || type === "meeting" || type === "call") && (
            <div className="space-y-1">
              <Label className="text-xs">
                {type === "meeting" ? "Data/hora" : type === "call" ? "Data/hora da ligação" : "Prazo"}
              </Label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Negócio</Label>
            <Select value={dealId} onValueChange={handleDealChange}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {deals.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Contato</Label>
            <Select
              value={resolvedContactId || "none"}
              onValueChange={(v) => setContactId(v)}
              disabled={dealId !== "none" && !!selectedDeal?.contact_id}
            >
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {availableContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {dealId !== "none" && selectedDeal?.contact_id && (
              <p className="text-[10px] text-muted-foreground">Preenchido automaticamente pelo negócio</p>
            )}
          </div>

          {resolvedCompany && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Empresa (vinculada automaticamente)</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                🏢 {resolvedCompany.name}
              </div>
            </div>
          )}

          {(type === "task" || type === "meeting") && (
            <div className="space-y-1">
              <Label className="text-xs">Responsável</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Eu</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSave} className="w-full" disabled={!title.trim()}>
            {isEdit ? "Salvar Alterações" : "Criar Atividade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
