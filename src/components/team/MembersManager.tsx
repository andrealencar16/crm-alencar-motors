import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Crown, Shield, MoreHorizontal, UserMinus, Trash2, UserPlus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Member = { id: string; name: string | null; email: string | null; title: string | null; avatar_url: string | null; role?: string };
type Found = { id: string; email: string; name: string | null; confirmed: boolean; last_sign_in_at: string | null };

const ROLE_LABEL: Record<string, string> = { owner: "Proprietário", admin: "Administrador", member: "Membro" };

const ERRORS: Record<string, string> = {
  forbidden: "Você não tem permissão para esta ação.",
  cannot_assign_owner: "Não é possível atribuir o papel de proprietário.",
  only_owner_can_assign_admin: "Somente o proprietário pode promover administradores.",
  only_owner_can_manage_admins: "Somente o proprietário pode gerenciar administradores.",
  owner_role_protected: "O papel do proprietário é protegido.",
  cannot_remove_owner: "O proprietário não pode ser removido.",
  only_owner_can_remove_admin: "Somente o proprietário pode remover administradores.",
  cannot_delete_owner: "A conta do proprietário não pode ser excluída.",
  only_owner_can_delete_admin: "Somente o proprietário pode excluir administradores.",
  already_member: "Este usuário já é membro.",
  cannot_change_own_role: "Você não pode alterar o seu próprio papel.",
  transfer_target_not_member: "Escolha um membro ativo para receber o histórico.",
};
const friendly = (msg?: string) => (msg && Object.entries(ERRORS).find(([k]) => msg.includes(k))?.[1]) || msg || "Erro desconhecido";

