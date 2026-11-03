import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, Handshake, Activity, BarChart3, Settings,
  Inbox, FileText, Zap, Target, Search as SearchIcon,
} from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useDebounce } from "@/hooks/useDebounce";

const pages = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Contatos", icon: Users, path: "/contacts" },
  { label: "Empresas", icon: Building2, path: "/companies" },
  { label: "Negócios", icon: Handshake, path: "/deals" },
  { label: "Atividades", icon: Activity, path: "/activities" },
  { label: "Atividades", icon: Activity, path: "/activities" },
  { label: "Caixa de Entrada", icon: Inbox, path: "/inbox" },
  { label: "Templates de Email", icon: FileText, path: "/email-templates" },
  { label: "Sequências", icon: Zap, path: "/email-sequences" },
  { label: "Lead Scoring", icon: Target, path: "/lead-scoring" },
  { label: "Relatórios", icon: BarChart3, path: "/reports" },
  { label: "Automações", icon: Zap, path: "/automations" },
  { label: "Configurações", icon: Settings, path: "/settings" },
];

const shortcuts = [
  { label: "Novo Contato", keys: "N", desc: "Criar contato" },
  { label: "Novo Negócio", keys: "D", desc: "Criar negócio" },
  { label: "Nova Tarefa", keys: "T", desc: "Criar tarefa" },
  { label: "Buscar", keys: "⌘K", desc: "Abrir busca" },
  { label: "Focar busca", keys: "/", desc: "Focar campo de busca" },
  { label: "Fechar", keys: "Esc", desc: "Fechar modal" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { orgId } = useOrg();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("fc-recent-searches") || "[]"); }
    catch { return []; }
  });

  const searchEntities = useCallback(async (q: string) => {
    if (!orgId || !q || q.length < 2) {
      setContacts([]); setDeals([]); setCompanies([]);
      return;
    }
    const [cRes, dRes, coRes] = await Promise.all([
      supabase.from("contacts").select("id, first_name, last_name, email, status").eq("org_id", orgId).or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
      supabase.from("deals").select("id, title, value, status").eq("org_id", orgId).ilike("title", `%${q}%`).limit(5),
      supabase.from("companies").select("id, name, domain").eq("org_id", orgId).ilike("name", `%${q}%`).limit(5),
    ]);
    setContacts(cRes.data || []);
    setDeals(dRes.data || []);
    setCompanies(coRes.data || []);
  }, [orgId]);

  useEffect(() => { searchEntities(debouncedSearch); }, [debouncedSearch, searchEntities]);

  const handleSelect = (path: string) => {
    if (search && !recentSearches.includes(search)) {
      const updated = [search, ...recentSearches].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem("fc-recent-searches", JSON.stringify(updated));
    }
    navigate(path);
    onOpenChange(false);
    setSearch("");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar páginas, contatos, negócios..." value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

        {/* Real-time entity results */}
        {contacts.length > 0 && (
          <CommandGroup heading="Contatos">
            {contacts.map((c) => (
              <CommandItem key={c.id} onSelect={() => handleSelect(`/contacts`)} className="gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{c.first_name} {c.last_name}</span>
                {c.email && <span className="text-xs text-muted-foreground ml-auto">{c.email}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {deals.length > 0 && (
          <CommandGroup heading="Negócios">
            {deals.map((d) => (
              <CommandItem key={d.id} onSelect={() => handleSelect(`/deals/${d.id}`)} className="gap-2">
                <Handshake className="h-4 w-4 text-muted-foreground" />
                <span>{d.title}</span>
                {d.value && <Badge variant="secondary" className="ml-auto text-[9px]">R$ {Number(d.value).toLocaleString("pt-BR")}</Badge>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {companies.length > 0 && (
          <CommandGroup heading="Empresas">
            {companies.map((c) => (
              <CommandItem key={c.id} onSelect={() => handleSelect(`/companies`)} className="gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{c.name}</span>
                {c.domain && <span className="text-xs text-muted-foreground ml-auto">{c.domain}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent searches */}
        {!search && recentSearches.length > 0 && (
          <CommandGroup heading="Buscas Recentes">
            {recentSearches.map((s, i) => (
              <CommandItem key={i} onSelect={() => setSearch(s)} className="gap-2">
                <SearchIcon className="h-4 w-4 text-muted-foreground" />
                {s}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Páginas">
          {pages.map((page) => (
            <CommandItem key={page.path} onSelect={() => handleSelect(page.path)} className="gap-2">
              <page.icon className="h-4 w-4 text-muted-foreground" />
              {page.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Atalhos de Teclado">
          {shortcuts.map((s) => (
            <CommandItem key={s.label} className="gap-2 justify-between" disabled>
              <span className="text-xs text-muted-foreground">{s.desc}</span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{s.keys}</kbd>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
