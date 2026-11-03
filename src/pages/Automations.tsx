import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Zap, Play, Pause, Trash2, MoreHorizontal, ArrowRight, Clock,
  CheckCircle2, XCircle, AlertTriangle, Copy, ChevronDown, ChevronUp,
  Workflow, History, LayoutTemplate, Settings2, GripVertical, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────
type TriggerType =
  | "deal.stage_changed" | "deal.won" | "deal.lost"
  | "contact.created" | "contact.updated"
  | "score.threshold" | "activity.created"
  | "field.changed" | "date.relative" | "webhook.received";

type ActionType =
  | "create_task" | "send_email_template" | "assign_owner"
  | "move_deal_stage" | "add_tag" | "remove_tag"
  | "create_note" | "notify_user" | "call_webhook" | "wait"
  | "send_whatsapp";

interface TriggerConfig {
  type: TriggerType;
  config: Record<string, any>;
}
interface Condition {
  field: string;
  operator: string;
  value: string;
  logic?: "AND" | "OR";
}
interface ActionConfig {
  type: ActionType;
  config: Record<string, any>;
}
interface Automation {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger: TriggerConfig;
  conditions: Condition[];
  actions: ActionConfig[];
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_run_at: string | null;
  run_count: number;
  error_count: number;
}
interface AutomationLog {
  id: string;
  automation_id: string;
  status: string;
  trigger_payload: any;
  actions_result: any;
  error_message: string | null;
  executed_at: string | null;
  duration_ms: number | null;
}

// ── Constants ──────────────────────────────────────────
const TRIGGER_LABELS: Record<TriggerType, { label: string; icon: string }> = {
  "deal.stage_changed": { label: "Negócio muda de estágio", icon: "🔄" },
  "deal.won": { label: "Negócio ganho", icon: "🏆" },
  "deal.lost": { label: "Negócio perdido", icon: "❌" },
  "contact.created": { label: "Contato criado", icon: "👤" },
  "contact.updated": { label: "Contato atualizado", icon: "✏️" },
  "score.threshold": { label: "Lead score atinge threshold", icon: "📊" },
  "activity.created": { label: "Atividade criada", icon: "📋" },
  "field.changed": { label: "Campo alterado", icon: "🔧" },
  "date.relative": { label: "Data relativa", icon: "📅" },
  "webhook.received": { label: "Webhook recebido", icon: "🔗" },
};

const ACTION_LABELS: Record<ActionType, { label: string; icon: string }> = {
  create_task: { label: "Criar tarefa", icon: "✅" },
  send_email_template: { label: "Enviar email de template", icon: "📧" },
  assign_owner: { label: "Atribuir dono", icon: "👤" },
  move_deal_stage: { label: "Mover negócio de estágio", icon: "➡️" },
  add_tag: { label: "Adicionar tag", icon: "🏷️" },
  remove_tag: { label: "Remover tag", icon: "🏷️" },
  create_note: { label: "Criar nota", icon: "📝" },
  notify_user: { label: "Notificar usuário", icon: "🔔" },
  call_webhook: { label: "Chamar webhook externo", icon: "🌐" },
  wait: { label: "Aguardar (delay)", icon: "⏳" },
  send_whatsapp: { label: "Enviar WhatsApp", icon: "💬" },
};

const CONDITION_OPERATORS = [
  { value: "equals", label: "igual a" },
  { value: "not_equals", label: "diferente de" },
  { value: "greater_than", label: "maior que" },
  { value: "less_than", label: "menor que" },
  { value: "contains", label: "contém" },
  { value: "not_contains", label: "não contém" },
];

