import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Loader2, UserPlus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { SetupStepProps } from "@/pages/Setup";

export function StepContacts({ orgId, userId, onComplete, setStepData }: SetupStepProps) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [alreadyCreated, setAlreadyCreated] = useState(false);

  // Idempotency: check if contacts already exist for this org
  useEffect(() => {
    if (!orgId) return;
    supabase.from("contacts").select("id").eq("org_id", orgId).limit(1).then(({ data }) => {
      if (data && data.length > 0) setAlreadyCreated(true);
    });
  }, [orgId]);

  const handleCreate = async () => {
    if (!orgId || !firstName.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (alreadyCreated) {
      setStepData({ contactCreated: true });
      onComplete();
      return;
    }
    setSaving(true);
    await supabase.from("contacts").insert({
      first_name: firstName.trim(),
      last_name: lastName.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      org_id: orgId,
      owner_id: userId,
      status: "lead",
    });
    setAlreadyCreated(true);
    setStepData({ contactCreated: true });
    setSaving(false);
    toast({ title: "Contato criado!" });
    onComplete();
  };

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Adicione seu primeiro contato</CardTitle>
        <CardDescription>Crie um contato manualmente ou importe depois em lote</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alreadyCreated && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3">
            <Check className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Contatos já existem nesta organização</span>
          </div>
        )}
        {!alreadyCreated && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="contact-fn">Nome *</Label>
                <Input id="contact-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="João" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-ln">Sobrenome</Label>
                <Input id="contact-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Silva" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Telefone</Label>
              <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 99999-0000" />
            </div>
          </>
        )}
        <Button className="w-full" onClick={handleCreate} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : !alreadyCreated ? <UserPlus className="mr-2 h-4 w-4" /> : null}
          {alreadyCreated ? "Continuar" : "Criar contato e continuar"}
        </Button>
      </CardContent>
    </Card>
  );
}
