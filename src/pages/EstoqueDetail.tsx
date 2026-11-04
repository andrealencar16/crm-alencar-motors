import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, CheckCircle2, ExternalLink, Loader2, X, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Vehicle,
  VEHICLE_STATUS_LABEL,
  formatCurrencyBRL,
} from "@/types/automotive";
import { VehicleFormDialog } from "@/components/estoque/VehicleFormDialog";
import { LinkDealDialog } from "@/components/estoque/LinkDealDialog";

interface DealRow {
  id: string;
  title: string;
  value: number | null;
  stage_id: string | null;
}

export default function EstoqueDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const orgId = profile?.org_id ?? null;

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!id || !orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicles" as never)
      .select("*")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      toast({ title: "Erro ao carregar veículo", description: error.message, variant: "destructive" });
    } else {
      setVehicle(data as Vehicle | null);
    }

    const { data: dealRows } = await supabase
      .from("deals")
      .select("id, title, value, stage_id")
      .eq("vehicle_id" as never, id as never)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setDeals((dealRows as DealRow[] | null) ?? []);

    setLoading(false);
  }, [id, orgId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMarkSold = useCallback(async () => {
    if (!vehicle || !orgId) return;
    setMarking(true);
    try {
      const { error: vErr } = await supabase
        .from("vehicles" as never)
        .update({ status: "vendido" } as never)
        .eq("id", vehicle.id);
      if (vErr) throw vErr;

      const activeDeal = deals[0];
      if (activeDeal && vehicle.preco_venda) {
        const { error: phErr } = await supabase.from("purchase_history" as never).insert({
          org_id: orgId,
          vehicle_id: vehicle.id,
          deal_id: activeDeal.id,
          data_compra: new Date().toISOString().slice(0, 10),
          valor: activeDeal.value ?? vehicle.preco_venda,
        } as never);
        if (phErr) throw phErr;
      }
      toast({ title: "Veículo marcado como vendido" });
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
    setMarking(false);
  }, [vehicle, orgId, deals, toast, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-6 text-center">
        <Car className="mx-auto h-12 w-12 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Veículo não encontrado.</p>
        <Button asChild variant="link">
          <Link to="/estoque">Voltar ao estoque</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/estoque")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {vehicle.fotos.length > 0 ? (
            <>
              <div
                className="aspect-[16/10] rounded-xl overflow-hidden border border-border bg-secondary cursor-zoom-in"
                onClick={() => setLightboxIdx(0)}
              >
                <img src={vehicle.fotos[0]} alt={`${vehicle.marca} ${vehicle.modelo}`} className="h-full w-full object-cover" />
              </div>
              {vehicle.fotos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {vehicle.fotos.slice(1).map((url, i) => (
                    <button
                      key={url}
                      onClick={() => setLightboxIdx(i + 1)}
                      className="aspect-square rounded-lg overflow-hidden border border-border bg-secondary cursor-zoom-in"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="aspect-[16/10] rounded-xl border border-dashed border-border bg-secondary flex items-center justify-center text-muted-foreground">
              <Car className="h-16 w-16" />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={vehicle.status === "disponivel" ? "default" : "secondary"}>
                {VEHICLE_STATUS_LABEL[vehicle.status]}
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {vehicle.marca} {vehicle.modelo}
            </h1>
            {vehicle.versao && <p className="text-sm text-muted-foreground">{vehicle.versao}</p>}
            <p className="mt-2 text-2xl font-bold text-primary">{formatCurrencyBRL(vehicle.preco_venda)}</p>
          </div>

          <Block title="Identificação">
            <Info label="Placa" value={vehicle.placa ?? "—"} />
            <Info label="Chassi" value={vehicle.chassi ?? "—"} />
            <Info label="Renavam" value={vehicle.renavam ?? "—"} />
          </Block>
          <Block title="Características técnicas">
            <Info label="Ano" value={`${vehicle.ano_fabricacao ?? "—"}/${vehicle.ano_modelo ?? "—"}`} />
            <Info label="KM" value={vehicle.km != null ? `${vehicle.km.toLocaleString("pt-BR")}` : "—"} />
            <Info label="Cor" value={vehicle.cor ?? "—"} />
            <Info label="Combustível" value={vehicle.combustivel ?? "—"} />
            <Info label="Transmissão" value={vehicle.transmissao ?? "—"} />
          </Block>
          <Block title="Informações comerciais">
            <Info label="FIPE" value={formatCurrencyBRL(vehicle.fipe_price)} />
            <Info label="Aceita troca" value={vehicle.accepts_trade ? "Sim" : "Não"} />
            <Info label="Financiamento" value={vehicle.accepts_financing ? "Sim" : "Não"} />
          </Block>

          <div className="space-y-2">
            <Button onClick={() => setEditOpen(true)} variant="outline" size="sm" className="w-full">
              <Pencil className="mr-1 h-4 w-4" /> Editar veículo
            </Button>
            <Button onClick={() => setLinkOpen(true)} variant="outline" size="sm" className="w-full">
              <ExternalLink className="mr-1 h-4 w-4" /> Vincular a deal
            </Button>
            {vehicle.status !== "vendido" && (
              <Button onClick={handleMarkSold} disabled={marking} size="sm" className="w-full">
                {marking ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                )}
                Marcar vendido
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-4 rounded-xl border border-border p-4">
          <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Descrição e opcionais</h2>
          {vehicle.descricao ? (
            <p className="text-sm whitespace-pre-line">{vehicle.descricao}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem descrição comercial.</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(vehicle.opcionais ?? []).map((o) => <Badge key={o} variant="secondary">{o}</Badge>)}
            {(vehicle.opcionais ?? []).length === 0 && <p className="text-xs text-muted-foreground">Nenhum opcional informado.</p>}
          </div>
        </section>
        <section className="space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <h2 className="flex items-center gap-1.5 font-semibold text-sm uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Informações internas
          </h2>
          <Info label="Preço de custo" value={formatCurrencyBRL(vehicle.preco_custo)} />
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Observações</dt>
            <dd className="text-sm whitespace-pre-line">{vehicle.commercial_notes || "—"}</dd>
          </div>
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
          Histórico de interesse ({deals.length})
        </h2>
        {deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum deal vinculou esse veículo ainda.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {deals.map((d) => (
              <Link
                key={d.id}
                to={`/deals/${d.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors text-sm"
              >
                <span className="truncate">{d.title}</span>
                <span className="text-muted-foreground">{formatCurrencyBRL(d.value)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        orgId={orgId}
        vehicle={vehicle}
        onSaved={() => void load()}
      />
      <LinkDealDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        vehicleId={vehicle.id}
        orgId={orgId}
        onLinked={() => void load()}
      />

      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightboxIdx(null)}
        >
          <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
          <img src={vehicle.fotos[lightboxIdx]} alt="" className="max-h-full max-w-full object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
