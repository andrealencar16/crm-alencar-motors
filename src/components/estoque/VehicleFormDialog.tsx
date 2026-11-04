import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, X, Upload, Star, ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Vehicle, VehicleStatus, Combustivel, Transmissao, VEHICLE_STATUS_LABEL } from "@/types/automotive";
import {
  MAX_PHOTOS, MAX_DESCRICAO, MAX_NOTES, MAX_OPCIONAIS,
  validatePhotoFile, movePhoto, storagePathFromUrl, normalizeOpcionais,
} from "@/lib/vehiclePhotos";

const COMBUSTIVEIS: Combustivel[] = ["flex", "gasolina", "etanol", "diesel", "eletrico", "hibrido"];
const TRANSMISSOES: Transmissao[] = ["manual", "automatica", "cvt", "automatizada"];
const CURRENT_YEAR = new Date().getFullYear();

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  vehicle?: Vehicle | null;
  onSaved: () => void;
}

const empty = {
  marca: "", modelo: "", versao: "", ano_fabricacao: "", ano_modelo: "", km: "", cor: "",
  placa: "", chassi: "", renavam: "",
  combustivel: "" as Combustivel | "", transmissao: "" as Transmissao | "",
  preco_venda: "", preco_custo: "", status: "disponivel" as VehicleStatus,
  descricao: "", accepts_trade: false, accepts_financing: true, commercial_notes: "",
};
type Form = typeof empty;
type Errors = Partial<Record<keyof Form | "fotos" | "opcionais", string>>;

/** Remove storage files only if no vehicle still references the URL. */
async function deleteUnreferenced(urls: string[]) {
  for (const url of urls) {
    const path = storagePathFromUrl(url);
    if (!path) continue;
    const { count, error } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .contains("fotos", [url]);
    if (error || (count ?? 0) > 0) continue;
    await supabase.storage.from("vehicle-photos").remove([path]);
  }
}

