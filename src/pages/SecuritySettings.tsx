import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, Activity, Monitor, Clock, Filter, RefreshCw, LogOut, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MIN_PASSWORD_LENGTH = 6;

export default function SecuritySettings() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Segurança</h1>
        <p className="text-sm text-muted-foreground">Audit log, sessões e configurações de segurança</p>
      </div>
      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="sessions">Sessões</TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="mt-4"><AuditLogTab orgId={orgId} /></TabsContent>
        <TabsContent value="sessions" className="mt-4"><SessionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AuditLogTab({ orgId }: { orgId: string | null }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchLogs = async () => {
    if (!orgId) return;
    setLoading(true);
    let query = supabase.from("audit_logs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
    const { data } = await query;
    setLogs(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [orgId, actionFilter, entityFilter]);

  const actionLabels: Record<string, string> = {
    create: "Criou", update: "Atualizou", delete: "Deletou", login: "Login", logout: "Logout",
    export: "Exportou", import: "Importou", invite: "Convidou",
  };

  const actionColors: Record<string, string> = {
    create: "bg-emerald-500/10 text-emerald-400", update: "bg-blue-500/10 text-blue-400",
    delete: "bg-red-500/10 text-red-400", login: "bg-primary/10 text-primary",
    export: "bg-amber-500/10 text-amber-400",
  };

  const filtered = logs.filter((l) => !searchTerm || l.entity_type?.includes(searchTerm) || l.action?.includes(searchTerm));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar..." aria-label="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-48" />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            <SelectItem value="create">Criação</SelectItem>
            <SelectItem value="update">Atualização</SelectItem>
            <SelectItem value="delete">Exclusão</SelectItem>
            <SelectItem value="login">Login</SelectItem>
            <SelectItem value="export">Exportação</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Entidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="contact">Contatos</SelectItem>
            <SelectItem value="deal">Negócios</SelectItem>
            <SelectItem value="company">Empresas</SelectItem>
            <SelectItem value="activity">Atividades</SelectItem>
            <SelectItem value="user">Usuários</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchLogs} aria-label="Recarregar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead className="hidden md:table-cell">IP</TableHead>
              <TableHead className="hidden lg:table-cell">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell></TableRow>
            ) : (
              filtered.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={actionColors[log.action] || ""}>
                      {actionLabels[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-sm">{log.entity_type}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{log.ip_address || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-xs truncate">
                    {log.entity_id?.slice(0, 8) || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SessionsTab() {
  const { toast } = useToast();

  const handleSignOutAll = async () => {
    await supabase.auth.signOut({ scope: "global" });
    toast({ title: "Todas as sessões foram encerradas" });
    window.location.href = "/login";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Monitor className="h-4 w-4" />Sessão atual
          </CardTitle>
          <CardDescription>Gerenciamento de sessões ativas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Este dispositivo</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />Sessão ativa agora
              </p>
            </div>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400">Ativa</Badge>
          </div>

          <Button variant="destructive" size="sm" onClick={handleSignOutAll} className="w-full">
            <LogOut className="mr-2 h-4 w-4" />Sair de todos os dispositivos
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />Política de Senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>• Mínimo de 8 caracteres</li>
            <li>• Recomendado: letras maiúsculas, minúsculas, números e símbolos</li>
            <li>• Senhas comuns são rejeitadas automaticamente</li>
            <li>• Bloqueio após 5 tentativas de login inválidas</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
