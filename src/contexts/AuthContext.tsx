import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    // Retry loop: profile is created by a DB trigger on signup, so it may not
    // exist yet on the very first auth event. Retry with backoff to cover the gap.
    // Extended to 5 attempts to cover slow triggers post-remix.
    const delays = [0, 200, 500, 1000, 1500];
    let result: Profile | null = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[AuthContext] profile fetch error", error);
      }
      if (data) {
        result = data as Profile;
        break;
      }
    }

    // Last-resort self-repair: if profile still missing after all retries,
    // attempt a direct insert (RLS allows id = auth.uid()). Trigger may have failed.
    if (!result) {
      console.warn("[AuthContext] profile still null after retries; attempting self-repair", userId);
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id === userId) {
        const fallbackName =
          (userData.user.user_metadata as any)?.full_name ||
          (userData.user.user_metadata as any)?.name ||
          (userData.user.email?.split("@")[0] ?? "");
        const { data: inserted } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            email: userData.user.email,
            name: fallbackName,
            onboarding_completed: false,
            onboarding_step: 1,
          } as any)
          .select("*")
          .maybeSingle();
        if (inserted) result = inserted as Profile;
      }
    }

    setProfile(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    // IMPORTANT: No async/await inside onAuthStateChange to prevent deadlocks
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Fetch profile in a separate non-blocking call
          setTimeout(() => {
            void loadProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = async () => {
    if (!user) return;
    await loadProfile(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
