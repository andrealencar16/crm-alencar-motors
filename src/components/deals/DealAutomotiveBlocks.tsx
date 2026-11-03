import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Car, Camera, Plus, ExternalLink, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Vehicle,
  TradeIn,
  VEHICLE_STATUS_LABEL,
  TRADE_IN_STATUS_LABEL,
  formatCurrencyBRL,
} from "@/types/automotive";

interface Props {
  dealId: string;
  orgId: string;
  vehicleId: string | null;
  tradeInId: string | null;
  onUpdated: () => void;
}

export function DealAutomotiveBlocks({ dealId, orgId, vehicleId, tradeInId, onUpdated }: Props) {
  const { toast } = useToast();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tradeIn, setTradeIn] = useState<TradeIn | null>(null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Vehicle[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showTradeInPicker, setShowTradeInPicker] = useState(false);
  const [tradeInOptions, setTradeInOptions] = useState<TradeIn[]>([]);

  useEffect(() => {
    if (!vehicleId) {
      setVehicle(null);
      return;
    }
    void supabase
      .from("vehicles" as never)
      .select("*")
      .eq("id", vehicleId)
      .maybeSingle()
      .then(({ data }) => setVehicle(data as Vehicle | null));
  }, [vehicleId]);

  useEffect(() => {
    if (!tradeInId) {
      setTradeIn(null);
      return;
    }
    void supabase
      .from("trade_ins" as never)
      .select("*")
      .eq("id", tradeInId)
      .maybeSingle()
      .then(({ data }) => setTradeIn(data as TradeIn | null));
  }, [tradeInId]);

  // Search disponíveis
  useEffect(() => {
    if (!showSearch) return;
    void supabase
      .from("vehicles" as never)
      .select("*")
      .eq("org_id", orgId)
      .eq("status", "disponivel")
      .ilike("modelo", `%${search}%`)
      .limit(10)
      .then(({ data }) => setOptions((data as Vehicle[] | null) ?? []));
  }, [showSearch, search, orgId]);

  useEffect(() => {
    if (!showTradeInPicker) return;
    void supabase
      .from("trade_ins" as never)
      .select("*")
      .eq("org_id", orgId)
      .is("deal_id", null)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setTradeInOptions((data as TradeIn[] | null) ?? []));
  }, [showTradeInPicker, orgId]);

  const linkVehicle = useCallback(
    async (id: string) => {
      setLinking(true);
      const { error } = await supabase
        .from("deals")
        .update({ vehicle_id: id } as never)
        .eq("id", dealId);
      if (!error) {
        await supabase
          .from("vehicles" as never)
          .update({ deal_id_atual: dealId } as never)
          .eq("id", id);
        toast({ title: "Veículo vinculado" });
        setShowSearch(false);
        setSearch("");
        onUpdated();
      } else {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
      setLinking(false);
    },
    [dealId, toast, onUpdated]
  );

  const unlinkVehicle = useCallback(async () => {
    if (!vehicleId) return;
    setLinking(true);
    await supabase
      .from("deals")
      .update({ vehicle_id: null } as never)
      .eq("id", dealId);
    await supabase
      .from("vehicles" as never)
      .update({ deal_id_atual: null } as never)
      .eq("id", vehicleId);
    toast({ title: "Veículo desvinculado" });
    onUpdated();
    setLinking(false);
  }, [dealId, vehicleId, toast, onUpdated]);

  const linkTradeIn = async (id: string) => {
    setLinking(true);
    const { error: tErr } = await supabase
      .from("trade_ins" as never)
      .update({ deal_id: dealId } as never)
      .eq("id", id);
    if (!tErr) {
      await supabase
        .from("deals")
        .update({ trade_in_id: id } as never)
        .eq("id", dealId);
      toast({ title: "Trade-in vinculado" });
      setShowTradeInPicker(false);
      onUpdated();
    } else {
      toast({ title: "Erro", description: tErr.message, variant: "destructive" });
    }
    setLinking(false);
  };

  return (
    <>
      {/* Veículo de interesse */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Car className="h-4 w-4" /> Veículo de interesse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {vehicle ? (
            <div className="space-y-2">
              <Link to={`/estoque/${vehicle.id}`} className="block group">
                <div className="flex gap-3">
                  <div className="h-14 w-20 rounded-md overflow-hidden bg-secondary shrink-0">
                    {vehicle.fotos[0] ? (
                      <img src={vehicle.fotos[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Car className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium group-hover:text-primary truncate">
                      {vehicle.marca} {vehicle.modelo}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {vehicle.versao ?? ""} {vehicle.ano_modelo ?? vehicle.ano_fabricacao ?? ""}
                    </p>
                    <p className="text-xs font-medium text-primary mt-0.5">
                      {formatCurrencyBRL(vehicle.preco_venda)}
                    </p>
                  </div>
                </div>
              </Link>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                <Badge variant="secondary" className="text-[10px]">
                  {VEHICLE_STATUS_LABEL[vehicle.status]}
                </Badge>
                <button
                  onClick={unlinkVehicle}
                  disabled={linking}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  desvincular
                </button>
              </div>
            </div>
          ) : showSearch ? (
            <div className="space-y-2">
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar veículo disponível..."
                aria-label="Buscar veículo disponível..."
                className="h-8 text-sm"
              />
              <div className="max-h-[200px] overflow-y-auto divide-y divide-border rounded-md border border-border">
                {options.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Nenhum disponível</p>
                ) : (
                  options.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => void linkVehicle(v.id)}
                      disabled={linking}
                      className="w-full px-3 py-2 hover:bg-accent/40 transition-colors text-left text-xs disabled:opacity-50"
                    >
                      <div className="font-medium">
                        {v.marca} {v.modelo}
                      </div>
                      <div className="text-muted-foreground">{formatCurrencyBRL(v.preco_venda)}</div>
                    </button>
                  ))
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowSearch(false)} className="w-full">
                <X className="mr-1 h-3 w-3" /> Cancelar
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowSearch(true)} className="w-full">
              <ExternalLink className="mr-1 h-3 w-3" /> Vincular do estoque
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Trade-in */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Camera className="h-4 w-4" /> Trade-in
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tradeIn ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {tradeIn.marca ?? "—"} {tradeIn.modelo ?? ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {tradeIn.ano ?? "—"} · {tradeIn.km != null ? `${tradeIn.km.toLocaleString("pt-BR")} km` : "—"}
              </p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[10px]">
                  {TRADE_IN_STATUS_LABEL[tradeIn.status]}
                </Badge>
                <span className="text-xs font-medium">
                  {formatCurrencyBRL(tradeIn.valor_final_ofertado ?? tradeIn.estimativa_ia ?? tradeIn.estimativa_fipe)}
                </span>
              </div>
            </div>
          ) : showTradeInPicker ? (
            <div className="space-y-2">
              <div className="max-h-[180px] overflow-y-auto divide-y divide-border rounded-md border border-border">
                {tradeInOptions.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">Nenhum trade-in livre</p>
                ) : (
                  tradeInOptions.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => void linkTradeIn(t.id)}
                      disabled={linking}
                      className="w-full px-3 py-2 hover:bg-accent/40 transition-colors text-left text-xs disabled:opacity-50"
                    >
                      <div className="font-medium">
                        {t.marca ?? "—"} {t.modelo ?? ""}
                      </div>
                      <div className="text-muted-foreground">{TRADE_IN_STATUS_LABEL[t.status]}</div>
                    </button>
                  ))
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setShowTradeInPicker(false)} className="w-full">
                <X className="mr-1 h-3 w-3" /> Cancelar
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setShowTradeInPicker(true)}>
                {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="mr-1 h-3 w-3" />}
                Vincular
              </Button>
              <Button asChild size="sm">
                <Link to={`/avaliacoes/nova?deal_id=${dealId}`}>
                  <Plus className="mr-1 h-3 w-3" /> Nova
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
