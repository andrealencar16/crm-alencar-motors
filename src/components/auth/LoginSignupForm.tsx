import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, Lock, User, Car } from "lucide-react";

const COPY = {
  productName: "CRM Automotivo",
  tagline: "O CRM que fecha o ciclo do automotivo PME",
  loginTitle: "Entrar",
  signupTitle: "Cadastrar",
  emailPlaceholder: "voce@suaconcessionaria.com.br",
  passwordPlaceholder: "Sua senha",
  namePlaceholder: "Seu nome",
  forgotPassword: "Esqueceu a senha?",
  loginCta: "Entrar",
  signupCta: "Criar conta",
  loadingLogin: "Entrando...",
  loadingSignup: "Criando conta...",
  toggleLoginPanelTitle: "Olá, vendedor!",
  toggleLoginPanelText: "Sem planilha. Do lead à recompra, em um lugar só.",
  toggleLoginPanelCta: "Cadastrar",
  toggleSignupPanelTitle: "Bem-vindo de volta",
  toggleSignupPanelText: "Sua concessionária te aguarda — vamos vender mais.",
  toggleSignupPanelCta: "Entrar",
  errorLogin: "Erro ao entrar",
  errorSignup: "Erro ao criar conta",
  successSignup: "Conta criada com sucesso!",
  signupEmailCheck: "Verifique seu email para confirmar.",
  emailMissing: "Digite seu email para redefinir a senha",
  resetSent: "Email de redefinição enviado!",
};

export function LoginSignupForm() {
  const [isActive, setIsActive] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: COPY.errorLogin, description: error.message, variant: "destructive" });
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: COPY.errorSignup, description: error.message, variant: "destructive" });
    } else if (data.session) {
      toast({ title: COPY.successSignup });
    } else {
      toast({ title: COPY.successSignup, description: COPY.signupEmailCheck });
    }
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: COPY.emailMissing, variant: "destructive" });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: COPY.resetSent });
    }
  };

  return (
    <div className={`auth-container ${isActive ? "active" : ""}`}>
      {/* LOGIN */}
      <div className="form-box login">
        <form onSubmit={handleLogin}>
          <div className="brand">
            <div className="brand-icon">
              <Car className="h-5 w-5" />
            </div>
            <h1>{COPY.loginTitle}</h1>
          </div>
          <div className="input-box">
            <input
              type="email"
              placeholder={COPY.emailPlaceholder}
              aria-label={COPY.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Mail className="input-icon" />
          </div>
          <div className="input-box">
            <input
              type="password"
              placeholder={COPY.passwordPlaceholder}
              aria-label={COPY.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Lock className="input-icon" />
          </div>
          <div className="forgot-link">
            <button type="button" onClick={handleForgotPassword}>
              {COPY.forgotPassword}
            </button>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? COPY.loadingLogin : COPY.loginCta}
          </button>
        </form>
      </div>

      {/* REGISTER */}
      <div className="form-box register">
        <form onSubmit={handleSignUp}>
          <div className="brand">
            <div className="brand-icon">
              <Car className="h-5 w-5" />
            </div>
            <h1>{COPY.signupTitle}</h1>
          </div>
          <div className="input-box">
            <input
              type="text"
              placeholder={COPY.namePlaceholder}
              aria-label={COPY.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
            <User className="input-icon" />
          </div>
          <div className="input-box">
            <input
              type="email"
              placeholder={COPY.emailPlaceholder}
              aria-label={COPY.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Mail className="input-icon" />
          </div>
          <div className="input-box">
            <input
              type="password"
              placeholder={COPY.passwordPlaceholder}
              aria-label={COPY.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
            <Lock className="input-icon" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? COPY.loadingSignup : COPY.signupCta}
          </button>
        </form>
      </div>

      {/* TOGGLE BOX */}
      <div className="toggle-box">
        <div className="toggle-panel toggle-left">
          <h1>{COPY.toggleLoginPanelTitle}</h1>
          <p className="tagline">{COPY.tagline}</p>
          <p>{COPY.toggleLoginPanelText}</p>
          <button type="button" className="btn-ghost" onClick={() => setIsActive(true)}>
            {COPY.toggleLoginPanelCta}
          </button>
        </div>
        <div className="toggle-panel toggle-right">
          <h1>{COPY.toggleSignupPanelTitle}</h1>
          <p className="tagline">{COPY.tagline}</p>
          <p>{COPY.toggleSignupPanelText}</p>
          <button type="button" className="btn-ghost" onClick={() => setIsActive(false)}>
            {COPY.toggleSignupPanelCta}
          </button>
        </div>
      </div>
    </div>
  );
}
