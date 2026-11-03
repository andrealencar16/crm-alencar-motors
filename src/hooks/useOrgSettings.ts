import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface OrgSettings {
  segment?: string;
  vende_pj?: boolean;
  tem_oficina?: boolean;
  cnpj?: string;
  marcas_trabalhadas?: string[];
  volume_mensal_estimado?: number;
  [key: string]: unknown;
}

interface UseOrgSettingsResult {
  settings: OrgSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

// Hook reativo pra ler organizations.settings. Faz subscribe via realtime
// pra atualizar a UI quando outra aba (ou o próprio user em Settings/Onboarding)
// mudar as configurações.
export function useOrgSettings(): UseOrgSettingsResult {
  const { profile } = useAuth();
  const orgId = profile?.org_id ?? null;
  const [settings, setSettings] = useState<OrgSettings>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setSettings({});
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    setSettings((data?.settings as OrgSettings | null) ?? {});
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org_settings:${orgId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "organizations", filter: `id=eq.${orgId}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, refresh]);

  return { settings, loading, refresh };
}
