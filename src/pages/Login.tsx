import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoginSignupForm } from "@/components/auth/LoginSignupForm";
import "@/components/auth/auth.css";

/** Lê erros de link do Auth (ex.: convite expirado) a partir do hash/query da URL. */
export function readAuthLinkError(hash: string, search: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const q = new URLSearchParams(search);
  const code = params.get("error_code") || q.get("error_code");
  const err = params.get("error") || q.get("error");
  if (!code && !err) return null;
  if (code === "otp_expired") return "Este link de convite expirou ou já foi usado. Peça um novo convite ao administrador.";
  return "Link inválido. Peça um novo convite ao administrador ou use \"Esqueceu a senha?\".";
}

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [linkError] = useState(() => readAuthLinkError(window.location.hash, window.location.search));

  useEffect(() => {
    // Link de recuperação que caiu na página inicial: encaminha para o fluxo próprio.
    if (window.location.hash.includes("type=recovery")) {
      navigate("/reset-password" + window.location.hash, { replace: true });
      return;
    }
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div className="auth-shell">
      {linkError && (
        <div role="alert" className="fixed left-1/2 top-4 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-lg border border-destructive bg-background p-3 text-sm text-destructive">
          {linkError}
        </div>
      )}
      <LoginSignupForm />
    </div>
  );
}
