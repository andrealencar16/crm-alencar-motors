import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoginSignupForm } from "@/components/auth/LoginSignupForm";
import "@/components/auth/auth.css";

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate("/dashboard");
  }, [user, navigate]);

  return (
    <div className="auth-shell">
      <LoginSignupForm />
    </div>
  );
}
