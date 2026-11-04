import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { CommandPalette } from "@/components/CommandPalette";
import { AICopilot } from "@/components/crm/AICopilot";
import { SetPasswordGate } from "@/components/auth/SetPasswordGate";
import { NoAccessGate } from "@/components/auth/NoAccessGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

const Spinner = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, loading, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // null = verificando; "error" = falha na verificação (fail-closed); false = conta sem senha
  const [hasPassword, setHasPassword] = useState<boolean | null | "error">(null);
  // null = verificando; false = conta sem vínculo em user_roles com a Alencar Motors
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const { profile } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  const checkPassword = useCallback(async () => {
    if (!user) { setHasPassword(null); return; }
    setHasPassword(null);
    // Garante sessão válida no servidor antes da verificação.
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr || !u.user) { setHasPassword("error"); return; }
    const { data, error } = await supabase.rpc("user_has_password");
    if (error || typeof data !== "boolean") { setHasPassword("error"); return; }
    setHasPassword(data);
  }, [user?.id]);

  useEffect(() => { void checkPassword(); }, [checkPassword]);

  // user_roles é a única fonte de autorização (fail-closed).
  const checkMembership = useCallback(async () => {
    if (!user) { setIsMember(null); return; }
    setIsMember(null);
    const { data, error } = await supabase.from("user_roles").select("id").eq("user_id", user.id).limit(1);
    setIsMember(!error && (data?.length ?? 0) > 0);
    await refreshProfile();
  }, [user?.id]);

  useEffect(() => { void checkMembership(); }, [checkMembership]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const doSignOut = async () => { await signOut(); navigate("/"); };

  if (loading) return <Spinner />;
  if (!user) return null;
  if (hasPassword === null) return <Spinner />;
  if (hasPassword === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-4 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível verificar sua conta. Verifique sua conexão.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={doSignOut}>Sair</Button>
          <Button onClick={() => void checkPassword()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }
  if (hasPassword === false) {
    return (
      <SetPasswordGate
        email={user.email}
        userId={user.id}
        initialName={profile?.name}
        onDone={async () => { await refreshProfile(); await checkPassword(); await checkMembership(); }}
      />
    );
  }
  if (isMember === null) return <Spinner />;
  if (isMember === false) {
    return <NoAccessGate email={user.email} onRetry={checkMembership} onSignOut={doSignOut} />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1 p-3 sm:p-6 pb-20 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>
      {isMobile && <MobileBottomNav />}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <AICopilot />
    </SidebarProvider>
  );
}
