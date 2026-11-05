import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Kanban, List, TrendingUp, Plus, Filter, Settings2, Trash2, GripVertical, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DealsKanban } from "@/components/crm/DealsKanban";
import { PendingRevendaMaisLeads } from "@/components/crm/PendingRevendaMaisLeads";

import { DealsList } from "@/components/crm/DealsList";
import { DealsForecast } from "@/components/crm/DealsForecast";
import { DealsFilters, type DealFilters } from "@/components/crm/DealsFilters";
import type { Database } from "@/integrations/supabase/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];
type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];
type Pipeline = Database["public"]["Tables"]["pipelines"]["Row"];
type Contact = Database["public"]["Tables"]["contacts"]["Row"];
type Company = Database["public"]["Tables"]["companies"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type DealStatus = Database["public"]["Enums"]["deal_status"];

export type DealWithRelations = Deal & {
  contact?: Contact | null;
  company?: Company | null;
  owner?: Profile | null;
};

type ViewMode = "kanban" | "list" | "forecast";

export default function Deals() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [deals, setDeals] = useState<DealWithRelations[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const shouldOpenNew = searchParams.get("action") === "new";
  const [form, setForm] = useState<Partial<Deal>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<DealFilters>({});
  const [presetStageId, setPresetStageId] = useState<string | null>(null);

  // Loss reason modal
  const [lossModalOpen, setLossModalOpen] = useState(false);
  const [lossDealId, setLossDealId] = useState<string | null>(null);
  const [lossReason, setLossReason] = useState("");
  const [lossNote, setLossNote] = useState("");

  // Batch selection
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());

  // Pipeline customization
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingStages, setEditingStages] = useState<{ id?: string; name: string; color: string; win_probability: number; order: number }[]>([]);
  const [savingPipeline, setSavingPipeline] = useState(false);

  const openPipelineEditor = () => {
    const current = stages
      .filter((s) => s.pipeline_id === selectedPipeline)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.id, name: s.name, color: s.color || "#94a3b8", win_probability: Number(s.win_probability) || 0, order: s.order }));
    setEditingStages(current.length > 0 ? current : [{ name: "", color: "#94a3b8", win_probability: 50, order: 0 }]);
    setPipelineDialogOpen(true);
  };

  const addEditStage = () => {
    setEditingStages([...editingStages, { name: "", color: "#94a3b8", win_probability: 50, order: editingStages.length }]);
  };

  const removeEditStage = (idx: number) => {
    setEditingStages(editingStages.filter((_, i) => i !== idx));
  };

  const updateEditStage = (idx: number, field: string, value: any) => {
    setEditingStages(editingStages.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const savePipelineStages = async () => {
    if (!orgId || !selectedPipeline) return;
    setSavingPipeline(true);

    // Delete removed stages
    const existingIds = editingStages.filter((s) => s.id).map((s) => s.id!);
    const currentStageIds = stages.filter((s) => s.pipeline_id === selectedPipeline).map((s) => s.id);
    const toDelete = currentStageIds.filter((id) => !existingIds.includes(id));
    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((id) => supabase.from("pipeline_stages").delete().eq("id", id)));
    }

    // Upsert stages
    for (let i = 0; i < editingStages.length; i++) {
      const s = editingStages[i];
      const payload = { name: s.name, color: s.color, win_probability: s.win_probability, order: i, pipeline_id: selectedPipeline, org_id: orgId };
      if (s.id) {
        await supabase.from("pipeline_stages").update(payload).eq("id", s.id);
      } else {
        await supabase.from("pipeline_stages").insert(payload);
      }
    }

    setSavingPipeline(false);
    setPipelineDialogOpen(false);
    toast({ title: "Pipeline atualizado!" });
    fetchData();
  };

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    const [pRes, sRes, dRes, cRes, coRes, mRes] = await Promise.all([
      supabase.from("pipelines").select("*").eq("org_id", orgId).order("is_default", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("pipeline_stages").select("*").eq("org_id", orgId).order("order"),
      supabase.from("deals").select("*, contact:contacts!deals_contact_id_fkey(*), company:companies!deals_company_id_fkey(*)").eq("org_id", orgId),
      supabase.from("contacts").select("*").eq("org_id", orgId),
      supabase.from("companies").select("*").eq("org_id", orgId),
      supabase.from("profiles").select("*").eq("org_id", orgId),
    ]);
    setPipelines(pRes.data || []);
    setStages(sRes.data || []);
    // Enrich deals with owner profile
    const allMembers = mRes.data || [];
    const enrichedDeals: DealWithRelations[] = (dRes.data || []).map((d: any) => ({
      ...d,
      contact: d.contact || null,
      company: d.company || null,
      owner: allMembers.find((m) => m.id === d.owner_id) || null,
    }));
    setDeals(enrichedDeals);
    setContacts(cRes.data || []);
    setCompanies(coRes.data || []);
    setMembers(allMembers);
    if (pRes.data?.length && !selectedPipeline) {
      const def = pRes.data.find((p) => p.is_default) || pRes.data[0];
      setSelectedPipeline(def.id);
    }
  }, [orgId, selectedPipeline]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription for deals
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel('deals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals', filter: `org_id=eq.${orgId}` },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orgId, fetchData]);

  const pipelineStages = stages.filter((s) => s.pipeline_id === selectedPipeline);

  // Apply filters
  const filteredDeals = deals.filter((d) => {
    if (filters.ownerId && d.owner_id !== filters.ownerId) return false;
    if (filters.minValue && (Number(d.value) || 0) < filters.minValue) return false;
    if (filters.maxValue && (Number(d.value) || 0) > filters.maxValue) return false;
    if (filters.closeDateFrom && d.close_date && d.close_date < filters.closeDateFrom) return false;
    if (filters.closeDateTo && d.close_date && d.close_date > filters.closeDateTo) return false;
    // For kanban, filter to current pipeline stages
    if (viewMode === "kanban") {
      const stageIds = pipelineStages.map((s) => s.id);
      if (d.stage_id && !stageIds.includes(d.stage_id) && d.status === "open") return false;
    }
    return true;
  });

  const handleDragEnd = async (dealId: string, newStageId: string) => {
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage_id: newStageId } : d));
    await supabase.from("deals").update({ stage_id: newStageId }).eq("id", dealId);
  };

  const openNew = (stageId?: string) => {
    setEditing(null);
    setPresetStageId(stageId || null);
    setForm({
      title: "", value: 0, currency: "BRL",
      stage_id: stageId || pipelineStages[0]?.id,
      status: "open", probability: 0,
    });
    setSheetOpen(true);
  };

  useEffect(() => {
    if (shouldOpenNew && pipelineStages.length > 0) {
      openNew();
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [shouldOpenNew, pipelineStages]);

  const openEdit = (deal: Deal) => {
    setEditing(deal);
    setPresetStageId(null);
    setForm(deal);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!orgId || !form.title) return;
    if (editing) {
      const { error } = await supabase.from("deals").update({
        title: form.title, value: Number(form.value) || 0, currency: form.currency,
        stage_id: form.stage_id, probability: Number(form.probability) || 0,
        close_date: form.close_date, contact_id: form.contact_id || null,
        company_id: form.company_id || null, owner_id: form.owner_id || null,
      }).eq("id", editing.id);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    } else {
      const { error } = await supabase.from("deals").insert({
        org_id: orgId, title: form.title!, value: Number(form.value) || 0,
        currency: form.currency || "BRL", stage_id: form.stage_id,
        probability: Number(form.probability) || 0, close_date: form.close_date,
        status: "open", owner_id: form.owner_id || user?.id,
        contact_id: form.contact_id || null, company_id: form.company_id || null,
      });
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    }
    setSheetOpen(false);
    fetchData();
    toast({ title: editing ? "Negócio atualizado" : "Negócio criado" });
  };

  const markAsWon = async (dealId: string) => {
    await supabase.from("deals").update({ status: "won" }).eq("id", dealId);
    fetchData();
    toast({ title: "Negócio marcado como ganho! 🎉" });
  };

  const openLossModal = (dealId: string) => {
    setLossDealId(dealId);
    setLossReason("");
    setLossNote("");
    setLossModalOpen(true);
  };

  const confirmLoss = async () => {
    if (!lossDealId) return;
    const reason = lossNote ? `${lossReason}: ${lossNote}` : lossReason;
    await supabase.from("deals").update({ status: "lost", loss_reason: reason }).eq("id", lossDealId);
    setLossModalOpen(false);
    fetchData();
    toast({ title: "Negócio marcado como perdido" });
  };

  const handleBatchAction = async (action: "won" | "lost" | "delete") => {
    const ids = Array.from(selectedDeals);
    if (action === "delete") {
      await Promise.all(ids.map((id) => supabase.from("deals").delete().eq("id", id)));
      toast({ title: `${ids.length} negócios excluídos` });
    } else if (action === "won") {
      await Promise.all(ids.map((id) => supabase.from("deals").update({ status: "won" }).eq("id", id)));
      toast({ title: `${ids.length} negócios marcados como ganhos` });
    } else {
      await Promise.all(ids.map((id) => supabase.from("deals").update({ status: "lost" }).eq("id", id)));
      toast({ title: `${ids.length} negócios marcados como perdidos` });
    }
    setSelectedDeals(new Set());
    fetchData();
  };

  if (!orgId) {
    return <div className="py-20 text-center text-muted-foreground">Crie uma organização em Configurações primeiro.</div>;
  }

  const openDeals = filteredDeals.filter((d) => d.status === "open");
  const wonDeals = filteredDeals.filter((d) => d.status === "won");
  const lostDeals = filteredDeals.filter((d) => d.status === "lost");

  return (
    <div className="space-y-3">
      {/* Header — Pipedrive-inspired */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">Negócios</h1>

          {/* View mode toggle */}
          <div className="flex rounded-md border border-border bg-muted/50 p-0.5">
            {[
              { mode: "kanban" as const, icon: Kanban, label: "Kanban" },
              { mode: "list" as const, icon: List, label: "Lista" },
              { mode: "forecast" as const, icon: TrendingUp, label: "Previsão" },
            ].map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-label={`Visualização ${label}`}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /><span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <Button onClick={() => openNew()} size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Negócio</span>
          </Button>
          <PendingRevendaMaisLeads onApproved={fetchData} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {filteredDeals.length} {filteredDeals.length === 1 ? "negócio" : "negócios"}
          </span>

          {pipelines.length > 0 && (
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="h-8 w-40 text-xs border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={openPipelineEditor} aria-label="Personalizar pipeline">
            <Settings2 className="h-3.5 w-3.5" />
          </Button>

          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowFilters(!showFilters)} aria-label="Alternar filtros">
            <Filter className="mr-1 h-3 w-3" /><span className="hidden sm:inline">Filtro</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <DealsFilters filters={filters} onFiltersChange={setFilters} members={members} />
      )}

      {viewMode === "kanban" && (
        <DealsKanban
          deals={openDeals}
          wonDeals={wonDeals}
          lostDeals={lostDeals}
          stages={pipelineStages}
          onDragEnd={handleDragEnd}
          onDealClick={(d) => navigate(`/deals/${d.id}`)}
          onAddDeal={openNew}
          onMarkWon={markAsWon}
          onMarkLost={openLossModal}
        />
      )}

      {viewMode === "list" && (
        <DealsList
          deals={filteredDeals}
          stages={stages}
          selectedDeals={selectedDeals}
          onSelectionChange={setSelectedDeals}
          onDealClick={(d) => navigate(`/deals/${d.id}`)}
          onBatchAction={handleBatchAction}
        />
      )}

      {viewMode === "forecast" && (
        <DealsForecast deals={openDeals} stages={pipelineStages} />
      )}

      {/* Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Editar Negócio" : "Novo Negócio"}</SheetTitle>
            <SheetDescription>{editing ? "Atualize os dados do negócio" : "Preencha os dados do novo negócio"}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={form.title || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nome do negócio" aria-label="Nome do negócio" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" value={form.value ?? ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Moeda</Label>
                <Select value={form.currency || "BRL"} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL (R$)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Estágio</Label>
              <Select value={form.stage_id || ""} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contato</Label>
              <Select value={form.contact_id || "none"} onValueChange={(v) => setForm({ ...form, contact_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar empresa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Probabilidade (%)</Label>
                <Input type="number" min={0} max={100} value={form.probability ?? ""} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label>Fechamento</Label>
                <Input type="date" value={form.close_date || ""} onChange={(e) => setForm({ ...form, close_date: e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editing ? "Salvar" : "Criar Negócio"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Loss Reason Modal */}
      <Dialog open={lossModalOpen} onOpenChange={setLossModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Perda</DialogTitle>
            <DialogDescription>Por que este negócio foi perdido?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={lossReason} onValueChange={setLossReason}>
                <SelectTrigger><SelectValue placeholder="Selecionar motivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Preço">Preço muito alto</SelectItem>
                  <SelectItem value="Concorrência">Perdeu para concorrência</SelectItem>
                  <SelectItem value="Timing">Timing inadequado</SelectItem>
                  <SelectItem value="Budget">Sem orçamento</SelectItem>
                  <SelectItem value="Fit">Produto não atende</SelectItem>
                  <SelectItem value="Sem resposta">Sem resposta do cliente</SelectItem>
                  <SelectItem value="Outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea value={lossNote} onChange={(e) => setLossNote(e.target.value)} placeholder="Detalhes adicionais..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLossModalOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmLoss} disabled={!lossReason}>Confirmar Perda</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pipeline Customization Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Personalizar Pipeline</DialogTitle>
            <DialogDescription>Edite os estágios do seu pipeline de vendas</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {editingStages.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => updateEditStage(idx, "color", e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 shrink-0"
                  aria-label={`Cor do estágio ${idx + 1}`}
                />
                <Input
                  value={stage.name}
                  onChange={(e) => updateEditStage(idx, "name", e.target.value)}
                  placeholder={`Estágio ${idx + 1}`}
                  aria-label={`Estágio ${idx + 1}`}
                  className="flex-1"
                />
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number" min={0} max={100}
                    value={stage.win_probability}
                    onChange={(e) => updateEditStage(idx, "win_probability", Number(e.target.value))}
                    className="w-16 text-xs text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                {editingStages.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeEditStage(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addEditStage}>
              <Plus className="mr-1 h-3.5 w-3.5" />Adicionar estágio
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineDialogOpen(false)}>Cancelar</Button>
            <Button onClick={savePipelineStages} disabled={savingPipeline || editingStages.some((s) => !s.name.trim())}>
              {savingPipeline && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
