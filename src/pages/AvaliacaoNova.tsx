import { useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Upload, X, Loader2, Camera, Sparkles, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TradeInCondicao, formatCurrencyBRL } from "@/types/automotive";

const MAX_PHOTOS = 6;
const CONDICAO: TradeInCondicao[] = ["excelente", "bom", "regular", "ruim"];

type Step = 0 | 1 | 2;

export default function AvaliacaoNova() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dealIdFromQuery = params.get("deal_id");
  const orgId = profile?.org_id ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(0);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [km, setKm] = useState("");
  const [cor, setCor] = useState("");
  const [condicao, setCondicao] = useState<TradeInCondicao | "">("");
  const [observacoes, setObservacoes] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{ estimativa_ia: number | null; estimativa_fipe: number | null; justificativa: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  const canStep1 = marca.trim().length > 0 && modelo.trim().length > 0 && ano && condicao;

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
          .from("trade-in-photos")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;
        uploaded.push(path);
      }
      setFotos((p) => [...p, ...uploaded]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro no upload", description: msg, variant: "destructive" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Fluxo unificado: INSERT trade_in (status=aguardando) → invoca edge com trade_in_id
  // → edge faz o UPDATE no DB e retorna { estimativa_ia, estimativa_fipe,
  // estimativa_ia_justificativa }. Em qualquer falha da IA, o trade_in permanece
  // 'aguardando' (pode rodar IA depois manualmente).
  const handleSubmit = async () => {
    if (!orgId) return;
    setSaving(true);
    setAiError(null);
    setAiResult(null);

    const insertPayload = {
      org_id: orgId,
      owner_id: user?.id ?? null,
      deal_id: dealIdFromQuery,
      marca: marca.trim(),
      modelo: modelo.trim(),
      ano: ano ? parseInt(ano, 10) : null,
      km: km ? parseInt(km, 10) : null,
      cor: cor.trim() || null,
      condicao: (condicao || null) as TradeInCondicao | null,
      fotos,
      status: "aguardando",
      estimativa_ia_justificativa: observacoes.trim() || null,
    };

    const { data: created, error: insertErr } = await supabase
      .from("trade_ins" as never)
      .insert(insertPayload as never)
      .select("id")
      .single();

    if (insertErr || !created) {
      setSaving(false);
      toast({
        title: "Erro ao salvar avaliação",
        description: insertErr?.message ?? "Insert falhou",
        variant: "destructive",
      });
      return;
    }

    const newId = (created as { id: string }).id;

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-trade-in", {
        body: { trade_in_id: newId },
      });
      if (error) throw error;
      type AIResp = {
        estimativa_ia?: number | null;
        estimativa_fipe?: number | null;
        estimativa_ia_justificativa?: string | null;
      };
      const r = (data ?? {}) as AIResp;
      setAiResult({
        estimativa_ia: r.estimativa_ia ?? null,
        estimativa_fipe: r.estimativa_fipe ?? null,
        justificativa: r.estimativa_ia_justificativa ?? null,
      });
      toast({ title: "Avaliação IA concluída", description: "Status: avaliado." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const notDeployed = msg.includes("not found") || msg.includes("404");
      setAiError(
        notDeployed
          ? "Edge function evaluate-trade-in ainda não está deployada. Avaliação salva como 'aguardando' — rode a IA depois."
          : `Erro na avaliação IA: ${msg}. Avaliação salva como 'aguardando'.`
      );
      toast({
        title: "Avaliação salva sem IA",
        description: "Status: aguardando. Você pode rodar a IA depois.",
      });
    }
    setAiLoading(false);
    setSaving(false);
  };

  const steps = ["Dados do veículo", "Fotos", "Avaliação IA"];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/avaliacoes")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova avaliação de troca</h1>
        <p className="text-sm text-muted-foreground">
          Passo {step + 1} de 3 · {steps[step]}
          {dealIdFromQuery && <span className="ml-2 text-primary">· vinculada ao deal</span>}
        </p>
      </div>

      <div className="flex gap-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Marca *">
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Honda" aria-label="Honda" />
            </Field>
            <Field label="Modelo *">
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Civic" aria-label="Civic" />
            </Field>
            <Field label="Ano *">
              <Input type="number" value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2018" aria-label="2018" />
            </Field>
            <Field label="KM">
              <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} placeholder="65000" aria-label="65000" />
            </Field>
            <Field label="Cor">
              <Input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Preto" aria-label="Preto" />
            </Field>
            <Field label="Condição geral *">
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
          </div>
          <Field label="Observações">
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Marcas, riscos, manutenções pendentes..."
            />
          </Field>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!canStep1}>
              Próximo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Label>Fotos do veículo ({fotos.length}/{MAX_PHOTOS})</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {fotos.map((path, i) => (
              <div key={path} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-secondary flex items-center justify-center text-muted-foreground text-xs">
                <Camera className="h-5 w-5 mr-1" />
                {path.split("/").pop()?.slice(0, 8)}...
                <button
                  type="button"
                  onClick={() => setFotos((p) => p.filter((_, idx) => idx !== i))}
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
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-xs">Subir foto</span>
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
          <p className="text-xs text-muted-foreground">
            Até 6 fotos · bucket trade-in-photos (privado, signed URL).
          </p>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <Button onClick={() => setStep(2)}>
              Próximo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> Avaliação automática com IA
            </div>
            <p className="text-xs text-muted-foreground">
              Ao salvar, a avaliação é criada no banco como <strong>aguardando</strong> e a IA roda em seguida
              cruzando os dados + fotos + FIPE. Se a IA falhar, a avaliação fica salva mesmo assim e você pode
              rodar a IA depois.
            </p>
            {aiError && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
                {aiError}
              </div>
            )}
            {aiResult && aiResult.estimativa_ia != null && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimativa IA</p>
                    <p className="text-lg font-bold text-primary">{formatCurrencyBRL(aiResult.estimativa_ia)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">FIPE</p>
                    <p className="text-lg font-semibold">{formatCurrencyBRL(aiResult.estimativa_fipe)}</p>
                  </div>
                </div>
                {aiResult.justificativa && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Justificativa</p>
                    <p className="text-xs whitespace-pre-line">{aiResult.justificativa}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={saving || aiLoading}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            {aiResult || aiError ? (
              <Button onClick={() => navigate("/avaliacoes")}>
                <Check className="mr-1 h-4 w-4" /> Concluir
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={saving || aiLoading}>
                {saving || aiLoading ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    {aiLoading ? "Avaliando com IA..." : "Salvando..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1 h-4 w-4" /> Salvar e avaliar com IA
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
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
