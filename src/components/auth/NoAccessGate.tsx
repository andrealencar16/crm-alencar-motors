import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Invite = { id: string; org_name: string; role: string };

export function NoAccessGate({ email, onRetry, onSignOut }: { email?: string | null; onRetry: () => void; onSignOut: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("get_my_pending_invitations").then(({ data }) => setInvites((data as Invite[]) ?? []));
  }, []);

  const accept = async (id: string) => {
    setAccepting(id); setError(null);
    const { error } = await supabase.rpc("accept_invitation", { p_invitation_id: id });
    setAccepting(null);
    if (error) { setError("Não foi possível aceitar o convite: " + error.message); return; }
    onRetry();
  };

  const invited = invites.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {invited ? <MailCheck className="mx-auto mb-2 h-10 w-10 text-primary" /> : <ShieldAlert className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />}
          <CardTitle>{invited ? "Você foi convidado" : "Acesso ainda não liberado"}</CardTitle>
          <CardDescription>
            {invited
              ? "Aceite o convite abaixo para entrar no CRM."
              : <>Sua conta {email ? <strong>{email}</strong> : null} está ativa, mas ainda não foi adicionada à equipe da Alencar Motors. Peça a um administrador para liberar seu acesso.</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {invites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="font-medium text-foreground">{inv.org_name}</div>
                <div className="text-xs text-muted-foreground">Papel: {inv.role}</div>
              </div>
              <Button size="sm" onClick={() => accept(inv.id)} disabled={!!accepting}>
                {accepting === inv.id ? "Aceitando..." : "Aceitar convite"}
              </Button>
            </div>
          ))}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onSignOut}>Sair</Button>
            {!invited && <Button className="flex-1" onClick={onRetry}>Verificar novamente</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
