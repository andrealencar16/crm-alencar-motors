import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Handshake, Mail, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const MIN_PASSWORD_LENGTH = 6;

/** Validação pura do formulário de primeiro acesso. Retorna mensagem de erro ou null. */
export function validateFirstAccess(name: string, password: string, confirm: string, passwordSaved: boolean): string | null {
  if (name.trim().length < 2) return "Informe seu nome completo.";
  if (passwordSaved) return null;
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password !== confirm) return "A confirmação deve ser igual à nova senha.";
  return null;
}

interface SetPasswordGateProps {
  email?: string | null;
  userId: string;
  initialName?: string | null;
  onDone: () => void;
}

/**
 * Tela obrigatória de primeiro acesso (somente para contas sem senha):
 * nome completo + email (somente leitura) + senha + confirmação.
 * Se a senha for salva mas o perfil falhar, permite reenviar só o nome.
 */
export function SetPasswordGate({ email, userId, initialName, onDone }: SetPasswordGateProps) {
  const emailPrefix = email?.split("@")[0] ?? "";
  const [name, setName] = useState(initialName && initialName !== emailPrefix ? initialName : "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const saveProfile = async (fullName: string) => {
    const { error } = await supabase.from("profiles").update({ name: fullName }).eq("id", userId);
    return error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const invalid = validateFirstAccess(name, password, confirmPassword, passwordSaved);
    if (invalid) { setError(invalid); return; }
    const fullName = name.trim();
    setLoading(true);

    if (!passwordSaved) {
      const { error: authErr } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName, name: fullName },
      });
      if (authErr) {
        setLoading(false);
        setError("Não foi possível salvar a senha: " + authErr.message);
        return;
      }
      setPasswordSaved(true);
      setPassword(""); setConfirmPassword("");
    } else {
      await supabase.auth.updateUser({ data: { full_name: fullName, name: fullName } });
    }

    const profErr = await saveProfile(fullName);
    setLoading(false);
    if (profErr) {
      setError("Sua senha foi salva, mas não conseguimos salvar seu nome. Tente novamente.");
      return;
    }
    toast({ title: "Conta configurada com sucesso!" });
    onDone();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Handshake className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Configure sua conta</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Primeiro acesso</CardTitle>
            <CardDescription>
              Informe seu nome e crie a senha que você usará para entrar no CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="gate-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="gate-email" value={email ?? ""} readOnly disabled className="pl-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="gate-name">Nome completo</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="gate-name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)}
                    required autoComplete="name" placeholder="Seu nome completo" />
                </div>
              </div>
              {!passwordSaved && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="gate-new-password">Nova senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="gate-new-password" type="password" placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                        className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)}
                        required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gate-confirm-password">Confirmar senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input id="gate-confirm-password" type="password" placeholder="Repita a senha" className="pl-9"
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Requisitos: mínimo de {MIN_PASSWORD_LENGTH} caracteres. Recomendado combinar letras, números e símbolos.
                  </p>
                </>
              )}
              {passwordSaved && <p className="text-sm text-muted-foreground">Senha já salva. Falta apenas salvar seu nome.</p>}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Salvando..." : passwordSaved ? "Salvar nome e continuar" : "Salvar e continuar"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
