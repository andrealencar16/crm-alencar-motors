import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Check, X, Car, Wrench, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { z } from "zod";
import type { OnboardingStepProps } from "./types";

const BRANDS = [
  "Volkswagen", "Fiat", "Chevrolet", "Toyota", "Honda",
  "Hyundai", "Renault", "Jeep", "Ford", "Nissan", "Outras",
];

const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto"),
  cnpj: z.string().regex(cnpjRegex, "CNPJ inválido (00.000.000/0000-00)"),
  brands: z.array(z.string()).min(1, "Selecione ao menos 1 marca"),
  monthlyVolume: z.number().int().positive("Informe o volume mensal"),
});

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function CompanyStep({ orgId, userId, setCanContinue, setOrgId, setStepData }: OnboardingStepProps) {
  const { toast } = useToast();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [monthlyVolume, setMonthlyVolume] = useState<string>("");
  const [hasWorkshop, setHasWorkshop] = useState(false);
  const [vendePj, setVendePj] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!orgId) return;
    supabase.from("organizations").select("name, settings").eq("id", orgId).maybeSingle().then(({ data }) => {
      if (!data) return;
      setName(data.name);
      const s = (data.settings as Record<string, unknown>) || {};
      if (typeof s.cnpj === "string") setCnpj(s.cnpj);
      if (Array.isArray(s.marcas_trabalhadas)) setBrands(s.marcas_trabalhadas as string[]);
      if (typeof s.volume_mensal_estimado === "number") setMonthlyVolume(String(s.volume_mensal_estimado));
      if (typeof s.tem_oficina === "boolean") setHasWorkshop(s.tem_oficina);
      if (typeof s.vende_pj === "boolean") setVendePj(s.vende_pj);
      if (
        typeof s.cnpj === "string" && s.cnpj.length > 0 &&
        Array.isArray(s.marcas_trabalhadas) && (s.marcas_trabalhadas as unknown[]).length > 0 &&
        typeof s.volume_mensal_estimado === "number" && (s.volume_mensal_estimado as number) > 0
      ) {
        setSaved(true);
        setCanContinue(true);
        setStepData("orgName", data.name);
        setStepData("hasWorkshop", !!s.tem_oficina);
      }
    });
  }, [orgId, setCanContinue, setStepData]);

  useEffect(() => {
    if (!saved) setCanContinue(false);
  }, [saved, setCanContinue]);

  const toggleBrand = (brand: string) => {
    setSaved(false);
    setCanContinue(false);
    setBrands((prev) => (prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]));
  };

  const validate = useCallback((): boolean => {
    const result = schema.safeParse({
      name,
      cnpj,
      brands,
      monthlyVolume: parseInt(monthlyVolume, 10) || 0,
    });
    if (result.success) {
      setErrors({});
      return true;
    }
    const errs: Record<string, string> = {};
    result.error.issues.forEach((issue) => {
      errs[issue.path[0] as string] = issue.message;
    });
    setErrors(errs);
    return false;
  }, [name, cnpj, brands, monthlyVolume]);

  const handleSubmit = useCallback(async () => {
    if (!validate() || loading) return;
    setLoading(true);
    try {
      const volume = parseInt(monthlyVolume, 10);
      let effectiveOrgId = orgId;

      if (!effectiveOrgId) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";
        const { data: newOrgId, error } = await supabase.rpc("create_organization_for_user" as never, {
          p_user_id: userId,
          p_name: name.trim(),
          p_slug: `${slug}-${Date.now().toString(36)}`,
          p_settings: { segment: "automotivo" },
        } as never);
        if (error || !newOrgId) throw error || new Error("Falha ao criar concessionária");
        effectiveOrgId = newOrgId as string;
        setOrgId(effectiveOrgId);
      } else {
        // Update only the name; settings is handled by set_org_automotive_settings (preserva keys da Fase 0).
        const { error: nameErr } = await supabase
          .from("organizations")
          .update({ name: name.trim() } as never)
          .eq("id", effectiveOrgId);
        if (nameErr) throw nameErr;
      }

      const { error: rpcErr } = await supabase.rpc("set_org_automotive_settings" as never, {
        p_org_id: effectiveOrgId,
        p_cnpj: cnpj,
        p_marcas: brands,
        p_volume: volume,
        p_tem_oficina: hasWorkshop,
      } as never);
      if (rpcErr) throw rpcErr;

      // Merge vende_pj direto (a RPC set_org_automotive_settings não conhece esse campo).
      // Lê settings atual e faz merge pra preservar todas as outras keys.
      const { data: current } = await supabase
        .from("organizations")
        .select("settings")
        .eq("id", effectiveOrgId)
        .maybeSingle();
      const mergedSettings = { ...((current?.settings as Record<string, unknown>) ?? {}), vende_pj: vendePj };
      const { error: vendePjErr } = await supabase
        .from("organizations")
        .update({ settings: mergedSettings } as never)
        .eq("id", effectiveOrgId);
      if (vendePjErr) throw vendePjErr;

      await refreshProfile();
      setStepData("orgName", name.trim());
      setStepData("hasWorkshop", hasWorkshop);
      setSaved(true);
      setCanContinue(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao salvar concessionária", description: message, variant: "destructive" });
    }
    setLoading(false);
  }, [validate, name, cnpj, brands, monthlyVolume, hasWorkshop, vendePj, orgId, userId, loading, setOrgId, setStepData, setCanContinue, toast, refreshProfile]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">Conte sobre sua concessionária</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Essas informações personalizam pipelines, estoque e métricas pro seu negócio.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Nome da concessionária *</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
              setCanContinue(false);
            }}
            placeholder="Ex: Auto Center São Paulo"
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="org-cnpj">CNPJ *</Label>
          <Input
            id="org-cnpj"
            value={cnpj}
            onChange={(e) => {
              setCnpj(formatCnpj(e.target.value));
              setSaved(false);
              setCanContinue(false);
            }}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            maxLength={18}
            aria-invalid={!!errors.cnpj}
          />
          {errors.cnpj && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> {errors.cnpj}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Marcas trabalhadas *</Label>
          <div className="flex flex-wrap gap-2">
            {BRANDS.map((brand) => {
              const active = brands.includes(brand);
              return (
                <button
                  key={brand}
                  type="button"
                  onClick={() => toggleBrand(brand)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-foreground hover:border-primary/40"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {brand}
                </button>
              );
            })}
          </div>
          {errors.brands && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> {errors.brands}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthly-volume">Volume médio mensal de vendas (carros/mês) *</Label>
          <Input
            id="monthly-volume"
            type="number"
            min="1"
            value={monthlyVolume}
            onChange={(e) => {
              setMonthlyVolume(e.target.value);
              setSaved(false);
              setCanContinue(false);
            }}
            placeholder="Ex: 25"
            aria-invalid={!!errors.monthlyVolume}
          />
          {errors.monthlyVolume && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <X className="h-3 w-3" /> {errors.monthlyVolume}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <Label htmlFor="has-workshop" className="cursor-pointer text-sm font-medium">
                  Tem oficina própria?
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Ativa o pipeline de Pós-venda e os lembretes de revisão.
                </p>
              </div>
            </div>
            <Switch
              id="has-workshop"
              checked={hasWorkshop}
              onCheckedChange={(checked) => {
                setHasWorkshop(checked);
                setSaved(false);
                setCanContinue(false);
              }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <Label htmlFor="vende-pj" className="cursor-pointer text-sm font-medium">
                  Vende para empresas/frotas?
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Habilita gestão de clientes PJ — frotinhas, locadoras, parceiros corporativos. Pode ativar
                  depois em Configurações.
                </p>
              </div>
            </div>
            <Switch
              id="vende-pj"
              checked={vendePj}
              onCheckedChange={(checked) => {
                setVendePj(checked);
                setSaved(false);
                setCanContinue(false);
              }}
            />
          </div>
        </div>
      </div>

      <button
        onClick={saved ? undefined : handleSubmit}
        disabled={saved || loading}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
          saved
            ? "bg-muted text-muted-foreground cursor-default"
            : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {loading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
        ) : saved ? (
          <><Check className="h-4 w-4" /> Salvo com sucesso</>
        ) : (
          <><Car className="h-4 w-4" /> Salvar e continuar</>
        )}
      </button>
    </div>
  );
}
