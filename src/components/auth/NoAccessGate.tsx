import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function NoAccessGate({ email, onRetry, onSignOut }: { email?: string | null; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <ShieldAlert className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
          <CardTitle>Acesso ainda não liberado</CardTitle>
          <CardDescription>
            Sua conta {email ? <strong>{email}</strong> : null} está ativa, mas ainda não foi adicionada à equipe da
            Alencar Motors. Peça a um administrador para liberar seu acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onSignOut}>Sair</Button>
          <Button className="flex-1" onClick={onRetry}>Verificar novamente</Button>
        </CardContent>
      </Card>
    </div>
  );
}
