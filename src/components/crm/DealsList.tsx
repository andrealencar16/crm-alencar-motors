import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, Trophy, XCircle, Trash2, AlertTriangle } from "lucide-react";
import type { DealWithRelations } from "@/pages/Deals";
import type { Database } from "@/integrations/supabase/types";

type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

type SortKey = "title" | "value" | "close_date" | "probability" | "status" | "created_at";
type SortDir = "asc" | "desc";

const statusLabels = { open: "Aberto", won: "Ganho", lost: "Perdido" };
const statusColors = {
  open: "bg-primary/10 text-primary",
  won: "bg-success/10 text-success",
  lost: "bg-destructive/10 text-destructive",
};

interface DealsListProps {
  deals: DealWithRelations[];
  stages: Stage[];
  selectedDeals: Set<string>;
  onSelectionChange: (s: Set<string>) => void;
  onDealClick: (d: DealWithRelations) => void;
  onBatchAction: (action: "won" | "lost" | "delete") => void;
}

export function DealsList({
  deals, stages, selectedDeals, onSelectionChange, onDealClick, onBatchAction,
}: DealsListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...deals].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "title": cmp = (a.title || "").localeCompare(b.title || ""); break;
      case "value": cmp = (Number(a.value) || 0) - (Number(b.value) || 0); break;
      case "probability": cmp = (Number(a.probability) || 0) - (Number(b.probability) || 0); break;
      case "close_date": cmp = (a.close_date || "").localeCompare(b.close_date || ""); break;
      case "status": cmp = (a.status || "").localeCompare(b.status || ""); break;
      case "created_at": cmp = (a.created_at || "").localeCompare(b.created_at || ""); break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const allSelected = sorted.length > 0 && sorted.every((d) => selectedDeals.has(d.id));
  const toggleAll = () => {
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(sorted.map((d) => d.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedDeals);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next);
  };

  const getStageName = (stageId: string | null) => {
    if (!stageId) return "—";
    return stages.find((s) => s.id === stageId)?.name || "—";
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground transition-colors">
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-3">
      {selectedDeals.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
          <span className="text-sm font-medium">{selectedDeals.size} selecionados</span>
          <Button size="sm" variant="outline" onClick={() => onBatchAction("won")}>
            <Trophy className="mr-1 h-3.5 w-3.5 text-success" />Ganhos
          </Button>
          <Button size="sm" variant="outline" onClick={() => onBatchAction("lost")}>
            <XCircle className="mr-1 h-3.5 w-3.5 text-destructive" />Perdidos
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onBatchAction("delete")}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />Excluir
          </Button>
        </div>
      )}

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
              </TableHead>
              <TableHead><SortHeader label="Título" field="title" /></TableHead>
              <TableHead><SortHeader label="Valor" field="value" /></TableHead>
              <TableHead className="hidden md:table-cell">Estágio</TableHead>
              <TableHead className="hidden lg:table-cell"><SortHeader label="Probabilidade" field="probability" /></TableHead>
              <TableHead className="hidden sm:table-cell"><SortHeader label="Fechamento" field="close_date" /></TableHead>
              <TableHead><SortHeader label="Status" field="status" /></TableHead>
              <TableHead className="hidden lg:table-cell">Responsável</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((deal) => {
              const daysUntilClose = deal.close_date
                ? Math.ceil((new Date(deal.close_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
              const isUrgent = daysUntilClose !== null && daysUntilClose < 7 && daysUntilClose >= 0;

              return (
                <TableRow key={deal.id} className="cursor-pointer" onClick={() => onDealClick(deal)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedDeals.has(deal.id)} onCheckedChange={() => toggleOne(deal.id)} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{deal.title}</span>
                      {deal.company && <p className="text-xs text-muted-foreground">{deal.company.name}</p>}
                    </div>
                  </TableCell>
                  <TableCell className="font-semibold text-primary">
                    {formatCurrency(Number(deal.value) || 0, deal.currency || "BRL")}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">{getStageName(deal.stage_id)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {(deal.probability ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-xs">{deal.probability}%</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {deal.close_date ? (
                      <div className={`flex items-center gap-1 text-sm ${isUrgent ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {isUrgent && <AlertTriangle className="h-3 w-3" />}
                        {new Date(deal.close_date).toLocaleDateString("pt-BR")}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={statusColors[deal.status || "open"]}>
                      {statusLabels[deal.status || "open"]}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {deal.owner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={deal.owner.avatar_url || ""} />
                          <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                            {deal.owner.name?.charAt(0)?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">{deal.owner.name}</span>
                      </div>
                    ) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhum negócio encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
