import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

interface StepOrganizationProps extends SetupStepProps {
  onOrgCreated?: (orgId: string) => void;
}

export function StepOrganization({ orgId, userId, onComplete, stepData, setStepData, onOrgCreated }: StepOrganizationProps) {
  const { toast } = useToast();
  const [name, setName] = useState(stepData.orgName || "");
  const [slug, setSlug] = useState(stepData.orgSlug || "");
  const [timezone, setTimezone] = useState(stepData.orgTimezone || "America/Sao_Paulo");
  const [currency, setCurrency] = useState(stepData.orgCurrency || "BRL");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (orgId) {
      supabase.from("organizations").select("name, slug, settings").eq("id", orgId).single().then(({ data }) => {
        if (data) {
          setName(data.name || "");
          setSlug(data.slug || "");
          const s = data.settings as any;
          if (s?.timezone) setTimezone(s.timezone);
          if (s?.currency) setCurrency(s.currency);
        }
      });
    }
  }, [orgId]);

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    setSaving(true);

    if (orgId) {
      await supabase.from("organizations").update({
        name: name.trim(),
        slug: slug.trim() || name.trim().toLowerCase().replace(/\s+/g, "-"),
        settings: { timezone, currency },
      } as any).eq("id", orgId);
    } else {
      const sl = slug.trim() || name.trim().toLowerCase().replace(/\s+/g, "-");
      const { data: org } = await supabase.from("organizations").insert({
        name: name.trim(), slug: sl, settings: { timezone, currency },
      }).select("id").single();

      if (org && userId) {
        await supabase.from("profiles").update({ org_id: org.id } as any).eq("id", userId);
        await supabase.from("user_roles").insert({ user_id: userId, org_id: org.id, role: "owner" });
        // Propagate orgId immediately to parent
        onOrgCreated?.(org.id);
      }
    }

    setStepData({ orgName: name, orgSlug: slug, orgTimezone: timezone, orgCurrency: currency });
    setSaving(false);
    toast({ title: "Empresa configurada!" });
    onComplete();
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Configure sua empresa</CardTitle>
        <CardDescription>Informações básicas da sua organização</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Nome da empresa *</Label>
          <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-slug">Slug (URL)</Label>
          <Input id="org-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme-corp" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Fuso horário</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">São Paulo (BRT)</SelectItem>
                <SelectItem value="America/New_York">New York (EST)</SelectItem>
                <SelectItem value="Europe/London">London (GMT)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Moeda padrão</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">BRL (R$)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button className="w-full" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Salvar e continuar
        </Button>
      </CardContent>
    </Card>
  );
}