const TEMPLATES: {
  name: string;
  description: string;
  trigger: TriggerConfig;
  conditions: Condition[];
  actions: ActionConfig[];
}[] = [
  {
    name: "Boas-vindas ao novo contato",
    description: "Ao criar contato → tarefa de follow-up em D+1",
    trigger: { type: "contact.created", config: {} },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Follow-up com novo contato", due_days: 1, priority: "high" } },
    ],
  },
  {
    name: "Deal sem atividade (14 dias)",
    description: "Sem atividade em 14 dias → notificar dono + criar tarefa urgente",
    trigger: { type: "date.relative", config: { entity: "deal", days_inactive: 14 } },
    conditions: [],
    actions: [
      { type: "notify_user", config: { message: "Deal sem atividade há 14 dias" } },
      { type: "create_task", config: { title: "Reativar deal inativo", due_days: 0, priority: "urgent" } },
    ],
  },
  {
    name: "Negócio ganho → Onboarding",
    description: "Ao ganhar → criar tarefa de onboarding + notificar CS",
    trigger: { type: "deal.won", config: {} },
    conditions: [],
    actions: [
      { type: "create_task", config: { title: "Iniciar onboarding", due_days: 1, priority: "high" } },
      { type: "notify_user", config: { message: "Novo deal ganho! Iniciar onboarding." } },
    ],
  },
  {
    name: "Lead quente (score ≥ 70)",
    description: "Score ≥ 70 → atribuir ao melhor vendedor + criar tarefa urgente",
    trigger: { type: "score.threshold", config: { threshold: 70, direction: "above" } },
    conditions: [],
    actions: [
      { type: "assign_owner", config: { strategy: "round_robin" } },
      { type: "create_task", config: { title: "Lead quente - Ação imediata", due_days: 0, priority: "urgent" } },
    ],
  },
  {
    name: "Cliente inativo 60 dias → WhatsApp",
    description: "Sem atividade em 60 dias → enviar WhatsApp de reativação",
    trigger: { type: "date.relative", config: { entity: "contact", days_inactive: 60 } },
    conditions: [],
    actions: [
      { type: "send_whatsapp", config: { phone_source: "contact", message: "Olá {{nome}}! Sentimos sua falta. Podemos agendar uma conversa para entender como podemos ajudá-lo? 😊" } },
      { type: "create_task", config: { title: "Follow-up pós WhatsApp de reativação", due_days: 3, priority: "high" } },
    ],
  },
];

