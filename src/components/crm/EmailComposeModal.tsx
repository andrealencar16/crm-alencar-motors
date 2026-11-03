import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Send, FileText, ChevronDown, X, Variable, Sparkles, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Contact = { id: string; first_name: string; last_name: string | null; email: string | null; org_id: string };
type Deal = { id: string; title: string; org_id: string; contact_id: string | null };
type Template = { id: string; name: string; subject: string; body_html: string; category: string | null };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSent?: () => void;
  defaultTo?: string;
  defaultContactId?: string;
  defaultDealId?: string;
}

const VARIABLES = [
  { key: "{{primeiro_nome}}", label: "Primeiro nome" },
  { key: "{{sobrenome}}", label: "Sobrenome" },
  { key: "{{empresa}}", label: "Empresa" },
  { key: "{{email}}", label: "Email" },
  { key: "{{dono_nome}}", label: "Nome do dono" },
];

export function EmailComposeModal({ open, onOpenChange, onSent, defaultTo, defaultContactId, defaultDealId }: Props) {
  const { orgId } = useOrg();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [to, setTo] = useState(defaultTo || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [contactId, setContactId] = useState(defaultContactId || "none");
  const [dealId, setDealId] = useState(defaultDealId || "none");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sending, setSending] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("formal");
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);
  useEffect(() => {
    if (!open || !orgId) return;
    setTo(defaultTo || ""); setSubject(""); setBody(""); setCc(""); setBcc("");
    setContactId(defaultContactId || "none"); setDealId(defaultDealId || "none");
    Promise.all([
      supabase.from("contacts").select("id,first_name,last_name,email,org_id").eq("org_id", orgId),
      supabase.from("deals").select("id,title,org_id,contact_id").eq("org_id", orgId),
      supabase.from("email_templates").select("*").eq("org_id", orgId),
    ]).then(([c, d, t]) => {
      const contactsList = (c.data as Contact[]) || [];
      const dealsList = (d.data as Deal[]) || [];
      setContacts(contactsList);
      setDeals(dealsList);
      setTemplates((t.data as Template[]) || []);
      // Auto-fill "to" from defaultContactId
      if (!defaultTo && defaultContactId && defaultContactId !== "none") {
        const contact = contactsList.find((ct) => ct.id === defaultContactId);
        if (contact?.email) setTo(contact.email);
      }
      // Auto-select contact from defaultDealId
      if (defaultDealId && defaultDealId !== "none" && (!defaultContactId || defaultContactId === "none")) {
        const deal = dealsList.find((dl) => dl.id === defaultDealId);
        if (deal?.contact_id) {
          setContactId(deal.contact_id);
          const contact = contactsList.find((ct) => ct.id === deal.contact_id);
          if (contact?.email && !defaultTo) setTo(contact.email);
        }
      }
    });
  }, [open, orgId]);

  const applyTemplate = (tpl: Template) => {
    setSubject(tpl.subject);
    // Replace variables with contact data
    let html = tpl.body_html;
    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      html = html.replace(/\{\{primeiro_nome\}\}/g, contact.first_name);
      html = html.replace(/\{\{sobrenome\}\}/g, contact.last_name || "");
      html = html.replace(/\{\{email\}\}/g, contact.email || "");
    }
    html = html.replace(/\{\{dono_nome\}\}/g, profile?.name || "");
    setBody(html);
  };

  const insertVariable = (varKey: string) => {
    setBody((prev) => prev + varKey);
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) { toast({ title: "Descreva o que deseja no email", variant: "destructive" }); return; }
    setAiLoading(true);
    try {
      const contact = contacts.find((c) => c.id === contactId);
      const contextStr = contact ? `Contato: ${contact.first_name} ${contact.last_name || ""}, Email: ${contact.email}` : "";
      const { data, error } = await supabase.functions.invoke("ai-email", {
        body: { prompt: aiPrompt, tone: aiTone, context: contextStr },
      });
      if (error) throw error;
      if (data.error) { toast({ title: data.error, variant: "destructive" }); return; }
      if (data.body) setBody(data.body);
      if (data.subject_options?.length) setAiSubjects(data.subject_options);
    } catch (e: any) {
      toast({ title: "Erro ao gerar email", description: e.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const handleSend = async () => {
    if (!orgId || !to.trim() || !subject.trim()) {
      toast({ title: "Preencha destinatário e assunto", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabase.from("emails").insert({
      org_id: orgId,
      user_id: user?.id,
      contact_id: contactId !== "none" ? contactId : null,
      deal_id: dealId !== "none" ? dealId : null,
      direction: "outbound",
      subject,
      body_html: body,
      from_email: user?.email || profile?.email,
      to_emails: to.split(",").map((e) => e.trim()).filter(Boolean),
      cc_emails: cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : [],
      bcc_emails: bcc ? bcc.split(",").map((e) => e.trim()).filter(Boolean) : [],
      status: "sent",
      provider: "manual",
      sent_at: new Date().toISOString(),
    } as any);
    setSending(false);
    if (error) { toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" }); return; }
    onOpenChange(false);
    onSent?.();
    toast({ title: "Email enviado" });
  };

  // Auto-fill "to" when contact is selected
  const onContactChange = (v: string) => {
    setContactId(v);
    setDealId("none");
    if (v !== "none") {
      const c = contacts.find((c) => c.id === v);
      if (c?.email) setTo(c.email);
    }
  };

  const filteredDeals = contactId !== "none"
    ? deals.filter((d) => d.contact_id === contactId)
    : deals;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Compor Email
          </DialogTitle>
          <DialogDescription>Envie um email diretamente pelo CRM</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Contact / Deal selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Contato</Label>
              <Select value={contactId} onValueChange={onContactChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name} {c.email ? `(${c.email})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Negócio</Label>
              <Select value={dealId} onValueChange={setDealId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {filteredDeals.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* To */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Para *</Label>
              {!showCcBcc && (
                <button onClick={() => setShowCcBcc(true)} className="text-[10px] text-primary hover:underline">
                  Cc/Bcc
                </button>
              )}
            </div>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemplo.com" aria-label="email@exemplo.com" className="h-8 text-sm" />
          </div>

          {showCcBcc && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Cc</Label>
                <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bcc</Label>
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8 text-sm" />
              </div>
            </>
          )}

          {/* Subject */}
          <div className="space-y-1">
            <Label className="text-xs">Assunto *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-8 text-sm" />
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            {/* Templates */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px]">
                  <FileText className="mr-1 h-3 w-3" />Templates
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-2" align="start">
                {templates.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">Nenhum template criado</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                      >
                        <p className="font-medium">{t.name}</p>
                        {t.category && <span className="text-[9px] text-muted-foreground">{t.category}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Variables */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[10px]">
                  <Variable className="mr-1 h-3 w-3" />Variáveis
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" align="start">
                <div className="space-y-0.5">
                  {VARIABLES.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="w-full text-left rounded-md px-2 py-1 text-xs hover:bg-accent transition-colors flex justify-between"
                    >
                      <span>{v.label}</span>
                      <code className="text-[9px] text-muted-foreground">{v.key}</code>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* AI Generate */}
            <Button
              variant={showAiPanel ? "default" : "outline"}
              size="sm"
              className="h-7 text-[10px] ml-auto"
              onClick={() => setShowAiPanel(!showAiPanel)}
            >
              <Sparkles className="mr-1 h-3 w-3" />Gerar com IA
            </Button>
          </div>

          {/* AI Panel */}
          {showAiPanel && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ex: Email de follow-up após reunião sobre proposta..."
                  aria-label="Ex: Email de follow-up após reunião sobre proposta..."
                  className="h-8 text-xs flex-1"
                />
                <Select value={aiTone} onValueChange={setAiTone}>
                  <SelectTrigger className="h-8 w-28 text-[10px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="persuasive">Persuasivo</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8 text-xs" onClick={generateWithAI} disabled={aiLoading}>
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gerar"}
                </Button>
              </div>
              {aiSubjects.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-muted-foreground font-medium">Sugestões de assunto:</p>
                  <div className="flex flex-wrap gap-1">
                    {aiSubjects.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setSubject(s)}
                        className="text-[9px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escreva o conteúdo do email..."
            rows={8}
            className="text-sm"
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSend} disabled={sending || !to.trim() || !subject.trim()}>
              <Send className="mr-1.5 h-4 w-4" />{sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
