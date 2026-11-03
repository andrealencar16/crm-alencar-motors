import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, LayoutGrid, List, Filter, ArrowUpDown, Upload, Download,
  MoreHorizontal, UserPlus, Tag, Trash2, ChevronLeft, ChevronRight, X, AlertTriangle, Users,
} from "lucide-react";
import { ContactsKanbanByOwner } from "@/components/crm/ContactsKanbanByOwner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { ContactDrawer } from "@/components/crm/ContactDrawer";
import { ContactCreateModal } from "@/components/crm/ContactCreateModal";
import { CSVImportModal } from "@/components/crm/CSVImportModal";
import type { Database } from "@/integrations/supabase/types";

type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type ContactStatus = Database["public"]["Enums"]["contact_status"];

const statusColors: Record<ContactStatus, string> = {
  lead: "bg-primary/10 text-primary",
  prospect: "bg-warning/10 text-warning",
  customer: "bg-success/10 text-success",
  churned: "bg-destructive/10 text-destructive",
};
const statusLabels: Record<ContactStatus, string> = {
  lead: "Lead", prospect: "Prospect", customer: "Cliente", churned: "Churned",
};

const cleanPhone = (p: string | null) => p || "";

type SortKey = "name" | "email" | "status" | "created_at" | "title";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "cards" | "owner";

const PAGE_SIZE = 50;

interface ContactFilters {
  status?: string;
  ownerId?: string;
  companyId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export default function Contacts() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<ContactFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Drawers & modals
  const [drawerContact, setDrawerContact] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setCreateOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Risk: last activity per contact
  const [lastActivityMap, setLastActivityMap] = useState<Map<string, Date>>(new Map());

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [cRes, coRes, mRes, actRes] = await Promise.all([
      supabase.from("contacts").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("companies").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
      supabase.from("activities").select("contact_id,created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    ]);
    setContacts(cRes.data || []);
    setCompanies(coRes.data || []);
    setMembers(mRes.data || []);

    // Build last activity map
    const map = new Map<string, Date>();
    (actRes.data || []).forEach((a: any) => {
      if (a.contact_id && a.created_at) {
        const d = new Date(a.created_at);
        const existing = map.get(a.contact_id);
        if (!existing || d > existing) map.set(a.contact_id, d);
      }
    });
    setLastActivityMap(map);
  }, [orgId]);

  const getInactivityDays = (contactId: string, createdAt: string | null) => {
    const lastAct = lastActivityMap.get(contactId);
    const ref = lastAct || (createdAt ? new Date(createdAt) : null);
    if (!ref) return null;
    return Math.floor((Date.now() - ref.getTime()) / 86400000);
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription for contacts
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('contacts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts', filter: `org_id=eq.${orgId}` },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, fetchData]);