// ── Component ──────────────────────────────────────────
export default function Automations() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [tab, setTab] = useState<"list" | "templates" | "history">("list");

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTrigger, setFormTrigger] = useState<TriggerConfig>({ type: "deal.stage_changed", config: {} });
  const [formConditions, setFormConditions] = useState<Condition[]>([]);
  const [formActions, setFormActions] = useState<ActionConfig[]>([]);

  // Log detail
  const [logDetailOpen, setLogDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AutomationLog | null>(null);

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    const [aRes, lRes] = await Promise.all([
      supabase.from("automations").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("automation_logs").select("*").eq("org_id", orgId).order("executed_at", { ascending: false }).limit(100),
    ]);
    setAutomations((aRes.data as any as Automation[]) || []);
    setLogs((lRes.data as any as AutomationLog[]) || []);
  }, [orgId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── CRUD ────────
  const openBuilder = (auto?: Automation) => {
    if (auto) {
      setEditId(auto.id);
      setFormName(auto.name);
      setFormDesc(auto.description || "");
      setFormTrigger(auto.trigger);
      setFormConditions(auto.conditions || []);
      setFormActions(auto.actions || []);
    } else {
      setEditId(null);
      setFormName("");
      setFormDesc("");
      setFormTrigger({ type: "deal.stage_changed", config: {} });
      setFormConditions([]);
      setFormActions([]);
    }
    setBuilderOpen(true);
  };

  const saveAutomation = async () => {
    if (!orgId || !formName.trim()) return;
    const payload = {
      org_id: orgId,
      name: formName,
      description: formDesc || null,
      trigger: formTrigger as any,
      conditions: formConditions as any,
      actions: formActions as any,
      created_by: user?.id,
    };
    if (editId) {
      await supabase.from("automations").update(payload as any).eq("id", editId);
    } else {
      await supabase.from("automations").insert(payload as any);
    }
    setBuilderOpen(false);
    fetchAll();
    toast({ title: editId ? "Automação atualizada" : "Automação criada" });
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("automations").update({ is_active: active } as any).eq("id", id);
    fetchAll();
    toast({ title: active ? "Automação ativada" : "Automação desativada" });
  };

  const deleteAutomation = async (id: string) => {
    await supabase.from("automations").delete().eq("id", id);
    fetchAll();
    toast({ title: "Automação excluída" });
  };

  const duplicateAutomation = async (auto: Automation) => {
    await supabase.from("automations").insert({
      org_id: auto.org_id,
      name: `${auto.name} (cópia)`,
      description: auto.description,
      trigger: auto.trigger as any,
      conditions: auto.conditions as any,
      actions: auto.actions as any,
      created_by: user?.id,
      is_active: false,
    } as any);
    fetchAll();
    toast({ title: "Automação duplicada" });
  };

  const useTemplate = (tmpl: typeof TEMPLATES[0]) => {
    setEditId(null);
    setFormName(tmpl.name);
    setFormDesc(tmpl.description);
    setFormTrigger(tmpl.trigger);
    setFormConditions(tmpl.conditions);
    setFormActions(tmpl.actions);
    setBuilderOpen(true);
  };

  // ── Conditions helpers ────────
  const addCondition = () => {
    setFormConditions([...formConditions, { field: "", operator: "equals", value: "", logic: "AND" }]);
  };
  const removeCondition = (i: number) => {
    setFormConditions(formConditions.filter((_, idx) => idx !== i));
  };
  const updateCondition = (i: number, patch: Partial<Condition>) => {
    setFormConditions(formConditions.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  };

  // ── Actions helpers ────────
  const addAction = (type: ActionType) => {
    setFormActions([...formActions, { type, config: {} }]);
  };
  const removeAction = (i: number) => {
    setFormActions(formActions.filter((_, idx) => idx !== i));
  };
  const updateActionConfig = (i: number, key: string, val: any) => {
    setFormActions(formActions.map((a, idx) => idx === i ? { ...a, config: { ...a.config, [key]: val } } : a));
  };
  const moveAction = (from: number, dir: "up" | "down") => {
    const to = dir === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= formActions.length) return;
    const arr = [...formActions];
    [arr[from], arr[to]] = [arr[to], arr[from]];
    setFormActions(arr);
  };

  // Trigger config fields
  const renderTriggerConfig = () => {
    const t = formTrigger.type;
    const cfg = formTrigger.config;
    const upd = (k: string, v: any) => setFormTrigger({ ...formTrigger, config: { ...cfg, [k]: v } });

    if (t === "deal.stage_changed") return (
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">Stage de destino (ID ou nome)</Label>
          <Input className="h-7 text-xs" value={cfg.to_stage || ""} onChange={(e) => upd("to_stage", e.target.value)} placeholder="Ex: Proposta" aria-label="Ex: Proposta" />
        </div>
      </div>
    );
    if (t === "score.threshold") return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Threshold</Label>
          <Input type="number" className="h-7 text-xs" value={cfg.threshold || ""} onChange={(e) => upd("threshold", Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Direção</Label>
          <Select value={cfg.direction || "above"} onValueChange={(v) => upd("direction", v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="above">Acima de</SelectItem>
              <SelectItem value="below">Abaixo de</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
    if (t === "activity.created") return (
      <div className="space-y-1">
        <Label className="text-xs">Tipo de atividade</Label>
        <Select value={cfg.activity_type || ""} onValueChange={(v) => upd("activity_type", v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Qualquer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="call">Ligação</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="meeting">Reunião</SelectItem>
            <SelectItem value="note">Nota</SelectItem>
            <SelectItem value="task">Tarefa</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
    if (t === "field.changed") return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Campo</Label>
          <Input className="h-7 text-xs" value={cfg.field || ""} onChange={(e) => upd("field", e.target.value)} placeholder="deal.value" aria-label="deal.value" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor</Label>
          <Input className="h-7 text-xs" value={cfg.value || ""} onChange={(e) => upd("value", e.target.value)} placeholder="> 50000" aria-label="> 50000" />
        </div>
      </div>
    );
    if (t === "date.relative") return (
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Entidade</Label>
          <Select value={cfg.entity || "deal"} onValueChange={(v) => upd("entity", v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="deal">Negócio</SelectItem>
              <SelectItem value="contact">Contato</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dias inativos</Label>
          <Input type="number" className="h-7 text-xs" value={cfg.days_inactive || ""} onChange={(e) => upd("days_inactive", Number(e.target.value))} />
        </div>
      </div>
    );
    if (t === "webhook.received") return (
      <div className="space-y-1">
        <Label className="text-xs">Secret (validação)</Label>
        <Input className="h-7 text-xs" value={cfg.secret || ""} onChange={(e) => upd("secret", e.target.value)} placeholder="hmac-secret" aria-label="hmac-secret" />
      </div>
    );
    return null;
  };

  // Action config fields
  const renderActionConfig = (action: ActionConfig, i: number) => {
    const cfg = action.config;
    const upd = (k: string, v: any) => updateActionConfig(i, k, v);

    switch (action.type) {
      case "create_task": return (
        <div className="space-y-2">
          <Input className="h-7 text-xs" placeholder="Título da tarefa" aria-label="Título da tarefa" value={cfg.title || ""} onChange={(e) => upd("title", e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" className="h-7 text-xs" placeholder="Prazo (dias)" aria-label="Prazo (dias)" value={cfg.due_days ?? ""} onChange={(e) => upd("due_days", Number(e.target.value))} />
            <Select value={cfg.priority || "medium"} onValueChange={(v) => upd("priority", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">🔴 Urgente</SelectItem>
                <SelectItem value="high">🟠 Alta</SelectItem>
                <SelectItem value="medium">🟡 Média</SelectItem>
                <SelectItem value="low">⚪ Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      case "send_email_template": return (
        <Input className="h-7 text-xs" placeholder="ID do template" aria-label="ID do template" value={cfg.template_id || ""} onChange={(e) => upd("template_id", e.target.value)} />
      );
      case "assign_owner": return (
        <div className="space-y-2">
          <Select value={cfg.strategy || "specific"} onValueChange={(v) => upd("strategy", v)}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="specific">Específico</SelectItem>
              <SelectItem value="round_robin">Round-robin</SelectItem>
            </SelectContent>
          </Select>
          {cfg.strategy === "specific" && (
            <Input className="h-7 text-xs" placeholder="ID do usuário" aria-label="ID do usuário" value={cfg.user_id || ""} onChange={(e) => upd("user_id", e.target.value)} />
          )}
        </div>
      );
      case "move_deal_stage": return (
        <Input className="h-7 text-xs" placeholder="Stage de destino" aria-label="Stage de destino" value={cfg.to_stage || ""} onChange={(e) => upd("to_stage", e.target.value)} />
      );
      case "add_tag": case "remove_tag": return (
        <Input className="h-7 text-xs" placeholder="Nome da tag" aria-label="Nome da tag" value={cfg.tag_name || ""} onChange={(e) => upd("tag_name", e.target.value)} />
      );
      case "create_note": return (
        <Textarea className="text-xs min-h-[60px]" placeholder="Conteúdo da nota" value={cfg.body || ""} onChange={(e) => upd("body", e.target.value)} />
      );
      case "notify_user": return (
        <Input className="h-7 text-xs" placeholder="Mensagem de notificação" aria-label="Mensagem de notificação" value={cfg.message || ""} onChange={(e) => upd("message", e.target.value)} />
      );
      case "call_webhook": return (
        <div className="space-y-2">
          <Input className="h-7 text-xs" placeholder="URL do webhook" aria-label="URL do webhook" value={cfg.url || ""} onChange={(e) => upd("url", e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={cfg.method || "POST"} onValueChange={(v) => upd("method", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      case "wait": return (
        <div className="flex items-center gap-2">
          <Input type="number" className="h-7 text-xs w-20" value={cfg.days || ""} onChange={(e) => upd("days", Number(e.target.value))} />
          <span className="text-xs text-muted-foreground">dias</span>
        </div>
      );
      case "send_whatsapp": return (
        <div className="space-y-2">
          <Textarea className="text-xs min-h-[60px]" placeholder="Mensagem do WhatsApp (use {{nome}}, {{empresa}} para variáveis)" value={cfg.message || ""} onChange={(e) => upd("message", e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input className="h-7 text-xs" placeholder="Número (ex: +5511999998888)" aria-label="Número (ex: +5511999998888)" value={cfg.phone_override || ""} onChange={(e) => upd("phone_override", e.target.value)} />
            <Select value={cfg.phone_source || "contact"} onValueChange={(v) => upd("phone_source", v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Telefone do contato</SelectItem>
                <SelectItem value="custom">Número personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      default: return null;
    }
  };

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automações</h1>
          <p className="text-sm text-muted-foreground">
            {automations.length} automações · {automations.filter((a) => a.is_active).length} ativas
          </p>
        </div>
        <Button onClick={() => openBuilder()}>
          <Plus className="mr-2 h-4 w-4" />Nova Automação
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([
          { key: "list" as const, label: "Automações", icon: Workflow },
          { key: "templates" as const, label: "Templates", icon: LayoutTemplate },
          { key: "history" as const, label: "Histórico", icon: History },
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

      {/* LIST TAB */}
      {tab === "list" && (
        <div className="space-y-3">
          {automations.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Zap className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhuma automação. Crie uma ou use um template.</p>
              <Button variant="outline" onClick={() => setTab("templates")}>
                <LayoutTemplate className="mr-2 h-4 w-4" />Ver Templates
              </Button>
            </div>
          )}
          {automations.map((auto) => {
            const triggerInfo = TRIGGER_LABELS[auto.trigger.type] || { label: auto.trigger.type, icon: "⚙️" };
            const autoLogs = logs.filter((l) => l.automation_id === auto.id);
            const lastLog = autoLogs[0];
            return (
              <Card key={auto.id} className={`group transition-colors ${auto.is_active ? "border-primary/20" : "opacity-60"}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${auto.is_active ? "bg-primary/10" : "bg-muted"}`}>
                        {triggerInfo.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">{auto.name}</p>
                          {auto.is_active ? (
                            <Badge className="text-[8px] bg-success/10 text-success border-success/30">Ativa</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[8px]">Rascunho</Badge>
                          )}
                        </div>
                        {auto.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{auto.description}</p>}

                        {/* Flow summary */}
                        <div className="flex flex-wrap items-center gap-1 mt-2">
                          <Badge variant="outline" className="text-[9px] gap-0.5">
                            <span>{triggerInfo.icon}</span> {triggerInfo.label}
                          </Badge>
                          {auto.conditions.length > 0 && (
                            <>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <Badge variant="outline" className="text-[9px]">{auto.conditions.length} condição(ões)</Badge>
                            </>
                          )}
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          {auto.actions.map((a, i) => (
                            <Badge key={i} variant="outline" className="text-[9px] gap-0.5">
                              <span>{ACTION_LABELS[a.type]?.icon}</span> {ACTION_LABELS[a.type]?.label}
                            </Badge>
                          ))}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Play className="h-2.5 w-2.5" /> {auto.run_count}x executada</span>
                          {auto.error_count > 0 && <span className="flex items-center gap-0.5 text-destructive"><AlertTriangle className="h-2.5 w-2.5" /> {auto.error_count} erros</span>}
                          {auto.last_run_at && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" /> {new Date(auto.last_run_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={auto.is_active} onCheckedChange={(v) => toggleActive(auto.id, v)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-accent transition-colors"><MoreHorizontal className="h-4 w-4 text-muted-foreground" /></button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openBuilder(auto)}><Settings2 className="mr-2 h-3.5 w-3.5" />Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateAutomation(auto)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deleteAutomation(auto.id)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === "templates" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((tmpl, i) => (
            <Card key={i} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => useTemplate(tmpl)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg">
                    {TRIGGER_LABELS[tmpl.trigger.type]?.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      <Badge variant="outline" className="text-[9px]">{TRIGGER_LABELS[tmpl.trigger.type]?.label}</Badge>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {tmpl.actions.map((a, j) => (
                        <Badge key={j} variant="outline" className="text-[9px]">{ACTION_LABELS[a.type]?.label}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Automação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Duração</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const auto = automations.find((a) => a.id === log.automation_id);
                return (
                  <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedLog(log); setLogDetailOpen(true); }}>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.executed_at ? new Date(log.executed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{auto?.name || "—"}</TableCell>
                    <TableCell>
                      {log.status === "success" ? (
                        <Badge className="text-[9px] bg-success/10 text-success border-success/30"><CheckCircle2 className="mr-0.5 h-2.5 w-2.5" />Sucesso</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[9px]"><XCircle className="mr-0.5 h-2.5 w-2.5" />Erro</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{log.duration_ms ? `${log.duration_ms}ms` : "—"}</TableCell>
                    <TableCell><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">Nenhuma execução registrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── BUILDER DIALOG ── */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Automação" : "Nova Automação"}</DialogTitle>
            <DialogDescription>Configure o trigger, condições e ações</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-5 pb-4">
              {/* Name & Description */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              {/* ── TRIGGER ── */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-bold">1</div>
                  <Label className="text-xs font-semibold uppercase tracking-wider">Trigger</Label>
                </div>
                <Card className="border-primary/20">
                  <CardContent className="p-3 space-y-2">
                    <Select value={formTrigger.type} onValueChange={(v) => setFormTrigger({ type: v as TriggerType, config: {} })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}><span className="mr-1">{v.icon}</span> {v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderTriggerConfig()}
                  </CardContent>
                </Card>
              </div>

              {/* ── CONDITIONS ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-warning text-warning-foreground text-[10px] font-bold">2</div>
                    <Label className="text-xs font-semibold uppercase tracking-wider">Condições (opcional)</Label>
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={addCondition}>
                    <Plus className="mr-1 h-3 w-3" />Condição
                  </Button>
                </div>
                {formConditions.map((cond, i) => (
                  <Card key={i} className="border-warning/20">
                    <CardContent className="p-2">
                      <div className="flex items-center gap-2">
                        {i > 0 && (
                          <Select value={cond.logic || "AND"} onValueChange={(v) => updateCondition(i, { logic: v as "AND" | "OR" })}>
                            <SelectTrigger className="h-6 w-16 text-[9px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">E</SelectItem>
                              <SelectItem value="OR">OU</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        <Input className="h-6 text-[10px] flex-1" placeholder="Campo (ex: deal.value)" aria-label="Campo (ex: deal.value)" value={cond.field} onChange={(e) => updateCondition(i, { field: e.target.value })} />
                        <Select value={cond.operator} onValueChange={(v) => updateCondition(i, { operator: v })}>
                          <SelectTrigger className="h-6 w-28 text-[9px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input className="h-6 text-[10px] w-24" placeholder="Valor" aria-label="Valor" value={cond.value} onChange={(e) => updateCondition(i, { value: e.target.value })} />
                        <button onClick={() => removeCondition(i)} className="p-0.5 rounded hover:bg-accent text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── ACTIONS ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-success text-success-foreground text-[10px] font-bold">3</div>
                    <Label className="text-xs font-semibold uppercase tracking-wider">Ações</Label>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 text-[10px]"><Plus className="mr-1 h-3 w-3" />Ação</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 overflow-auto">
                      {Object.entries(ACTION_LABELS).map(([k, v]) => (
                        <DropdownMenuItem key={k} onClick={() => addAction(k as ActionType)}>
                          <span className="mr-1.5">{v.icon}</span>{v.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {formActions.map((action, i) => {
                  const info = ACTION_LABELS[action.type] || { label: action.type, icon: "⚙️" };
                  return (
                    <Card key={i} className="border-success/20">
                      <CardContent className="p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{info.icon}</span>
                            <span className="text-[10px] font-semibold">{info.label}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => moveAction(i, "up")} disabled={i === 0} className="p-0.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                            <button onClick={() => moveAction(i, "down")} disabled={i === formActions.length - 1} className="p-0.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                            <button onClick={() => removeAction(i)} className="p-0.5 rounded hover:bg-accent text-muted-foreground"><X className="h-3 w-3" /></button>
                          </div>
                        </div>
                        {renderActionConfig(action, i)}
                      </CardContent>
                    </Card>
                  );
                })}
                {formActions.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                    Adicione pelo menos uma ação
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancelar</Button>
            <Button onClick={saveAutomation} disabled={!formName.trim() || formActions.length === 0}>
              {editId ? "Salvar Alterações" : "Criar Automação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── LOG DETAIL DIALOG ── */}
      <Dialog open={logDetailOpen} onOpenChange={setLogDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhe da Execução</DialogTitle>
            <DialogDescription>
              {selectedLog?.executed_at ? new Date(selectedLog.executed_at).toLocaleString("pt-BR") : "—"}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Status:</Label>
                {selectedLog.status === "success" ? (
                  <Badge className="text-[9px] bg-success/10 text-success border-success/30">Sucesso</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[9px]">Erro</Badge>
                )}
                {selectedLog.duration_ms && <span className="text-xs text-muted-foreground">{selectedLog.duration_ms}ms</span>}
              </div>
              {selectedLog.error_message && (
                <div className="space-y-1">
                  <Label className="text-xs text-destructive">Erro:</Label>
                  <pre className="text-[10px] bg-destructive/5 p-2 rounded-md border border-destructive/20 whitespace-pre-wrap">{selectedLog.error_message}</pre>
                </div>
              )}
              {selectedLog.trigger_payload && (
                <div className="space-y-1">
                  <Label className="text-xs">Payload do Trigger:</Label>
                  <pre className="text-[10px] bg-muted p-2 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(selectedLog.trigger_payload, null, 2)}</pre>
                </div>
              )}
              {selectedLog.actions_result && (
                <div className="space-y-1">
                  <Label className="text-xs">Resultado das Ações:</Label>
                  <pre className="text-[10px] bg-muted p-2 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(selectedLog.actions_result, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