export function VehicleFormDialog({ open, onOpenChange, orgId, vehicle, onSaved }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Form>(empty);
  const [fotos, setFotos] = useState<string[]>([]);
  const [uploadedThisSession, setUploadedThisSession] = useState<string[]>([]);
  const [opcionais, setOpcionais] = useState<string[]>([]);
  const [opcInput, setOpcInput] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (vehicle) {
      setForm({
        marca: vehicle.marca, modelo: vehicle.modelo, versao: vehicle.versao ?? "",
        ano_fabricacao: vehicle.ano_fabricacao?.toString() ?? "", ano_modelo: vehicle.ano_modelo?.toString() ?? "",
        km: vehicle.km?.toString() ?? "", cor: vehicle.cor ?? "", placa: vehicle.placa ?? "",
        chassi: vehicle.chassi ?? "", renavam: vehicle.renavam ?? "",
        combustivel: vehicle.combustivel ?? "", transmissao: vehicle.transmissao ?? "",
        preco_venda: vehicle.preco_venda?.toString() ?? "", preco_custo: vehicle.preco_custo?.toString() ?? "",
        status: vehicle.status, descricao: vehicle.descricao ?? "",
        accepts_trade: vehicle.accepts_trade ?? false, accepts_financing: vehicle.accepts_financing ?? true,
        commercial_notes: vehicle.commercial_notes ?? "",
      });
      setFotos(vehicle.fotos ?? []);
      setOpcionais(vehicle.opcionais ?? []);
    } else {
      setForm(empty);
      setFotos([]);
      setOpcionais([]);
    }
    setUploadedThisSession([]);
    setErrors({});
    setOpcInput("");
  }, [vehicle, open]);

  const upd = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !orgId) return;
    const list = Array.from(files);
    if (fotos.length + list.length > MAX_PHOTOS) {
      toast({ title: `Máximo de ${MAX_PHOTOS} fotos por veículo`, variant: "destructive" });
      return;
    }
    for (const f of list) {
      const err = validatePhotoFile(f);
      if (err) { toast({ title: `${f.name}: ${err}`, variant: "destructive" }); return; }
    }
    setUploading(true);
    const uploaded: string[] = [];
    try {
      for (const file of list) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("vehicle-photos")
          .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) throw error;
        uploaded.push(supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl);
      }
    } catch (err) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
    setFotos((p) => [...p, ...uploaded]);
    setUploadedThisSession((p) => [...p, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addOpcional = () => {
    const next = normalizeOpcionais([...opcionais, ...opcInput.split(",")]);
    if (next.length > MAX_OPCIONAIS) {
      setErrors((e) => ({ ...e, opcionais: `Máximo de ${MAX_OPCIONAIS} itens` }));
      return;
    }
    setOpcionais(next);
    setOpcInput("");
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.marca.trim()) e.marca = "Obrigatório";
    if (!form.modelo.trim()) e.modelo = "Obrigatório";
    const yr = (v: string) => v && (Number(v) < 1900 || Number(v) > CURRENT_YEAR + 1);
    if (yr(form.ano_fabricacao)) e.ano_fabricacao = "Ano inválido";
    if (yr(form.ano_modelo)) e.ano_modelo = "Ano inválido";
    if (form.ano_fabricacao && form.ano_modelo && Number(form.ano_modelo) < Number(form.ano_fabricacao))
      e.ano_modelo = "Não pode ser menor que o de fabricação";
    if (form.km && Number(form.km) < 0) e.km = "Inválido";
    if (form.placa && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(form.placa)) e.placa = "Formato ABC1D23 ou ABC1234";
    if (form.chassi && form.chassi.length !== 17) e.chassi = "Chassi deve ter 17 caracteres";
    if (form.renavam && !/^\d{9,11}$/.test(form.renavam)) e.renavam = "9 a 11 dígitos";
    if (form.preco_venda && Number(form.preco_venda) < 0) e.preco_venda = "Inválido";
    if (form.preco_custo && Number(form.preco_custo) < 0) e.preco_custo = "Inválido";
    if (form.descricao.length > MAX_DESCRICAO) e.descricao = `Máximo ${MAX_DESCRICAO} caracteres`;
    if (form.commercial_notes.length > MAX_NOTES) e.commercial_notes = `Máximo ${MAX_NOTES} caracteres`;
    return e;
  };

  const handleCancel = async () => {
    onOpenChange(false);
    if (uploadedThisSession.length) await deleteUnreferenced(uploadedThisSession);
  };

  const handleSave = async () => {
    if (!orgId) return;
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) {
      toast({ title: "Corrija os campos destacados", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      org_id: orgId,
      marca: form.marca.trim(), modelo: form.modelo.trim(), versao: form.versao.trim() || null,
      ano_fabricacao: form.ano_fabricacao ? parseInt(form.ano_fabricacao, 10) : null,
      ano_modelo: form.ano_modelo ? parseInt(form.ano_modelo, 10) : null,
      km: form.km ? parseInt(form.km, 10) : null,
      cor: form.cor.trim() || null, placa: form.placa.trim() || null,
      chassi: form.chassi.trim().toUpperCase() || null, renavam: form.renavam.trim() || null,
      combustivel: form.combustivel || null, transmissao: form.transmissao || null,
      preco_venda: form.preco_venda ? parseFloat(form.preco_venda) : null,
      preco_custo: form.preco_custo ? parseFloat(form.preco_custo) : null,
      status: form.status, fotos,
      descricao: form.descricao.trim() || null,
      opcionais: normalizeOpcionais(opcionais),
      accepts_trade: form.accepts_trade, accepts_financing: form.accepts_financing,
      commercial_notes: form.commercial_notes.trim() || null,
    };
    const { error } = vehicle
      ? await supabase.from("vehicles").update(payload).eq("id", vehicle.id)
      : await supabase.from("vehicles").insert(payload);
    setSaving(false);
    if (error) {
      const dup = error.code === "23505";
      toast({
        title: dup ? "Já existe um veículo com esta placa ou chassi" : "Erro ao salvar veículo",
        description: dup ? undefined : error.message, variant: "destructive",
      });
      return;
    }
    // Saved: now it's safe to clean up photos no longer referenced.
    const removed = [...(vehicle?.fotos ?? []), ...uploadedThisSession].filter((u) => !fotos.includes(u));
    if (removed.length) void deleteUnreferenced(removed);
    toast({ title: vehicle ? "Veículo atualizado" : "Veículo cadastrado" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : void handleCancel())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Editar veículo" : "Novo veículo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section n={1} title="Identificação do veículo">
            <Field label="Marca *" error={errors.marca}><Input value={form.marca} onChange={(e) => upd("marca", e.target.value)} placeholder="Volkswagen" /></Field>
            <Field label="Modelo *" error={errors.modelo}><Input value={form.modelo} onChange={(e) => upd("modelo", e.target.value)} placeholder="Polo" /></Field>
            <Field label="Versão"><Input value={form.versao} onChange={(e) => upd("versao", e.target.value)} placeholder="Comfortline TSI" /></Field>
            <Field label="Placa" error={errors.placa}><Input value={form.placa} maxLength={7} onChange={(e) => upd("placa", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABC1D23" /></Field>
            <Field label="Chassi" error={errors.chassi}><Input value={form.chassi} maxLength={17} onChange={(e) => upd("chassi", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></Field>
            <Field label="Renavam" error={errors.renavam}><Input value={form.renavam} maxLength={11} inputMode="numeric" onChange={(e) => upd("renavam", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Status *">
              <Select value={form.status} onValueChange={(v) => upd("status", v as VehicleStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(VEHICLE_STATUS_LABEL) as VehicleStatus[]).map((s) => <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section n={2} title="Características técnicas">
            <Field label="Ano fabricação" error={errors.ano_fabricacao}><Input type="number" value={form.ano_fabricacao} onChange={(e) => upd("ano_fabricacao", e.target.value)} placeholder="2022" /></Field>
            <Field label="Ano modelo" error={errors.ano_modelo}><Input type="number" value={form.ano_modelo} onChange={(e) => upd("ano_modelo", e.target.value)} placeholder="2023" /></Field>
            <Field label="KM" error={errors.km}><Input type="number" min={0} value={form.km} onChange={(e) => upd("km", e.target.value)} placeholder="35000" /></Field>
            <Field label="Cor"><Input value={form.cor} onChange={(e) => upd("cor", e.target.value)} placeholder="Prata" /></Field>
            <Field label="Combustível">
              <Select value={form.combustivel || undefined} onValueChange={(v) => upd("combustivel", v as Combustivel)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{COMBUSTIVEIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Transmissão">
              <Select value={form.transmissao || undefined} onValueChange={(v) => upd("transmissao", v as Transmissao)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{TRANSMISSOES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </Section>

          <Section n={3} title="Informações financeiras">
            <Field label="Preço de venda" error={errors.preco_venda}><Input type="number" min={0} value={form.preco_venda} onChange={(e) => upd("preco_venda", e.target.value)} placeholder="89000" /></Field>
            <Field label="Preço de custo (interno)" error={errors.preco_custo}><Input type="number" min={0} value={form.preco_custo} onChange={(e) => upd("preco_custo", e.target.value)} placeholder="78000" /></Field>
          </Section>

          <Section n={4} title="Descrição comercial" full>
            <Field label={`Descrição (${form.descricao.length}/${MAX_DESCRICAO})`} error={errors.descricao}>
              <Textarea rows={5} value={form.descricao} onChange={(e) => upd("descricao", e.target.value)} placeholder="Apresentação do veículo para clientes e anúncios..." />
            </Field>
          </Section>

          <Section n={5} title="Opcionais e equipamentos" full>
            <div className="flex gap-2">
              <Input value={opcInput} onChange={(e) => setOpcInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOpcional(); } }}
                placeholder="Ex.: Ar-condicionado, Airbag (separe por vírgula)" />
              <Button type="button" variant="outline" onClick={addOpcional}><Plus className="h-4 w-4" /></Button>
            </div>
            {errors.opcionais && <p className="text-xs text-destructive">{errors.opcionais}</p>}
            <div className="flex flex-wrap gap-1.5">
              {opcionais.map((o) => (
                <Badge key={o} variant="secondary" className="gap-1">
                  {o}
                  <button type="button" onClick={() => setOpcionais((p) => p.filter((x) => x !== o))} aria-label={`Remover ${o}`}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {opcionais.length === 0 && <p className="text-xs text-muted-foreground">Nenhum opcional informado.</p>}
            </div>
          </Section>

          <Section n={6} title="Condições de negociação">
            <ToggleRow label="Aceita veículo na troca" checked={form.accepts_trade} onChange={(v) => upd("accepts_trade", v)} />
            <ToggleRow label="Aceita financiamento" checked={form.accepts_financing} onChange={(v) => upd("accepts_financing", v)} />
          </Section>

          <Section n={7} title="Observações internas" full icon={<Lock className="h-3.5 w-3.5" />}>
            <Field label="Visível apenas para a equipe — nunca divulgado" error={errors.commercial_notes}>
              <Textarea rows={3} value={form.commercial_notes} onChange={(e) => upd("commercial_notes", e.target.value)} placeholder="Margem mínima, histórico, pendências..." />
            </Field>
          </Section>

          <Section n={8} title={`Fotografias (${fotos.length}/${MAX_PHOTOS})`} full>
            <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP até 10 MB. A primeira foto é a principal.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fotos.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary group">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <Badge className="absolute top-1 left-1 gap-1"><Star className="h-3 w-3" /> Principal</Badge>}
                  <button type="button" onClick={() => setFotos((p) => p.filter((_, j) => j !== i))}
                    className="absolute top-1 right-1 rounded-full bg-background/80 p-1 text-foreground hover:bg-destructive hover:text-destructive-foreground" aria-label="Remover foto">
                    <X className="h-3 w-3" />
                  </button>
                  <div className="absolute bottom-1 inset-x-1 flex justify-between gap-1">
                    <Button type="button" size="icon" variant="secondary" className="h-6 w-6" disabled={i === 0} onClick={() => setFotos((p) => movePhoto(p, i, i - 1))} aria-label="Mover para esquerda"><ChevronLeft className="h-3 w-3" /></Button>
                    {i !== 0 && <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-[10px]" onClick={() => setFotos((p) => movePhoto(p, i, 0))}>Principal</Button>}
                    <Button type="button" size="icon" variant="secondary" className="h-6 w-6" disabled={i === fotos.length - 1} onClick={() => setFotos((p) => movePhoto(p, i, i + 1))} aria-label="Mover para direita"><ChevronRight className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              {fotos.length < MAX_PHOTOS && (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><Upload className="h-5 w-5" /><span className="text-xs">Subir foto</span></>)}
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => void handleCancel()} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>) : vehicle ? "Salvar alterações" : "Cadastrar veículo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ n, title, children, full, icon }: { n: number; title: string; children: React.ReactNode; full?: boolean; icon?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
        <span className="text-primary">{n}.</span> {title} {icon}
      </h3>
      <div className={full ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>{children}</div>
    </section>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
