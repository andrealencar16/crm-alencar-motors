import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyBRL } from "@/types/automotive";

interface DealOption {
  id: string;
  title: string;
  value: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  orgId: string | null;
  onLinked: () => void;
}

export function LinkDealDialog({ open, onOpenChange, vehicleId, orgId, onLinked }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId) return;
    setLoading(true);
    void supabase
      .from("deals")
      .select("id, title, value")
      .eq("org_id", orgId)
      .ilike("title", `%${search}%`)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setDeals(((data as DealOption[] | null) ?? []).filter(Boolean));
        setLoading(false);
      });
  }, [open, search, orgId]);

  const link = async (dealId: string) => {
    setLinkingId(dealId);
    const { error: dealErr } = await supabase
      .from("deals")
      .update({ vehicle_id: vehicleId } as never)
      .eq("id", dealId);
    if (dealErr) {
      toast({ title: "Erro", description: dealErr.message, variant: "destructive" });
    } else {
      await supabase
        .from("vehicles" as never)
        .update({ deal_id_atual: dealId } as never)
        .eq("id", vehicleId);
      toast({ title: "Deal vinculado" });
      onLinked();
      onOpenChange(false);
    }
    setLinkingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular a um deal</DialogTitle>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar deal..."
          aria-label="Buscar deal..."
          autoFocus
        />
        <div className="max-h-[300px] overflow-y-auto divide-y divide-border rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : deals.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum deal encontrado.</p>
          ) : (
            deals.map((d) => (
              <button
                key={d.id}
                onClick={() => void link(d.id)}
                disabled={!!linkingId}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors text-left text-sm disabled:opacity-50"
              >
                <span className="truncate">{d.title}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {formatCurrencyBRL(d.value)}
                  {linkingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                </span>
              </button>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
