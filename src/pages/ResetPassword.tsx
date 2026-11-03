import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Handshake, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MIN_PASSWORD_LENGTH = 6;

type Stage = "checking" | "ready" | "invalid" | "done";

export default function ResetPassword() {
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // O evento PASSWORD_RECOVERY é disparado pelo Supabase Auth quando o
    // link de recuperação (hash com type=recovery) é processado.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setStage("ready");
      }
    });

    const hash = window.location.hash;
    if (!hash.includes("type=recovery")) {
      setStage("invalid");
      return () => subscription.unsubscribe();
    }

    // Fallback: o evento pode ter sido disparado antes da inscrição.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStage((s) => (s === "checking" ? "ready" : s));
    });

    // Se após alguns segundos não houver sessão de recuperação, o link é inválido/expirado.
    const timeout = setTimeout(() => {
      setStage((s) => (s === "checking" ? "invalid" : s));
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
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
    // Sessão de recuperação: não exigir senha atual.
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      toast({ title: "Erro ao redefinir senha", description: error.message, variant: "destructive" });
      return;
    }

    setStage("done");
    toast({ title: "Senha atualizada com sucesso!" });
    setTimeout(() => navigate("/dashboard"), 1200);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Handshake className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Nova senha</h1>
        </div>

        {stage === "checking" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Validando link de recuperação...</p>
            </CardContent>
          </Card>
        )}

        {stage === "invalid" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Link inválido ou expirado
              </CardTitle>
              <CardDescription>
                Este link de recuperação não é mais válido. Solicite um novo link na tela de login,
                em "Esqueceu a senha?".
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate("/")}>
                Voltar para o login
              </Button>
            </CardContent>
          </Card>
        )}

        {stage === "ready" && (
          <Card>
            <CardHeader>
              <CardTitle>Redefinir senha</CardTitle>
              <CardDescription>Digite e confirme sua nova senha</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
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
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Repita a nova senha"
                      className="pl-9"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Salvando..." : "Salvar nova senha"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {stage === "done" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10">
              <p className="text-sm font-medium text-foreground">Senha atualizada com sucesso!</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o CRM...</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
