import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronDown, ChevronUp, X, Rocket, UserCircle, GitBranch, Users, Handshake, UserPlus, Mail, Database } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface OnboardingData {
  profile_configured: boolean;
  pipeline_created: boolean;
  contact_created: boolean;
  deal_created: boolean;
  member_invited: boolean;
  email_connected: boolean;
  demo_loaded: boolean;
  completed: boolean;
  dismissed_at: string | null;
}

const steps = [
  { key: "profile_configured" as const, label: "Configurar perfil", icon: UserCircle, path: "/settings" },
  { key: "pipeline_created" as const, label: "Criar primeiro pipeline", icon: GitBranch, path: "/settings" },
  { key: "contact_created" as const, label: "Criar primeiro contato", icon: Users, path: "/contacts" },
  { key: "deal_created" as const, label: "Criar primeiro negócio", icon: Handshake, path: "/deals" },
  { key: "member_invited" as const, label: "Convidar membro", icon: UserPlus, path: "/settings" },
  { key: "email_connected" as const, label: "Conectar email", icon: Mail, path: "/settings/integrations" },
];

export function OnboardingChecklist() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<OnboardingData | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (!user?.id || !orgId) return;
    const { data: row } = await supabase
      .from("onboarding_progress")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row) {
      // Create initial row
      const { data: created } = await supabase.from("onboarding_progress")
        .insert({ user_id: user.id, org_id: orgId } as any)
        .select()
        .single();
      setData(created as any);
    } else {
      setData(row as any);
    }
    setLoading(false);
  }, [user?.id, orgId]);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  // Auto-check progress by querying actual data
  useEffect(() => {
    if (!orgId || !user?.id || !data) return;
    const check = async () => {
      const updates: Partial<OnboardingData> = {};

      // Check profile
      if (!data.profile_configured) {
        const { data: p } = await supabase.from("profiles").select("name, title").eq("id", user.id).single();
        if (p?.name && p.name !== user.email?.split("@")[0]) updates.profile_configured = true;
      }
      // Check pipeline
      if (!data.pipeline_created) {
        const { count } = await supabase.from("pipelines").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.pipeline_created = true;
      }
      // Check contact
      if (!data.contact_created) {
        const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.contact_created = true;
      }
      // Check deal
      if (!data.deal_created) {
        const { count } = await supabase.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.deal_created = true;
      }
      // Check member invited
      if (!data.member_invited) {
        const { count } = await supabase.from("invitations").select("id", { count: "exact", head: true }).eq("org_id", orgId);
        if ((count ?? 0) > 0) updates.member_invited = true;
      }
      // Check email integration
      if (!data.email_connected) {
        const { count } = await supabase
          .from("integration_configs")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("provider", "resend")
          .eq("is_active", true);
        if ((count ?? 0) > 0) updates.email_connected = true;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("onboarding_progress").update(updates as any).eq("user_id", user.id);
        setData((prev) => prev ? { ...prev, ...updates } : prev);
      }
    };
    check();
  }, [orgId, user?.id, data?.completed]);

  const completedCount = data ? steps.filter((s) => data[s.key]).length : 0;
  const progress = (completedCount / steps.length) * 100;

  const handleDismiss = async () => {
    if (!user?.id) return;
    await supabase.from("onboarding_progress").update({ dismissed_at: new Date().toISOString(), completed: true } as any).eq("user_id", user.id);
    setData((prev) => prev ? { ...prev, dismissed_at: new Date().toISOString(), completed: true } : prev);
  };

  const handleLoadDemo = async () => {
    if (!orgId || !user?.id) return;
    setLoadingDemo(true);

    // Generate demo companies
    const demoCompanies = [
      { name: "TechCorp Brasil", domain: "techcorp.com.br", industry: "Tecnologia", size: "51-200", revenue: 5000000, org_id: orgId },
      { name: "Logística Express", domain: "logistica-express.com", industry: "Logística", size: "201-500", revenue: 15000000, org_id: orgId },
      { name: "Consultoria Prime", domain: "prime-consult.com", industry: "Consultoria", size: "11-50", revenue: 2000000, org_id: orgId },
      { name: "Indústria Nacional", domain: "industria-nacional.com.br", industry: "Manufatura", size: "501-1000", revenue: 50000000, org_id: orgId },
      { name: "Saúde Digital", domain: "saudedigital.com", industry: "Saúde", size: "11-50", revenue: 3000000, org_id: orgId },
      { name: "EduTech Solutions", domain: "edutech.com.br", industry: "Educação", size: "11-50", revenue: 1500000, org_id: orgId },
      { name: "FinBank", domain: "finbank.com.br", industry: "Financeiro", size: "201-500", revenue: 30000000, org_id: orgId },
      { name: "AgriTech Farm", domain: "agritech.com", industry: "Agricultura", size: "51-200", revenue: 8000000, org_id: orgId },
      { name: "Retail Plus", domain: "retailplus.com.br", industry: "Varejo", size: "501-1000", revenue: 25000000, org_id: orgId },
      { name: "Energy Solar", domain: "energysolar.com", industry: "Energia", size: "51-200", revenue: 10000000, org_id: orgId },
    ];
    const { data: companies } = await supabase.from("companies").insert(demoCompanies).select("id");

    // Generate demo contacts
    const firstNames = ["Ana", "Carlos", "Maria", "Pedro", "Julia", "Rafael", "Camila", "Lucas", "Beatriz", "Gabriel", "Fernanda", "Thiago", "Larissa", "Diego", "Amanda", "Bruno", "Patricia", "Marcos", "Isabela", "Felipe", "Leticia", "Andre", "Vanessa", "Ricardo", "Daniela"];
    const lastNames = ["Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Lima", "Ferreira", "Almeida", "Rodrigues", "Martins", "Ribeiro", "Gomes", "Barbosa", "Cardoso"];
    const titles = ["CEO", "CTO", "Diretor Comercial", "Gerente de Vendas", "Head de Marketing", "Product Manager", "Coordenador", "Analista Sênior", "VP de Operações", "CFO"];
    const statuses: ("lead" | "prospect" | "customer" | "churned")[] = ["lead", "prospect", "customer", "churned"];

    const demoContacts = Array.from({ length: 50 }, (_, i) => {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[i % lastNames.length];
      return {
        first_name: fn,
        last_name: ln,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@email.com`,
        phone: `+55119${String(Math.floor(Math.random() * 90000000 + 10000000))}`,
        title: titles[i % titles.length],
        status: statuses[i % statuses.length],
        lead_score: Math.floor(Math.random() * 100),
        org_id: orgId,
        owner_id: user.id,
      };
    });
    const { data: contacts } = await supabase.from("contacts").insert(demoContacts).select("id");

    // Create pipeline + stages
    const { data: pipeline } = await supabase.from("pipelines").insert({ name: "Pipeline Demo", org_id: orgId, is_default: true, currency: "BRL" }).select("id").single();
    if (pipeline) {
      const stageNames = ["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechamento"];
      const stageColors = ["#6366f1", "#8b5cf6", "#f59e0b", "#ef4444", "#22c55e"];
      const stageProbs = [10, 30, 50, 75, 90];
      const { data: stagesData } = await supabase.from("pipeline_stages").insert(
        stageNames.map((name, i) => ({
          name, pipeline_id: pipeline.id, org_id: orgId, order: i,
          color: stageColors[i], win_probability: stageProbs[i],
        }))
      ).select("id");

      // Create demo deals
      if (stagesData && contacts) {
        const dealTitles = ["Contrato Enterprise", "Licença SaaS", "Projeto Integração", "Consultoria TI", "Migração Cloud", "Expansão Regional", "Renovação Anual", "Novo Módulo", "Treinamento Corp", "Parceria Estratégica", "Implantação ERP", "Suporte Premium", "API Gateway", "Dashboard BI", "Mobile App", "Automação Marketing", "CRM Customizado", "Data Analytics", "Cyber Security", "Digital Transform"];
        const demoDeals = dealTitles.map((title, i) => ({
          title, org_id: orgId,
          value: Math.floor(Math.random() * 200000 + 5000),
          stage_id: stagesData[i % stagesData.length].id,
          contact_id: contacts[i % contacts.length].id,
          company_id: companies ? companies[i % companies.length].id : null,
          owner_id: user.id,
          status: "open" as const,
          probability: stageProbs[i % stageProbs.length],
          close_date: new Date(Date.now() + Math.random() * 90 * 86400000).toISOString().split("T")[0],
        }));
        await supabase.from("deals").insert(demoDeals);
      }
    }

    // Mark demo loaded
    await supabase.from("onboarding_progress").update({
      demo_loaded: true, pipeline_created: true, contact_created: true, deal_created: true,
    } as any).eq("user_id", user.id);

    setData((prev) => prev ? { ...prev, demo_loaded: true, pipeline_created: true, contact_created: true, deal_created: true } : prev);
    setLoadingDemo(false);
    toast({ title: "Dados de demonstração carregados!", description: "50 contatos, 10 empresas e 20 negócios criados." });
  };

  if (loading || !data || data.completed || data.dismissed_at) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-border bg-background shadow-lg md:bottom-6 md:right-6" role="complementary" aria-label="Onboarding">
      <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Primeiros Passos</span>
          <span className="text-xs text-muted-foreground">{completedCount}/{steps.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="p-1 rounded hover:bg-muted" aria-label="Fechar onboarding">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      <div className="px-3 pb-1">
        <Progress value={progress} className="h-1.5" />
      </div>

      {expanded && (
        <div className="p-3 pt-2 space-y-1">
          {steps.map((step) => {
            const done = data[step.key];
            return (
              <button
                key={step.key}
                onClick={() => !done && navigate(step.path)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors ${done ? "text-muted-foreground" : "hover:bg-muted text-foreground"}`}
                disabled={done}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? "border-primary bg-primary" : "border-border"}`}>
                  {done && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <step.icon className="h-3.5 w-3.5" />
                <span className={done ? "line-through" : ""}>{step.label}</span>
              </button>
            );
          })}

          {!data.demo_loaded && (
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleLoadDemo} disabled={loadingDemo}>
              <Database className="mr-2 h-3.5 w-3.5" />
              {loadingDemo ? "Carregando..." : "Carregar dados de demonstração"}
            </Button>
          )}

          {completedCount === steps.length && (
            <Button size="sm" className="w-full mt-2" onClick={handleDismiss}>
              <Check className="mr-2 h-4 w-4" />Setup completo!
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
