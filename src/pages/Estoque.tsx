import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Car, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Vehicle,
  VehicleStatus,
  VEHICLE_STATUS_LABEL,
  formatCurrencyBRL,
} from "@/types/automotive";
import { VehicleFormDialog } from "@/components/estoque/VehicleFormDialog";

const STATUS_VARIANT: Record<VehicleStatus, "default" | "secondary" | "destructive" | "outline"> = {
  disponivel: "default",
  reservado: "secondary",
  vendido: "outline",
  em_preparacao: "secondary",
};

export default function Estoque() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const orgId = profile?.org_id ?? null;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadVehicles = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicles" as never)
      .select("*")
      .eq("org_id", orgId)
      .order("data_entrada", { ascending: false });
    if (error) {
      toast({ title: "Erro ao carregar estoque", description: error.message, variant: "destructive" });
    } else {
      setVehicles((data as Vehicle[] | null) ?? []);
    }
    setLoading(false);
  }, [orgId, toast]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  // Realtime: vehicles
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`vehicles:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicles", filter: `org_id=eq.${orgId}` },
        () => void loadVehicles()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, loadVehicles]);

  const brands = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.marca));
    return Array.from(set).sort();
  }, [vehicles]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (brandFilter !== "all" && v.marca !== brandFilter) return false;
      if (!term) return true;
      const hay = `${v.marca} ${v.modelo} ${v.versao ?? ""} ${v.placa ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [vehicles, search, statusFilter, brandFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando..." : `${filtered.length} de ${vehicles.length} veículos`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Novo veículo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Marca, modelo, placa..."
            aria-label="Marca, modelo, placa..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {VEHICLE_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Marca" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as marcas</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Car className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {vehicles.length === 0 ? "Nenhum veículo no estoque ainda." : "Nenhum veículo encontrado com esses filtros."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((v) => (
            <Link
              key={v.id}
              to={`/estoque/${v.id}`}
              className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/60 transition-colors"
            >
              <div className="aspect-[4/3] bg-secondary relative overflow-hidden">
                {v.fotos?.[0] ? (
                  <img src={v.fotos[0]} alt={`${v.marca} ${v.modelo}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <Car className="h-12 w-12" />
                  </div>
                )}
                <Badge variant={STATUS_VARIANT[v.status]} className="absolute top-2 right-2">
                  {VEHICLE_STATUS_LABEL[v.status]}
                </Badge>
              </div>
              <div className="p-3 space-y-1">
                <div className="font-semibold text-sm truncate">
                  {v.marca} {v.modelo}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {v.versao ? `${v.versao} · ` : ""}
                  {v.ano_modelo ?? v.ano_fabricacao ?? "—"} · {v.km != null ? `${v.km.toLocaleString("pt-BR")} km` : "—"}
                </div>
                <div className="pt-1 text-sm font-medium text-primary">
                  {formatCurrencyBRL(v.preco_venda)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <VehicleFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        onSaved={() => void loadVehicles()}
      />
    </div>
  );
}
