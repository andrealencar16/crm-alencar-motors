import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, Handshake, CheckSquare, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";

const mainItems = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Contatos", url: "/contacts", icon: Users },
  { title: "Negócios", url: "/deals", icon: Handshake },
  { title: "Tarefas", url: "/activities", icon: CheckSquare },
];

const moreItems = [
  { title: "Empresas", url: "/companies" },
  { title: "Caixa de Entrada", url: "/inbox" },
  { title: "Relatórios", url: "/reports" },
  { title: "Automações", url: "/automations" },
  { title: "Configurações", url: "/settings" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-background/95 backdrop-blur-sm md:hidden" role="navigation" aria-label="Navegação principal mobile">
      {mainItems.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          end={item.url === "/"}
          className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors ${
            isActive(item.url) ? "text-primary" : ""
          }`}
          activeClassName="text-primary"
          aria-label={item.title}
        >
          <item.icon className="h-5 w-5" />
          <span className="text-[9px] font-medium">{item.title}</span>
        </NavLink>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground" aria-label="Mais opções">
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[9px] font-medium">Mais</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="mb-2">
          {moreItems.map((item) => (
            <DropdownMenuItem key={item.url} onClick={() => navigate(item.url)}>
              {item.title}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
