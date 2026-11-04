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
  // null = verificando; false = usuário sem senha (ex.: convidado no 1º acesso)
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  // null = verificando; false = conta sem vínculo em user_roles com a Alencar Motors
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) { setHasPassword(null); return; }
    let cancelled = false;
    supabase.rpc("user_has_password").then(({ data, error }) => {
      if (cancelled) return;
      setHasPassword(error ? true : !!data);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

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

  if (loading) return <Spinner />;
  if (!user) return null;
  if (hasPassword === null) return <Spinner />;
  if (hasPassword === false) return <SetPasswordGate onDone={() => setHasPassword(true)} />;
  if (isMember === null) return <Spinner />;
  if (isMember === false) {
    return <NoAccessGate email={user.email} onRetry={checkMembership} onSignOut={async () => { await signOut(); navigate("/"); }} />;
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