async function invokeAdmin(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre novamente.");
  const res = await supabase.functions.invoke("admin-users", {
    body, headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.error) {
    let msg = res.error.message;
    try { const b = await (res.error as any).context?.json(); if (b?.error) msg = b.error; } catch { /* keep */ }
    throw new Error(msg);
  }
  return res.data;
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Nunca acessou");

export function MembersManager({ orgId, members, currentUserId, currentUserRole, onChanged }: {
  orgId: string; members: Member[]; currentUserId?: string; currentUserRole: string; onChanged: () => void;
}) {
  const { toast } = useToast();
  const isOwner = currentUserRole === "owner";
  const isAdmin = isOwner || currentUserRole === "admin";
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<Record<string, { last_sign_in_at: string | null; confirmed: boolean }>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Found | null>(null);
  const [addRole, setAddRole] = useState("member");
  const [busy, setBusy] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deps, setDeps] = useState<Record<string, number> | null>(null);
  const [transferTo, setTransferTo] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");

  const ids = members.map((m) => m.id).join(",");
  useEffect(() => {
    setHidden(new Set());
    if (!isAdmin || !ids) return;
    invokeAdmin({ action: "members-meta" }).then((d) => setMeta(d?.meta ?? {})).catch(() => {});
  }, [ids, isAdmin]);

  const canManage = (m: Member) =>
    isAdmin && m.id !== currentUserId && m.role !== "owner" && (isOwner || m.role === "member");

  const search = async () => {
    setSearching(true); setSelected(null);
    try { setResults((await invokeAdmin({ action: "search", query })).users ?? []); }
    catch (e: any) { toast({ title: "Erro na busca", description: e.message, variant: "destructive" }); }
    finally { setSearching(false); }
  };

  const addMember = async () => {
    if (!selected) return;
    setBusy(true);
    const { error } = await supabase.rpc("add_organization_member", { p_user_id: selected.id, p_role: addRole as any });
    setBusy(false);
    if (error) { toast({ title: "Não foi possível adicionar", description: friendly(error.message), variant: "destructive" }); return; }
    toast({ title: "Usuário adicionado", description: `${selected.email} agora faz parte da Alencar Motors.` });
    setAddOpen(false); setQuery(""); setResults([]); setSelected(null); setAddRole("member");
    onChanged();
  };

  const changeRole = async (m: Member, role: string) => {
    const { error } = await supabase.rpc("update_member_role", { p_user_id: m.id, p_role: role as any });
    if (error) { toast({ title: "Não foi possível alterar", description: friendly(error.message), variant: "destructive" }); return; }
    toast({ title: "Papel atualizado" });
    onChanged();
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    setBusy(true);
    const { error } = await supabase.rpc("remove_organization_member", { p_org_id: orgId, p_user_id: removeTarget.id });
    setBusy(false);
    if (error) { toast({ title: "Não foi possível remover", description: friendly(error.message), variant: "destructive" }); return; }
    setHidden((s) => new Set(s).add(removeTarget.id));
    toast({ title: "Removido da organização", description: "A conta continua existindo e pode ser adicionada novamente." });
    setRemoveTarget(null);
    onChanged();
  };

  const openDelete = async (m: Member) => {
    setDeleteTarget(m); setDeps(null); setConfirmText(""); setTransferTo(currentUserId ?? "");
    const { data } = await supabase.rpc("user_dependency_counts", { p_user_id: m.id });
    setDeps((data as any) ?? {});
  };

  const deletePermanent = async () => {
    if (!deleteTarget || !transferTo) return;
    setBusy(true);
    try {
      await invokeAdmin({ action: "delete-permanent", user_id: deleteTarget.id, transfer_to: transferTo });
      setHidden((s) => new Set(s).add(deleteTarget.id));
      toast({ title: "Conta excluída permanentemente", description: "O histórico comercial foi transferido." });
      setDeleteTarget(null);
      onChanged();
    } catch (e: any) {
      toast({ title: "Falha na exclusão", description: friendly(e.message), variant: "destructive" });
      onChanged();
    } finally { setBusy(false); }
  };

  const visible = members.filter((m) => !hidden.has(m.id));
  const depTotal = deps ? Object.values(deps).reduce((a, b) => a + Number(b || 0), 0) : 0;
  const DEP_LABEL: Record<string, string> = { deals: "negócios", contacts: "contatos", companies: "empresas", activities: "atividades", trade_ins: "avaliações", vehicles: "veículos" };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Membros ({visible.length})</CardTitle>
          {isAdmin && (
            <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />Adicionar usuário
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {visible.map((m) => {
              const role = m.role || "member";
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{m.name?.charAt(0)?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name || "Sem nome"}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}{m.title ? ` · ${m.title}` : ""}</p>
                    {isAdmin && (
                      <p className="text-[11px] text-muted-foreground">
                        Ativo · Último acesso: {fmtDate(meta[m.id]?.last_sign_in_at)}
                      </p>
                    )}
                  </div>
                  {canManage(m) ? (
                    <Select value={role} onValueChange={(v) => changeRole(m, v)}>
                      <SelectTrigger className="h-7 text-[11px] w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {isOwner && <SelectItem value="admin">Administrador</SelectItem>}
                        <SelectItem value="member">Membro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      {role === "owner" && <Crown className="h-3 w-3" />}
                      {role === "admin" && <Shield className="h-3 w-3" />}
                      {ROLE_LABEL[role]}
                    </Badge>
                  )}
                  {canManage(m) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações do membro"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRemoveTarget(m)}><UserMinus className="mr-2 h-4 w-4" />Remover da organização</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => openDelete(m)}><Trash2 className="mr-2 h-4 w-4" />Excluir conta permanentemente</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Add existing user */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar usuário à Alencar Motors</DialogTitle>
            <DialogDescription>Pesquise uma conta já criada (por convite) pelo e-mail.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input placeholder="email@exemplo.com" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
            <Button variant="outline" onClick={search} disabled={searching || query.trim().length < 2}><Search className="h-4 w-4" /></Button>
          </div>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {results.length === 0 && !searching && <p className="text-xs text-muted-foreground">Nenhuma conta disponível encontrada.</p>}
            {results.map((u) => (
              <button key={u.id} type="button" onClick={() => setSelected(u)}
                className={`w-full rounded-md border p-2 text-left text-sm ${selected?.id === u.id ? "border-primary bg-primary/5" : "border-border"}`}>
                <p className="font-medium">{u.name || u.email}</p>
                <p className="text-xs text-muted-foreground">{u.email} · {u.confirmed ? fmtDate(u.last_sign_in_at) : "e-mail não confirmado"}</p>
              </button>
            ))}
          </div>
          {selected && (
            <div className="space-y-1">
              <Label className="text-xs">Papel</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membro</SelectItem>
                  {isOwner && <SelectItem value="admin">Administrador</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={addMember} disabled={!selected || busy}>Confirmar adição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove from org */}
      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover da organização?</DialogTitle>
            <DialogDescription>
              {removeTarget?.email} perderá o acesso ao CRM. A conta de login <strong>não</strong> será excluída e poderá ser adicionada novamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>Cancelar</Button>
            <Button onClick={removeMember} disabled={busy}>Remover</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Excluir conta permanentemente</DialogTitle>
            <DialogDescription>
              Esta ação exclui a conta de autenticação de <strong>{deleteTarget?.email}</strong>, seu perfil e seus vínculos. Não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {deps === null ? <p className="text-muted-foreground">Verificando histórico…</p> : depTotal === 0 ? (
              <p className="text-muted-foreground">Nenhum registro comercial vinculado.</p>
            ) : (
              <p>Registros que serão transferidos: {Object.entries(deps).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${n} ${DEP_LABEL[k] ?? k}`).join(", ")}.</p>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Transferir histórico para</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha um membro" /></SelectTrigger>
                <SelectContent>
                  {members.filter((m) => m.id !== deleteTarget?.id).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Digite EXCLUIR para confirmar</Label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={deletePermanent} disabled={busy || confirmText !== "EXCLUIR" || !transferTo || deps === null}>
              Excluir permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
