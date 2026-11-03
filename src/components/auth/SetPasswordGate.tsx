import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Handshake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MIN_PASSWORD_LENGTH = 6;

interface SetPasswordGateProps {
  onDone: () => void;
}

/**
 * Tela obrigatória de definição de senha para usuários convidados que ainda
 * não possuem senha configurada. Bloqueia o acesso ao CRM até a conclusão.
 */
export function SetPasswordGate({ onDone }: SetPasswordGateProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({
        title: "Senha muito curta",
        description: `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`,
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Senhas não conferem",
        description: "A confirmação deve ser igual à nova senha.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao definir senha", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Senha definida com sucesso!" });
    onDone();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Handshake className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Defina sua senha</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Primeiro acesso</CardTitle>
            <CardDescription>
              Para continuar, crie uma senha de acesso ao CRM. Você usará esta senha nos próximos logins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gate-new-password">Nova senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gate-new-password"
                    type="password"
                    placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gate-confirm-password">Confirmar senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gate-confirm-password"
                    type="password"
                    placeholder="Repita a senha"
                    className="pl-9"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Requisitos: mínimo de {MIN_PASSWORD_LENGTH} caracteres. Recomendado combinar letras, números e símbolos.
              </p>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : "Definir senha e continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
