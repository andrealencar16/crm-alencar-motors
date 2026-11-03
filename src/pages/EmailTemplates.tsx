import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, FileText, Edit2, Trash2, MoreHorizontal, Copy, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Template = {
  id: string; org_id: string; name: string; subject: string; body_html: string;
  category: string | null; variables: any; created_by: string | null;
  created_at: string | null; updated_at: string | null;
};

export default function EmailTemplates() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Partial<Template> | null>(null);

  const fetch = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from("email_templates").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
    setTemplates((data as Template[]) || []);
  }, [orgId]);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[];

  const openCreate = () => { setEditTemplate({ name: "", subject: "", body_html: "", category: "" }); setEditOpen(true); };
  const openEdit = (t: Template) => { setEditTemplate(t); setEditOpen(true); };

  const save = async () => {
    if (!orgId || !editTemplate?.name?.trim() || !editTemplate?.subject?.trim()) return;
    if (editTemplate.id) {
      await supabase.from("email_templates").update({
        name: editTemplate.name, subject: editTemplate.subject,
        body_html: editTemplate.body_html, category: editTemplate.category || null,
      } as any).eq("id", editTemplate.id);
    } else {
      await supabase.from("email_templates").insert({
        org_id: orgId, name: editTemplate.name, subject: editTemplate.subject,
        body_html: editTemplate.body_html || "", category: editTemplate.category || null,
        created_by: user?.id,
      } as any);
    }
    setEditOpen(false);
    fetch();
    toast({ title: editTemplate.id ? "Template atualizado" : "Template criado" });
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("email_templates").delete().eq("id", id);
    fetch();
    toast({ title: "Template excluído" });
  };

  const duplicate = async (t: Template) => {
    if (!orgId) return;
    await supabase.from("email_templates").insert({
      org_id: orgId, name: `${t.name} (cópia)`, subject: t.subject,
      body_html: t.body_html, category: t.category, created_by: user?.id,
    } as any);
    fetch();
    toast({ title: "Template duplicado" });
  };

  if (!orgId) return <div className="py-20 text-center text-muted-foreground">Crie uma organização primeiro.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Templates de Email</h1>
          <p className="text-sm text-muted-foreground">{templates.length} templates</p>
        </div>
        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Novo Template</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Buscar templates..." aria-label="Buscar templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} className="group hover:border-primary/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                  {t.category && <Badge variant="outline" className="text-[8px] mt-1">{t.category}</Badge>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-all">
                      <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(t)}><Edit2 className="mr-2 h-3.5 w-3.5" />Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => duplicate(t)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteTemplate(t.id)} className="text-destructive"><Trash2 className="mr-2 h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="mt-2 rounded-md bg-muted/50 p-2 text-[10px] text-muted-foreground line-clamp-3 max-h-16 overflow-hidden">
                {t.body_html?.replace(/<[^>]*>/g, "").slice(0, 150) || "(vazio)"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Editor */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTemplate?.id ? "Editar Template" : "Novo Template"}</DialogTitle>
            <DialogDescription>Use variáveis como {"{{primeiro_nome}}"} no corpo</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input value={editTemplate?.name || ""} onChange={(e) => setEditTemplate((p) => ({ ...p!, name: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Input value={editTemplate?.category || ""} onChange={(e) => setEditTemplate((p) => ({ ...p!, category: e.target.value }))} className="h-8 text-sm" placeholder="Ex: Follow-up" aria-label="Ex: Follow-up" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assunto *</Label>
              <Input value={editTemplate?.subject || ""} onChange={(e) => setEditTemplate((p) => ({ ...p!, subject: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Corpo (HTML)</Label>
              <Textarea value={editTemplate?.body_html || ""} onChange={(e) => setEditTemplate((p) => ({ ...p!, body_html: e.target.value }))} rows={8} className="text-sm font-mono" />
            </div>
            <div className="flex flex-wrap gap-1">
              {["{{primeiro_nome}}", "{{sobrenome}}", "{{empresa}}", "{{email}}", "{{dono_nome}}"].map((v) => (
                <button
                  key={v}
                  onClick={() => setEditTemplate((p) => ({ ...p!, body_html: (p?.body_html || "") + v }))}
                  className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-accent transition-colors"
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button onClick={save} disabled={!editTemplate?.name?.trim() || !editTemplate?.subject?.trim()}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
