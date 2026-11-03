import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  TradeIn,
  TradeInCondicao,
  TradeInStatus,
  TRADE_IN_STATUS_LABEL,
} from "@/types/automotive";

const CONDICAO: TradeInCondicao[] = ["excelente", "bom", "regular", "ruim"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tradeIn: TradeIn | null;
  onSaved: () => void;
}

export function TradeInEditDialog({ open, onOpenChange, tradeIn, onSaved }: Props) {
  const { toast } = useToast();
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [km, setKm] = useState("");
  const [cor, setCor] = useState("");
  const [condicao, setCondicao] = useState<TradeInCondicao | "">("");
  const [valorOfertado, setValorOfertado] = useState("");
  const [status, setStatus] = useState<TradeInStatus>("aguardando");
  const [justificativa, setJustificativa] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tradeIn) return;
    setMarca(tradeIn.marca ?? "");
    setModelo(tradeIn.modelo ?? "");
    setAno(tradeIn.ano?.toString() ?? "");
    setKm(tradeIn.km?.toString() ?? "");
    setCor(tradeIn.cor ?? "");
    setCondicao(tradeIn.condicao ?? "");
    setValorOfertado(tradeIn.valor_final_ofertado?.toString() ?? "");
    setStatus(tradeIn.status);
    setJustificativa(tradeIn.estimativa_ia_justificativa ?? "");
  }, [tradeIn]);

  const handleSave = async () => {
    if (!tradeIn) return;
    setSaving(true);
    const payload = {
      marca: marca.trim() || null,
      modelo: modelo.trim() || null,
      ano: ano ? parseInt(ano, 10) : null,
      km: km ? parseInt(km, 10) : null,
      cor: cor.trim() || null,
      condicao: (condicao || null) as TradeInCondicao | null,
      valor_final_ofertado: valorOfertado ? parseFloat(valorOfertado) : null,
      status,
      estimativa_ia_justificativa: justificativa.trim() || null,
    };
    const { error } = await supabase
      .from("trade_ins" as never)
      .update(payload as never)
      .eq("id", tradeIn.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao atualizar avaliação", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Avaliação atualizada" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar avaliação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Marca">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Honda" aria-label="Honda" />
            </Field>
            <Field label="Modelo">
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Civic" aria-label="Civic" />
            </Field>
            <Field label="Ano">
              <Input type="number" value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2018" aria-label="2018" />
            </Field>
            <Field label="KM">
              <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} placeholder="65000" aria-label="65000" />
            </Field>
            <Field label="Cor">
              <Input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Preto" aria-label="Preto" />
            </Field>
            <Field label="Condição">
              <Select value={condicao || undefined} onValueChange={(v) => setCondicao(v as TradeInCondicao)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {CONDICAO.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Valor ofertado (R$)">
              <Input
                type="number"
                step="0.01"
                value={valorOfertado}
                onChange={(e) => setValorOfertado(e.target.value)}
                placeholder="35000"
                aria-label="35000"
              />
            </Field>
            <Field label="Status">
              <Select value={status} onValueChange={(v) => setStatus(v as TradeInStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRADE_IN_STATUS_LABEL) as TradeInStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {TRADE_IN_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Justificativa / Observações">
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Notas sobre o estado, riscos, manutenções..."
            />
          </Field>

          {tradeIn?.estimativa_ia != null && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1">
              <p className="text-muted-foreground">
                <strong className="text-primary">Estimativa IA:</strong>{" "}
                {tradeIn.estimativa_ia.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              {tradeIn.estimativa_fipe != null && (
                <p className="text-muted-foreground">
                  <strong>FIPE:</strong>{" "}
                  {tradeIn.estimativa_fipe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              "Salvar alterações"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
