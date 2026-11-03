import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  Activity,
  BarChart3,
  Settings,
  LogOut,
  CheckSquare,
  AlertTriangle,
  Inbox,
  FileText,
  Zap,
  Target,
  Plug,
  Shield,
  Car,
  Camera,
  Repeat,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSettings } from "@/hooks/useOrgSettings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

import { AtRiskPanel } from "@/components/crm/AtRiskPanel";

const baseGeneralItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Contatos", url: "/contacts", icon: Users },
  { title: "Empresas", url: "/companies", icon: Building2, requiresPJ: true },
  { title: "Negócios", url: "/deals", icon: Handshake },
  { title: "Atividades", url: "/activities", icon: Activity },
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
];

const automotiveItems = [
  { title: "Estoque", url: "/estoque", icon: Car },
  { title: "Avaliações", url: "/avaliacoes", icon: Camera },
  { title: "Recompra", url: "/recompra", icon: Repeat },
];

const emailItems = [
  { title: "Caixa de Entrada", url: "/inbox", icon: Inbox },
  { title: "Templates", url: "/email-templates", icon: FileText },
  { title: "Sequências", url: "/email-sequences", icon: Zap },
];

const analyticsItems = [
  { title: "Metas", url: "/sales-goals", icon: Target },
  { title: "Lead Scoring", url: "/lead-scoring", icon: Target },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Automações", url: "/automations", icon: Zap },
];

const adminItems = [
  { title: "Equipe", url: "/team", icon: Users },
  { title: "Configurações", url: "/settings", icon: Settings },
  { title: "Integrações", url: "/settings/integrations", icon: Plug },
  { title: "Segurança", url: "/settings/security", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { settings: orgSettings } = useOrgSettings();
  const vendePj = orgSettings.vende_pj === true;

  // Filtra "Empresas" se a org não vende pra PJ (default false).
  const generalItems = baseGeneralItems.filter((item) => !item.requiresPJ || vendePj);
  
  const [atRiskOpen, setAtRiskOpen] = useState(false);
  

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const renderNavGroup = (items: typeof generalItems, label?: string) => (
    <SidebarGroup>
      <SidebarGroupContent>
        {label && !collapsed && (
          <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        )}
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-accent/50" activeClassName="bg-accent text-accent-foreground font-medium">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-border">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Car className="h-4 w-4 text-primary-foreground" />
            </div>
            {!collapsed && <span className="text-lg font-semibold tracking-tight">CRM Automotivo</span>}
          </div>
        </SidebarHeader>
        <SidebarContent>
          {/* Geral */}
          <SidebarGroup>
            <SidebarGroupContent>
              {!collapsed && (
                <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Geral
                </p>
              )}
              <SidebarMenu>
                {generalItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-accent/50" activeClassName="bg-accent text-accent-foreground font-medium">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Em Risco" onClick={() => setAtRiskOpen(true)} className="hover:bg-accent/50 cursor-pointer">
                    <AlertTriangle className="h-4 w-4" />{!collapsed && <span>Em Risco</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {renderNavGroup(automotiveItems, "Automotivo")}
          {renderNavGroup(emailItems, "Email")}
          {renderNavGroup(analyticsItems, "Analytics")}
          {renderNavGroup(adminItems, "Admin")}
        </SidebarContent>
        <SidebarFooter className="border-t border-border p-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">{profile?.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">{profile?.name || "Usuário"}</span>
                <span className="truncate text-xs text-muted-foreground">{profile?.email}</span>
              </div>
            )}
            {!collapsed && (
              <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      
      <AtRiskPanel open={atRiskOpen} onOpenChange={setAtRiskOpen} />
    </>
  );
}