  // Owner change handler for drag-and-drop
  const handleOwnerChange = async (contactId: string, newOwnerId: string | null) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, owner_id: newOwnerId } : c))
    );
    await supabase.from("contacts").update({ owner_id: newOwnerId }).eq("id", contactId);
    toast({ title: newOwnerId ? "Responsável atribuído" : "Responsável removido" });
  };

  // Filtering
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const searchStr = `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase();
      if (search && !searchStr.includes(search.toLowerCase())) return false;
      if (filters.status && filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.ownerId && c.owner_id !== filters.ownerId) return false;
      if (filters.companyId && (c as any).company_id !== filters.companyId) return false;
      if (filters.createdFrom && c.created_at && c.created_at < filters.createdFrom) return false;
      if (filters.createdTo && c.created_at && c.created_at > filters.createdTo) return false;
      return true;
    });
  }, [contacts, search, filters]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`); break;
        case "email": cmp = (a.email || "").localeCompare(b.email || ""); break;
        case "status": cmp = (a.status || "").localeCompare(b.status || ""); break;
        case "title": cmp = (a.title || "").localeCompare(b.title || ""); break;
        case "created_at": cmp = (a.created_at || "").localeCompare(b.created_at || ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const allSelected = paginated.length > 0 && paginated.every((c) => selectedContacts.has(c.id));
  const toggleAll = () => {
    if (allSelected) setSelectedContacts(new Set());
    else setSelectedContacts(new Set(paginated.map((c) => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedContacts);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedContacts(next);
  };

  // Batch actions
  const batchDelete = async () => {
    const ids = Array.from(selectedContacts);
    await Promise.all(ids.map((id) => supabase.from("contacts").delete().eq("id", id)));
    setSelectedContacts(new Set());
    fetchData();
    toast({ title: `${ids.length} contatos excluídos` });
  };

  const batchChangeStatus = async (status: ContactStatus) => {
    const ids = Array.from(selectedContacts);
    await Promise.all(ids.map((id) => supabase.from("contacts").update({ status }).eq("id", id)));
    setSelectedContacts(new Set());
    fetchData();
    toast({ title: `Status atualizado para ${ids.length} contatos` });
  };

  const exportCSV = () => {
    const rows = sorted.map((c) => {
      const comp = companies.find((co) => co.id === (c as any).company_id);
      return {
        Nome: c.first_name, Sobrenome: c.last_name || "", Email: c.email || "",
        Telefone: cleanPhone(c.phone), Cargo: c.title || "", Empresa: comp?.name || "", Status: c.status || "",
      };
    });
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${(r as any)[h] || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contatos.csv"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado" });
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}<ArrowUpDown className="h-3 w-3" />
    </button>
  );

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Contatos</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{filtered.length} contatos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button onClick={() => setViewMode("table")} aria-label="Visualização tabela" className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tabela</span>
            </button>
            <button onClick={() => setViewMode("cards")} aria-label="Visualização cartões" className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "cards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cartões</span>
            </button>
            <button onClick={() => setViewMode("owner")} aria-label="Visualização por vendedor" className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "owner" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Users className="h-3.5 w-3.5" /><span className="hidden sm:inline">Vendedor</span>
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} aria-label="Alternar filtros">
            <Filter className="mr-1 h-3.5 w-3.5" /><span className="hidden sm:inline">Filtros</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)} aria-label="Importar CSV" className="hidden sm:flex">
            <Upload className="mr-1.5 h-3.5 w-3.5" />Importar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} aria-label="Exportar CSV" className="hidden sm:flex">
            <Download className="mr-1.5 h-3.5 w-3.5" />Exportar
          </Button>
          <Button onClick={() => setCreateOpen(true)} aria-label="Criar novo contato">
            <Plus className="mr-1 sm:mr-2 h-4 w-4" /><span className="hidden sm:inline">Novo Contato</span><span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, email..." aria-label="Buscar por nome, email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="customer">Cliente</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Responsável</Label>
            <Select value={filters.ownerId || "all"} onValueChange={(v) => setFilters({ ...filters, ownerId: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Empresa</Label>
            <Select value={filters.companyId || "all"} onValueChange={(v) => setFilters({ ...filters, companyId: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Criado de</Label>
            <Input type="date" className="w-36 h-8 text-xs" value={filters.createdFrom ?? ""} onChange={(e) => setFilters({ ...filters, createdFrom: e.target.value || undefined })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">até</Label>
            <Input type="date" className="w-36 h-8 text-xs" value={filters.createdTo ?? ""} onChange={(e) => setFilters({ ...filters, createdTo: e.target.value || undefined })} />
          </div>
          {Object.values(filters).some(Boolean) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({})}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>
      )}

      {/* Batch Actions */}
      {selectedContacts.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <span className="text-sm font-medium">{selectedContacts.size} selecionados</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">Mudar Status</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => batchChangeStatus("lead")}>Lead</DropdownMenuItem>
              <DropdownMenuItem onClick={() => batchChangeStatus("prospect")}>Prospect</DropdownMenuItem>
              <DropdownMenuItem onClick={() => batchChangeStatus("customer")}>Cliente</DropdownMenuItem>
              <DropdownMenuItem onClick={() => batchChangeStatus("churned")}>Churned</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="destructive" onClick={batchDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Excluir
          </Button>
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" /></TableHead>
                <TableHead><SortHeader label="Nome" field="name" /></TableHead>
                <TableHead className="hidden sm:table-cell"><SortHeader label="Email" field="email" /></TableHead>
                <TableHead className="hidden md:table-cell">Empresa</TableHead>
                <TableHead className="hidden lg:table-cell"><SortHeader label="Cargo" field="title" /></TableHead>
                <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                <TableHead><SortHeader label="Status" field="status" /></TableHead>
                <TableHead className="hidden md:table-cell"><SortHeader label="Criado em" field="created_at" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDrawerContact(c)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedContacts.has(c.id)} onCheckedChange={() => toggleOne(c.id)} aria-label={`Selecionar ${c.first_name}`} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {c.first_name[0]}{c.last_name?.[0] || ""}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{c.first_name} {c.last_name}</span>
                          {(() => {
                            const days = getInactivityDays(c.id, c.created_at);
                            if (days === null || days < 14) return null;
                            const isHigh = days >= 21;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded ${isHigh ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                                      <AlertTriangle className="h-2.5 w-2.5" />{days}d
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {days} dias sem atividade
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block sm:hidden">{c.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-xs">
                    {(() => { const comp = companies.find((co) => co.id === (c as any).company_id); return comp?.name || "—"; })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{c.title}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{cleanPhone(c.phone)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[c.status || "lead"]}>
                      {statusLabels[c.status || "lead"]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden md:table-cell">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Nenhum contato encontrado</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Card View */}
      {viewMode === "cards" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {paginated.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrawerContact(c)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {c.first_name[0]}{c.last_name?.[0] || ""}
                    </AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden">
                    <p className="font-medium truncate">{c.first_name} {c.last_name}</p>
                    {c.title && <p className="text-xs text-muted-foreground truncate">{c.title}</p>}
                  </div>
                </div>
                {c.email && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                <Badge variant="secondary" className={`text-[10px] ${statusColors[c.status || "lead"]}`}>
                  {statusLabels[c.status || "lead"]}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {paginated.length === 0 && (
            <div className="col-span-full py-10 text-center text-muted-foreground">Nenhum contato encontrado</div>
          )}
        </div>
      )}

      {/* Owner Kanban View */}
      {viewMode === "owner" && (
        <ContactsKanbanByOwner
          contacts={sorted}
          members={members}
          companies={companies}
          onContactClick={(c) => setDrawerContact(c)}
          onOwnerChange={handleOwnerChange}
        />
      )}

      {/* Pagination (table/cards only) */}
      {viewMode !== "owner" && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages} · {sorted.length} contatos
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Drawer */}
      <ContactDrawer
        contact={drawerContact}
        onClose={() => setDrawerContact(null)}
        onUpdate={fetchData}
        companies={companies}
        members={members}
      />

      {/* Create Modal */}
      <ContactCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={fetchData}
        companies={companies}
      />

      {/* CSV Import */}
      <CSVImportModal
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImported={fetchData}
        entityType="contacts"
      />
    </div>
  );
}
