import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail, Search, Filter, Star, Archive, Clock, MailOpen, Send,
  Reply, ChevronLeft, Inbox as InboxIcon, X, Eye, MousePointerClick,
  RefreshCw, Paperclip, MoreHorizontal, Trash2, SendHorizonal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { EmailComposeModal } from "@/components/crm/EmailComposeModal";

type Email = {
  id: string;
  org_id: string;
  user_id: string | null;
  contact_id: string | null;
  deal_id: string | null;
  company_id: string | null;
  direction: string;
  subject: string | null;
  body_html: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  status: string;
  open_count: number;
  click_count: number;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  thread_id: string | null;
  message_id: string | null;
  provider: string | null;
  is_read: boolean;
  snoozed_until: string | null;
  is_archived: boolean;
  sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Contact = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: string | null;
  org_id: string;
};

type FilterMode = "all" | "unread" | "no_owner" | "needs_reply";
type TabMode = "inbox" | "sent";

export default function Inbox() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [emails, setEmails] = useState<Email[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabMode>("inbox");

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [eRes, cRes] = await Promise.all([
      supabase.from("emails").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("contacts").select("*").eq("org_id", orgId),
    ]);
    setEmails((eRes.data as Email[]) || []);
    setContacts((cRes.data as Contact[]) || []);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>();
    contacts.forEach((c) => { if (c.email) m.set(c.email.toLowerCase(), c); if (c.id) m.set(c.id, c); });
    return m;
  }, [contacts]);

  const getContactForEmail = (email: Email) => {
    if (email.contact_id) return contactMap.get(email.contact_id);
    const addr = email.direction === "inbound" ? email.from_email : (email.to_emails as string[])?.[0];
    if (addr) return contactMap.get(addr.toLowerCase());
    return undefined;
  };

  const filtered = useMemo(() => {
    let list = emails.filter((e) => !e.is_archived);
    // Tab filter
    if (activeTab === "inbox") {
      list = list.filter((e) => e.direction === "inbound");
    } else {
      list = list.filter((e) => e.direction === "outbound");
    }
    if (activeTab === "inbox") {
      if (filterMode === "unread") list = list.filter((e) => !e.is_read);
      if (filterMode === "needs_reply") list = list.filter((e) => e.direction === "inbound" && !e.is_read);
      if (filterMode === "no_owner") list = list.filter((e) => {
        const c = getContactForEmail(e);
        return c && !c.status;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.subject?.toLowerCase().includes(q) ||
        e.from_email?.toLowerCase().includes(q) ||
        (e.to_emails as string[])?.some((t: string) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [emails, filterMode, search, contactMap, activeTab]);

  const markRead = async (id: string) => {
    await supabase.from("emails").update({ is_read: true } as any).eq("id", id);
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, is_read: true } : e));
  };

  const archiveEmail = async (id: string) => {
    await supabase.from("emails").update({ is_archived: true } as any).eq("id", id);
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, is_archived: true } : e));
    if (selectedEmail?.id === id) setSelectedEmail(null);
    toast({ title: "Email arquivado" });
  };

  const snoozeEmail = async (id: string, hours: number) => {
    const until = new Date(Date.now() + hours * 3600000).toISOString();
    await supabase.from("emails").update({ snoozed_until: until, is_read: true } as any).eq("id", id);
    setEmails((prev) => prev.map((e) => e.id === id ? { ...e, snoozed_until: until, is_read: true } : e));
    toast({ title: `Snooze por ${hours}h` });
  };

  const deleteEmail = async (id: string) => {
    await supabase.from("emails").delete().eq("id", id);
    setEmails((prev) => prev.filter((e) => e.id !== id));
    if (selectedEmail?.id === id) setSelectedEmail(null);
    toast({ title: "Email excluído" });
  };

  const sendReply = async () => {
    if (!selectedEmail || !orgId || !replyBody.trim()) return;
    await supabase.from("emails").insert({
      org_id: orgId,
      user_id: user?.id,
      contact_id: selectedEmail.contact_id,
      deal_id: selectedEmail.deal_id,
      direction: "outbound",
      subject: `Re: ${selectedEmail.subject || ""}`,
      body_html: replyBody,
      from_email: user?.email,
      to_emails: [selectedEmail.from_email || ""],
      status: "sent",
      provider: "manual",
      sent_at: new Date().toISOString(),
      thread_id: selectedEmail.thread_id || selectedEmail.id,
    } as any);
    setReplyBody("");
    fetchData();
    toast({ title: "Resposta enviada" });
  };

  const batchArchive = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) await supabase.from("emails").update({ is_archived: true } as any).eq("id", id);
    setSelectedIds(new Set());
    fetchData();
    toast({ title: `${ids.length} emails arquivados` });
  };

  const timeAgo = (d: string | null) => {
    if (!d) return "";
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  const unreadCount = emails.filter((e) => !e.is_read && !e.is_archived).length;

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;

  return (
    <div className="flex h-[calc(100vh-80px)] gap-0 -m-6">
      {/* Left panel - email list */}
      <div className={`flex flex-col border-r border-border ${selectedEmail ? "w-[420px]" : "flex-1"} shrink-0`}>
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">Email</h1>
              {unreadCount > 0 && <Badge variant="destructive" className="text-[10px] px-1.5">{unreadCount}</Badge>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={fetchData}><RefreshCw className="h-3.5 w-3.5" /></Button>
              <Button size="sm" onClick={() => setComposeOpen(true)}><Send className="mr-1.5 h-3.5 w-3.5" />Compor</Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TabMode); setSelectedEmail(null); setSelectedIds(new Set()); }}>
            <TabsList className="w-full">
              <TabsTrigger value="inbox" className="flex-1 gap-1.5">
                <InboxIcon className="h-3.5 w-3.5" />Caixa de Entrada
                {unreadCount > 0 && <Badge variant="destructive" className="text-[8px] px-1 py-0 ml-1">{unreadCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 gap-1.5">
                <SendHorizonal className="h-3.5 w-3.5" />Enviados
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar emails..." aria-label="Buscar emails..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
          {activeTab === "inbox" && (
            <div className="flex gap-1">
              {(["all", "unread", "needs_reply", "no_owner"] as FilterMode[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterMode(f)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${filterMode === f ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f === "all" ? "Todos" : f === "unread" ? "Não lidos" : f === "needs_reply" ? "Requer resposta" : "Sem dono"}
                </button>
              ))}
            </div>
          )}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{selectedIds.size} selecionados</span>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={batchArchive}><Archive className="mr-1 h-3 w-3" />Arquivar</Button>
            </div>
          )}
        </div>

        {/* Email list */}
        <ScrollArea className="flex-1">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Nenhum email encontrado</div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((email) => {
                const contact = getContactForEmail(email);
                const isSelected = selectedEmail?.id === email.id;
                return (
                  <div
                    key={email.id}
                    onClick={() => { setSelectedEmail(email); markRead(email.id); }}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30 ${isSelected ? "bg-accent/50" : ""} ${!email.is_read ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={selectedIds.has(email.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedIds);
                        v ? next.add(email.id) : next.delete(email.id);
                        setSelectedIds(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${!email.is_read ? "font-semibold" : "font-medium"}`}>
                          {activeTab === "sent"
                            ? `Para: ${(email.to_emails as string[])?.[0] || "Desconhecido"}`
                            : contact ? `${contact.first_name} ${contact.last_name || ""}` : email.from_email || "Desconhecido"}
                        </p>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(email.sent_at || email.created_at)}</span>
                      </div>
                      <p className={`text-xs truncate ${!email.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                        {email.subject || "(sem assunto)"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {activeTab === "sent" && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0">Enviado</Badge>
                        )}
                        {activeTab === "inbox" && email.direction === "inbound" && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0">Recebido</Badge>
                        )}
                        {email.open_count > 0 && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <Eye className="h-2.5 w-2.5" />{email.open_count}x
                          </span>
                        )}
                        {email.click_count > 0 && (
                          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                            <MousePointerClick className="h-2.5 w-2.5" />{email.click_count}x
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right panel - email detail + contact context */}
      {selectedEmail && (
        <div className="flex flex-1 min-w-0">
          {/* Email content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Voltar
                </Button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => archiveEmail(selectedEmail.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm"><Clock className="h-3.5 w-3.5" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 1)}>1 hora</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 4)}>4 horas</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeEmail(selectedEmail.id, 24)}>Amanhã</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="ghost" size="sm" onClick={() => deleteEmail(selectedEmail.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <h2 className="text-lg font-semibold">{selectedEmail.subject || "(sem assunto)"}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>De: {selectedEmail.from_email}</span>
                <span>→</span>
                <span>Para: {(selectedEmail.to_emails as string[])?.join(", ")}</span>
              </div>
              {(selectedEmail.open_count > 0 || selectedEmail.click_count > 0) && (
                <div className="flex items-center gap-3 mt-2">
                  {selectedEmail.open_count > 0 && (
                    <Badge variant="secondary" className="text-[9px]">
                      <Eye className="mr-1 h-2.5 w-2.5" />Aberto {selectedEmail.open_count}x
                      {selectedEmail.last_opened_at && ` · ${timeAgo(selectedEmail.last_opened_at)}`}
                    </Badge>
                  )}
                  {selectedEmail.click_count > 0 && (
                    <Badge variant="secondary" className="text-[9px]">
                      <MousePointerClick className="mr-1 h-2.5 w-2.5" />Clicou {selectedEmail.click_count}x
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-4">
              <div
                className="prose prose-sm max-w-none text-foreground"
                dangerouslySetInnerHTML={{ __html: selectedEmail.body_html || "<p class='text-muted-foreground'>(sem conteúdo)</p>" }}
              />
            </ScrollArea>

            {/* Reply box */}
            <div className="p-4 border-t border-border space-y-2">
              <Textarea
                placeholder="Escreva sua resposta..."
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={3}
                className="text-sm"
              />
              <div className="flex justify-end">
                <Button onClick={sendReply} disabled={!replyBody.trim()} size="sm">
                  <Reply className="mr-1.5 h-3.5 w-3.5" />Responder
                </Button>
              </div>
            </div>
          </div>

          {/* Contact sidebar */}
          {(() => {
            const contact = getContactForEmail(selectedEmail);
            if (!contact) return null;
            return (
              <div className="w-[260px] border-l border-border p-4 space-y-3 shrink-0 hidden xl:block">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Contato</p>
                <div>
                  <p className="text-sm font-medium">{contact.first_name} {contact.last_name}</p>
                  <p className="text-xs text-muted-foreground">{contact.email}</p>
                </div>
                {contact.status && (
                  <Badge variant="outline" className="text-[10px]">{contact.status}</Badge>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <EmailComposeModal open={composeOpen} onOpenChange={setComposeOpen} onSent={fetchData} />
    </div>
  );
}
