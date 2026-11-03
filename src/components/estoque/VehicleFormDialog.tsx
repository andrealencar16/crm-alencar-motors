import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, X, Upload, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Vehicle,
  VehicleStatus,
  Combustivel,
  Transmissao,
  VEHICLE_STATUS_LABEL,
} from "@/types/automotive";

const MAX_PHOTOS = 8;
const COMBUSTIVEIS: Combustivel[] = ["flex", "gasolina", "etanol", "diesel", "eletrico", "hibrido"];
const TRANSMISSOES: Transmissao[] = ["manual", "automatica", "cvt", "automatizada"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  vehicle?: Vehicle | null;
  onSaved: () => void;
}

const empty = {
  marca: "",
  modelo: "",
  versao: "",
  ano_fabricacao: "",
  ano_modelo: "",
  km: "",
  cor: "",
  placa: "",
  combustivel: "" as Combustivel | "",
  transmissao: "" as Transmissao | "",
  preco_venda: "",
  preco_custo: "",
  status: "disponivel" as VehicleStatus,
};

export function VehicleFormDialog({ open, onOpenChange, orgId, vehicle, onSaved }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(empty);
  const [fotos, setFotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (vehicle) {
      setForm({
        marca: vehicle.marca,
        modelo: vehicle.modelo,
        versao: vehicle.versao ?? "",
        ano_fabricacao: vehicle.ano_fabricacao?.toString() ?? "",
        ano_modelo: vehicle.ano_modelo?.toString() ?? "",
        km: vehicle.km?.toString() ?? "",
        cor: vehicle.cor ?? "",
        placa: vehicle.placa ?? "",
        combustivel: vehicle.combustivel ?? "",
        transmissao: vehicle.transmissao ?? "",
        preco_venda: vehicle.preco_venda?.toString() ?? "",
        preco_custo: vehicle.preco_custo?.toString() ?? "",
        status: vehicle.status,
      });
      setFotos(vehicle.fotos ?? []);
    } else {
      setForm(empty);
      setFotos([]);
    }
  }, [vehicle, open]);

  const upd = <K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !orgId) return;
    if (fotos.length + files.length > MAX_PHOTOS) {
      toast({ title: `Máximo ${MAX_PHOTOS} fotos`, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("vehicle-photos")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("vehicle-photos").getPublicUrl(path);
        uploaded.push(pub.publicUrl);
      }
      setFotos((prev) => [...prev, ...uploaded]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro no upload", description: msg, variant: "destructive" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (idx: number) => {
    setFotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!orgId) return;
    if (!form.marca.trim() || !form.modelo.trim()) {
      toast({ title: "Marca e modelo são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      org_id: orgId,
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      versao: form.versao.trim() || null,
      ano_fabricacao: form.ano_fabricacao ? parseInt(form.ano_fabricacao, 10) : null,
      ano_modelo: form.ano_modelo ? parseInt(form.ano_modelo, 10) : null,
      km: form.km ? parseInt(form.km, 10) : null,
      cor: form.cor.trim() || null,
      placa: form.placa.trim() || null,
      combustivel: form.combustivel || null,
      transmissao: form.transmissao || null,
      preco_venda: form.preco_venda ? parseFloat(form.preco_venda) : null,
      preco_custo: form.preco_custo ? parseFloat(form.preco_custo) : null,
      status: form.status,
      fotos,
    };

    const query = vehicle
      ? supabase.from("vehicles" as never).update(payload as never).eq("id", vehicle.id)
      : supabase.from("vehicles" as never).insert(payload as never);

    const { error } = await query;
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar veículo", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: vehicle ? "Veículo atualizado" : "Veículo cadastrado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Editar veículo" : "Novo veículo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Marca *">
              <Input value={form.marca} onChange={(e) => upd("marca", e.target.value)} placeholder="Volkswagen" aria-label="Volkswagen" />
            </Field>
            <Field label="Modelo *">
              <Input value={form.modelo} onChange={(e) => upd("modelo", e.target.value)} placeholder="Polo" aria-label="Polo" />
            </Field>
            <Field label="Versão">
              <Input value={form.versao} onChange={(e) => upd("versao", e.target.value)} placeholder="Comfortline TSI" aria-label="Comfortline TSI" />
            </Field>
            <Field label="Cor">
              <Input value={form.cor} onChange={(e) => upd("cor", e.target.value)} placeholder="Prata" aria-label="Prata" />
            </Field>
            <Field label="Ano fabricação">
              <Input type="number" value={form.ano_fabricacao} onChange={(e) => upd("ano_fabricacao", e.target.value)} placeholder="2022" aria-label="2022" />
            </Field>
            <Field label="Ano modelo">
              <Input type="number" value={form.ano_modelo} onChange={(e) => upd("ano_modelo", e.target.value)} placeholder="2023" aria-label="2023" />
            </Field>
            <Field label="KM">
              <Input type="number" value={form.km} onChange={(e) => upd("km", e.target.value)} placeholder="35000" aria-label="35000" />
            </Field>
            <Field label="Placa">
              <Input
                value={form.placa}
                onChange={(e) => upd("placa", e.target.value.toUpperCase())}
                placeholder="ABC1D23"
                aria-label="ABC1D23"
                maxLength={7}
              />
            </Field>
            <Field label="Combustível">
              <Select value={form.combustivel || undefined} onValueChange={(v) => upd("combustivel", v as Combustivel)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {COMBUSTIVEIS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Transmissão">
              <Select value={form.transmissao || undefined} onValueChange={(v) => upd("transmissao", v as Transmissao)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSMISSOES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Preço de venda">
              <Input type="number" value={form.preco_venda} onChange={(e) => upd("preco_venda", e.target.value)} placeholder="89000" aria-label="89000" />
            </Field>
            <Field label="Preço de custo">
              <Input type="number" value={form.preco_custo} onChange={(e) => upd("preco_custo", e.target.value)} placeholder="78000" aria-label="78000" />
            </Field>
            <Field label="Status *">
              <Select value={form.status} onValueChange={(v) => upd("status", v as VehicleStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {VEHICLE_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div>
            <Label className="mb-2 block">Fotos ({fotos.length}/{MAX_PHOTOS})</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fotos.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white hover:bg-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {fotos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      <span className="text-xs">Subir foto</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files)}
            />
            {fotos.length === 0 && !uploading && (
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <ImageIcon className="h-3 w-3" /> Até 8 fotos · bucket vehicle-photos (público)
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : vehicle ? (
              "Salvar alterações"
            ) : (
              "Cadastrar veículo"
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
