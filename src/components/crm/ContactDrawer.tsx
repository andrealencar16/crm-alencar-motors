import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Edit2, Check, X, Phone, Mail, FileText, CheckSquare, CalendarDays,
  Building2, Briefcase, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Activity = Database["public"]["Tables"]["activities"]["Row"];
type ContactStatus = Database["public"]["Enums"]["contact_status"];
type ActivityType = Database["public"]["Enums"]["activity_type"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

const statusColors: Record<ContactStatus, string> = {
  lead: "bg-primary/10 text-primary", prospect: "bg-warning/10 text-warning",
  customer: "bg-success/10 text-success", churned: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<ContactStatus, string> = {
  lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned",
};
const activityIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  call: Phone, email: Mail, meeting: CalendarDays, note: FileText, task: CheckSquare,
};
const activityLabels: Record<ActivityType, string> = {
  call: "Ligação", email: "Email", meeting: "Reunião", note: "Nota", task: "Tarefa",
};

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

interface ContactDrawerProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdate: () => void;
  companies: Company[];
  members: Profile[];
}

export function ContactDrawer({ contact, onClose, onUpdate, companies, members }: ContactDrawerProps) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Contact>>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [activityForm, setActivityForm] = useState({ type: "note" as ActivityType, title: "", body: "" });

  const fetchRelated = useCallback(async () => {
    if (!contact) return;
    const [aRes, dRes, sRes] = await Promise.all([
      supabase.from("activities").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }),
      supabase.from("deals").select("*").eq("contact_id", contact.id),
      supabase.from("pipeline_stages").select("*").eq("org_id", contact.org_id).order("order"),
    ]);
    setActivities(aRes.data || []);
    setDeals(dRes.data || []);
    setStages(sRes.data || []);
  }, [contact]);

  useEffect(() => {
    if (contact) {
      setForm(contact);
      setEditing(false);
      fetchRelated();
    }
  }, [contact, fetchRelated]);

  const handleSave = async () => {
    if (!contact) return;
    const { error } = await supabase.from("contacts").update({
      first_name: form.first_name, last_name: form.last_name, email: form.email,
      phone: form.phone, title: form.title, status: form.status as ContactStatus,
      linkedin_url: form.linkedin_url, company_id: (form as any).company_id || null,
    }).eq("id", contact.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setEditing(false);
    onUpdate();
    toast({ title: "Contato atualizado" });
  };

  const addActivity = async () => {
    if (!orgId || !contact || !activityForm.title) return;
    await supabase.from("activities").insert({
      org_id: orgId, contact_id: contact.id, type: activityForm.type,
      title: activityForm.title, body: activityForm.body, user_id: user?.id,
    });
    setActivityForm({ type: "note", title: "", body: "" });
    fetchRelated();
    toast({ title: "Atividade adicionada" });
  };

  if (!contact) return null;

  return (
    <Sheet open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0">
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {contact.first_name[0]}{contact.last_name?.[0] || ""}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-lg font-bold">{contact.first_name} {contact.last_name}</h2>
              {contact.title && <p className="text-sm text-muted-foreground">{contact.title}</p>}
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="secondary" className={statusColors[contact.status || "lead"]}>
                  {statusLabels[contact.status || "lead"]}
                </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
              {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="p-4">
          <TabsList className="w-full">
            <TabsTrigger value="overview" className="flex-1">Visão Geral</TabsTrigger>
            <TabsTrigger value="activities" className="flex-1">Atividades</TabsTrigger>
            <TabsTrigger value="deals" className="flex-1">Negócios</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1">Notas</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Nome</Label>
                    <Input value={form.first_name || ""} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Sobrenome</Label>
                    <Input value={form.last_name || ""} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs">Email</Label>
                  <Input type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Telefone</Label>
                  <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">Cargo</Label>
                  <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs">LinkedIn</Label>
                  <Input value={form.linkedin_url || ""} onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })} /></div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status || "lead"} onValueChange={(v) => setForm({ ...form, status: v as ContactStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lead">Lead</SelectItem>
                      <SelectItem value="prospect">Prospect</SelectItem>
                      <SelectItem value="customer">Cliente</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Empresa</Label>
                  <Select value={(form as any).company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v } as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSave} className="w-full"><Save className="mr-2 h-4 w-4" />Salvar</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.phone.replace(/@s\.whatsapp\.net$/i, "").replace(/@lid$/i, "").replace(/@c\.us$/i, "")}</span>
                  </div>
                )}
                {contact.title && (
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.title}</span>
                  </div>
                )}
                {contact.linkedin_url && (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">LinkedIn</span>
                    <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{contact.linkedin_url}</a>
                  </div>
                )}
                {(() => {
                  const comp = companies.find((c) => c.id === (contact as any).company_id);
                  return comp ? (
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span>{comp.name}</span>
                    </div>
                  ) : null;
                })()}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Criado em</span>
                  <span>{contact.created_at ? new Date(contact.created_at).toLocaleDateString("pt-BR") : "—"}</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Activities */}
          <TabsContent value="activities" className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={activityForm.type} onValueChange={(v) => setActivityForm({ ...activityForm, type: v as ActivityType })}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="note">Nota</SelectItem>
                    <SelectItem value="call">Ligação</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="task">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
                <Input className="h-8 text-sm" placeholder="Título" aria-label="Título" value={activityForm.title} onChange={(e) => setActivityForm({ ...activityForm, title: e.target.value })} />
              </div>
              <Textarea placeholder="Descrição..." value={activityForm.body} onChange={(e) => setActivityForm({ ...activityForm, body: e.target.value })} rows={2} className="text-sm" />
              <Button size="sm" onClick={addActivity} disabled={!activityForm.title}>Adicionar</Button>
            </div>
            <div className="space-y-2">
              {activities.map((a) => {
                const Icon = activityIcons[a.type];
                return (
                  <div key={a.id} className="flex gap-3 rounded-lg border border-border p-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground uppercase">{activityLabels[a.type]}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(a.created_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{a.title}</p>
                      {a.body && <p className="mt-0.5 text-xs text-muted-foreground">{a.body}</p>}
                    </div>
                  </div>
                );
              })}
              {activities.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhuma atividade</p>}
            </div>
          </TabsContent>

          {/* Deals */}
          <TabsContent value="deals" className="mt-4 space-y-2">
            {deals.map((d) => {
              const stage = stages.find((s) => s.id === d.stage_id);
              return (
                <Card key={d.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{d.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {stage && (
                            <Badge variant="secondary" className="text-[10px]">
                              {stage.name}
                            </Badge>
                          )}
                          <Badge variant="secondary" className={`text-[10px] ${d.status === "won" ? "bg-success/10 text-success" : d.status === "lost" ? "bg-destructive/10 text-destructive" : ""}`}>
                            {d.status === "open" ? "Aberto" : d.status === "won" ? "Ganho" : "Perdido"}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {formatCurrency(Number(d.value) || 0, d.currency || "BRL")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {deals.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nenhum negócio vinculado</p>}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4 space-y-2">
            {activities.filter((a) => a.type === "note").map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at!).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-sm font-medium">{a.title}</p>
                {a.body && <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>}
              </div>
            ))}
            {activities.filter((a) => a.type === "note").length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhuma nota</p>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
