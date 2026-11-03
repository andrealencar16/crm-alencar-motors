import { useEffect, useState, useCallback, useMemo } from "react";
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
  Plus, Search, LayoutGrid, List, Filter, ArrowUpDown, Upload, Download,
  Trash2, ChevronLeft, ChevronRight, X, Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CompanyDrawer } from "@/components/crm/CompanyDrawer";
import { CompanyCreateModal } from "@/components/crm/CompanyCreateModal";
import { CSVImportModal } from "@/components/crm/CSVImportModal";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type SortKey = "name" | "domain" | "industry" | "size" | "revenue" | "created_at";
type SortDir = "asc" | "desc";
type ViewMode = "table" | "cards";
const PAGE_SIZE = 50;

interface CompanyFilters {
  industry?: string;
  size?: string;
  ownerId?: string;
}

export default function Companies() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<CompanyFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());

  const [drawerCompany, setDrawerCompany] = useState<Company | null>(null);
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

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [cRes, mRes] = await Promise.all([
      supabase.from("companies").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("org_id", orgId),
    ]);
    setCompanies(cRes.data || []);
    setMembers(mRes.data || []);
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Get unique industries for filter
  const industries = useMemo(() => {
    return [...new Set(companies.map((c) => c.industry).filter(Boolean))] as string[];
  }, [companies]);

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      const s = `${c.name} ${c.domain} ${c.industry}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filters.industry && c.industry !== filters.industry) return false;
      if (filters.size && c.size !== filters.size) return false;
      if (filters.ownerId && c.owner_id !== filters.ownerId) return false;
      return true;
    });
  }, [companies, search, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "domain": cmp = (a.domain || "").localeCompare(b.domain || ""); break;
        case "industry": cmp = (a.industry || "").localeCompare(b.industry || ""); break;
        case "size": cmp = (a.size || "").localeCompare(b.size || ""); break;
        case "revenue": cmp = (Number(a.revenue) || 0) - (Number(b.revenue) || 0); break;
        case "created_at": cmp = (a.created_at || "").localeCompare(b.created_at || ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const allSelected = paginated.length > 0 && paginated.every((c) => selectedCompanies.has(c.id));
  const toggleAll = () => {
    if (allSelected) setSelectedCompanies(new Set());
    else setSelectedCompanies(new Set(paginated.map((c) => c.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedCompanies);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedCompanies(next);
  };

  const batchDelete = async () => {
    const ids = Array.from(selectedCompanies);
    await Promise.all(ids.map((id) => supabase.from("companies").delete().eq("id", id)));
    setSelectedCompanies(new Set());
    fetchData();
    toast({ title: `${ids.length} empresas excluídas` });
  };

  const exportCSV = () => {
    const rows = sorted.map((c) => ({
      Nome: c.name, Domínio: c.domain || "", Indústria: c.industry || "",
      Tamanho: c.size || "", Receita: c.revenue || "", Website: c.website || "",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${(r as any)[h] || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "empresas.csv"; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exportado" });
  };

  const formatRevenue = (v: number | null) => {
    if (!v) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}<ArrowUpDown className="h-3 w-3" />
    </button>
  );

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Empresas</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">{filtered.length} empresas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
            <button onClick={() => setViewMode("table")} aria-label="Visualização tabela" className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="h-3.5 w-3.5" /><span className="hidden sm:inline">Tabela</span>
            </button>
            <button onClick={() => setViewMode("cards")} aria-label="Visualização cartões" className={`flex items-center gap-1 rounded-md px-2 sm:px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "cards" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /><span className="hidden sm:inline">Cartões</span>
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
          <Button onClick={() => setCreateOpen(true)} aria-label="Criar nova empresa">
            <Plus className="mr-1 sm:mr-2 h-4 w-4" /><span className="hidden sm:inline">Nova Empresa</span><span className="sm:hidden">Nova</span>
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar empresas..." aria-label="Buscar empresas..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="space-y-1">
            <Label className="text-xs">Indústria</Label>
            <Select value={filters.industry || "all"} onValueChange={(v) => setFilters({ ...filters, industry: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {industries.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tamanho</Label>
            <Select value={filters.size || "all"} onValueChange={(v) => setFilters({ ...filters, size: v === "all" ? undefined : v })}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="1-10">1-10</SelectItem>
                <SelectItem value="11-50">11-50</SelectItem>
                <SelectItem value="51-200">51-200</SelectItem>
                <SelectItem value="201-500">201-500</SelectItem>
                <SelectItem value="500+">500+</SelectItem>
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
          {Object.values(filters).some(Boolean) && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilters({})}>
              <X className="mr-1 h-3 w-3" />Limpar
            </Button>
          )}
        </div>
      )}

      {selectedCompanies.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <span className="text-sm font-medium">{selectedCompanies.size} selecionadas</span>
          <Button size="sm" variant="destructive" onClick={batchDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Excluir
          </Button>
        </div>
      )}

      {viewMode === "table" && (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todas" /></TableHead>
                <TableHead><SortHeader label="Empresa" field="name" /></TableHead>
                <TableHead className="hidden sm:table-cell"><SortHeader label="Domínio" field="domain" /></TableHead>
                <TableHead className="hidden md:table-cell"><SortHeader label="Indústria" field="industry" /></TableHead>
                <TableHead className="hidden lg:table-cell"><SortHeader label="Tamanho" field="size" /></TableHead>
                <TableHead className="hidden lg:table-cell"><SortHeader label="Receita" field="revenue" /></TableHead>
                <TableHead className="hidden md:table-cell"><SortHeader label="Criado em" field="created_at" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setDrawerCompany(c)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedCompanies.has(c.id)} onCheckedChange={() => toggleOne(c.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {c.domain ? (
                        <img
                          src={`https://logo.clearbit.com/${c.domain}`}
                          alt=""
                          className="h-8 w-8 rounded-md bg-muted object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            <Building2 className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">{c.domain}</TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{c.industry}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{c.size}</TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell">{formatRevenue(Number(c.revenue))}</TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden md:table-cell">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {paginated.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Nenhuma empresa encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {viewMode === "cards" && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {paginated.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDrawerCompany(c)}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  {c.domain ? (
                    <img src={`https://logo.clearbit.com/${c.domain}`} alt="" className="h-10 w-10 rounded-md bg-muted object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <Avatar className="h-10 w-10"><AvatarFallback className="bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></AvatarFallback></Avatar>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-medium truncate">{c.name}</p>
                    {c.industry && <p className="text-xs text-muted-foreground truncate">{c.industry}</p>}
                  </div>
                </div>
                {c.domain && <p className="text-xs text-muted-foreground">{c.domain}</p>}
                {c.revenue && <p className="text-sm font-semibold text-primary">{formatRevenue(Number(c.revenue))}</p>}
              </CardContent>
            </Card>
          ))}
          {paginated.length === 0 && <div className="col-span-full py-10 text-center text-muted-foreground">Nenhuma empresa encontrada</div>}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages} · {sorted.length} empresas</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <CompanyDrawer company={drawerCompany} onClose={() => setDrawerCompany(null)} onUpdate={fetchData} members={members} />
      <CompanyCreateModal open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchData} />
      <CSVImportModal open={csvOpen} onOpenChange={setCsvOpen} onImported={fetchData} entityType="companies" />
    </div>
  );
}
