import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { PendingRevendaMaisLeads as PendingPage } from "@/integrations/revendamais-review-contract";
import { approvePendingReview, getPendingReview, ReviewUnavailable, reviewConflictMessage, type ReviewTransport } from "@/integrations/revendamais-review-client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

const transport = supabase as unknown as ReviewTransport;
const enabled = import.meta.env.VITE_REVENDAMAIS_REVIEW_ENABLED === "true";
// Fase 1: somente visualização. A RPC approve_revendamais_lead permanece sem EXECUTE no
// banco; o botão de aprovação só é habilitado por liberação explícita desta flag.
const approvalEnabled = import.meta.env.VITE_REVENDAMAIS_APPROVAL_ENABLED === "true";
const unavailable = "A integração de leads ainda não está disponível neste ambiente.";

export function PendingRevendaMaisLeads({ onApproved }: { onApproved: () => Promise<void> }) {
  const { user, loading } = useAuth();
  // Remount on account changes: no commercial data survives a different session.
  return <PendingReviewDrawer key={user?.id ?? "signed-out"} active={enabled && !!user && !loading} onApproved={onApproved} />;
}

function PendingReviewDrawer({ active, onApproved }: { active: boolean; onApproved: () => Promise<void> }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PendingPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const selected = page?.items.find(item => item.receipt_id === selectedId);

  const load = useCallback(async (nextOffset = 0) => {
    if (!active) return;
    const request = ++sequence.current;
    setLoading(true); setError(null); setSelectedId(null); setConfirm(false);
    try {
      const result = await getPendingReview(transport, nextOffset);
      if (!mounted.current || request !== sequence.current) return;
      setPage(result); setOffset(nextOffset); setMissing(false);
    } catch (cause) {
      if (!mounted.current || request !== sequence.current) return;
      setPage(null);
      setMissing(cause instanceof ReviewUnavailable);
      setError(cause instanceof ReviewUnavailable ? unavailable : "Não foi possível carregar os leads. Tente novamente.");
    } finally {
      if (mounted.current && request === sequence.current) setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    mounted.current = true;
    if (active) void load();
    else { ++sequence.current; setPage(null); setSelectedId(null); setConfirm(false); setLoading(false); }
    return () => { mounted.current = false; ++sequence.current; };
  }, [active, load]);

  const approve = async () => {
    if (!active || missing || busy.current || !confirm || !selected || selected.approval_blocker || loading) return;
    const receiptId = selected.receipt_id;
    busy.current = true; setSaving(true); setError(null);
    try {
      const result = await approvePendingReview(transport, receiptId);
      if (!mounted.current) return;
      setConfirm(false);
      if (result.status === "conflict") {
        // Keep the item visible; never remove a conflict optimistically.
        setError(reviewConflictMessage[result.code]);
        return;
      }
      setSelectedId(null);
      toast({ title: result.status === "approved" ? "Negócio criado" : "Lead já processado",
        description: result.status === "approved" ? "O negócio foi criado em Venda PF, na etapa Lead, sob sua responsabilidade." : "Nenhum novo negócio foi criado nesta aprovação." });
      // Refresh both views only after the server confirms the transactional result.
      await load(0);
      if (!mounted.current) return;
      try { await onApproved(); } catch { if (mounted.current) setError("A aprovação foi confirmada. Atualize a página para recarregar os negócios."); }
    } catch (cause) {
      if (!mounted.current) return;
      setConfirm(false);
      if (cause instanceof ReviewUnavailable) setMissing(true);
      // A network failure may follow a commit: do not claim the operation rolled back.
      setError(cause instanceof ReviewUnavailable ? unavailable : "Não foi possível confirmar o resultado. Atualize as pendências antes de tentar novamente.");
      setSelectedId(null);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <Sheet open={open} onOpenChange={value => {
    if (busy.current) return;
    setOpen(value); setSelectedId(null); setConfirm(false);
    if (value && active) void load(0);
  }}>
    <SheetTrigger asChild>
      <Button size="sm" variant="outline" className="gap-1.5" aria-label={`Leads Pendentes${page && !error ? `: ${page.total}` : ""}`}>
        <Inbox className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Leads Pendentes</span>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Carregando pendências" /> : page && !error ? <span className="rounded bg-muted px-1.5 text-xs">{page.total}</span> : null}
      </Button>
    </SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
      <SheetHeader>
        <SheetTitle>Leads Pendentes</SheetTitle>
        <SheetDescription>Revise os dados recebidos antes de criar um negócio.</SheetDescription>
      </SheetHeader>
      <div className="mt-5 space-y-4">
        {!active ? <p role="status" className="text-sm text-muted-foreground">{unavailable}</p> : <>
          <Button size="sm" variant="outline" disabled={loading || saving} onClick={() => void load(offset)}>Atualizar pendências</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading && <p role="status" className="text-sm text-muted-foreground">Carregando leads…</p>}
          {!loading && page?.total === 0 && <p role="status" className="text-sm text-muted-foreground">Nenhum lead pendente de revisão.</p>}
          {!loading && page && page.total > 0 && <>
            <p className="text-sm text-muted-foreground">{page.total} {page.total === 1 ? "pendência" : "pendências"}</p>
            {page.items.length === 0 && <p className="text-sm">Não há itens nesta página. Volte à página anterior.</p>}
            <ul className="space-y-2" aria-label="Leads para revisão">
              {page.items.map(item => <li key={item.receipt_id}>
                <button type="button" disabled={saving} aria-pressed={selectedId === item.receipt_id}
                  onClick={() => { setSelectedId(item.receipt_id); setConfirm(false); setError(null); }}
                  className={`w-full rounded-md border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === item.receipt_id ? "border-primary bg-muted" : "border-border"}`}>
                  <span className="block break-words font-medium">{item.name || "Nome não informado"}</span>
                  <span className="block break-words text-muted-foreground">{item.title || "Interesse não informado"}</span>
                  {item.phone && <span className="block break-all">{item.phone}</span>}
                  {item.email && <span className="block break-all">{item.email}</span>}
                  {(item.portal || item.channel_name) && <span className="block break-words text-muted-foreground">Origem: {[item.portal, item.channel_name].filter(Boolean).join(" · ")}</span>}
                  <span className="block text-xs text-muted-foreground">Recebido em {new Date(item.received_at).toLocaleString("pt-BR")}</span>
                  {item.identity_status === "consistent" && item.attempt_count > 1 && <span className="block text-xs text-muted-foreground">{item.attempt_count} tentativas relacionadas</span>}
                </button>
              </li>)}
            </ul>
            <div className="flex justify-between gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0 || saving} onClick={() => void load(Math.max(0, offset - 50))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={offset + 50 >= page.total || saving} onClick={() => void load(offset + 50)}>Próxima</Button>
            </div>
          </>}
          {!loading && selected && <section className="space-y-3 rounded-md border p-3" aria-label="Revisão do lead selecionado">
            <h3 className="font-medium">Revisar dados comerciais</h3>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-muted-foreground">Cliente</dt><dd className="break-words">{selected.name || "Não informado"}</dd></div>
              <div><dt className="text-muted-foreground">Interesse</dt><dd className="break-words">{selected.title || "Não informado"}</dd></div>
              {selected.phone && <div><dt className="text-muted-foreground">Telefone</dt><dd>{selected.phone}</dd></div>}
              {selected.email && <div><dt className="text-muted-foreground">E-mail</dt><dd className="break-all">{selected.email}</dd></div>}
              {selected.source_created_at && <div><dt className="text-muted-foreground">Data original informada</dt><dd>{selected.source_created_at} (fuso não informado)</dd></div>}
            </dl>
            {selected.approval_blocker && <p role="status" className="text-sm text-destructive">{reviewConflictMessage[selected.approval_blocker]}</p>}
            <Button className="w-full" disabled={saving || missing || !!selected.approval_blocker} onClick={() => setConfirm(true)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aprovar e Criar Negócio
            </Button>
          </section>}
        </>}
      </div>
      <AlertDialog open={confirm && !!selected} onOpenChange={value => { if (!busy.current) setConfirm(value); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar aprovação do lead?</AlertDialogTitle>
            <AlertDialogDescription>O interesse “{selected?.title || "Não informado"}” será convertido em um negócio em Venda PF → Lead, com valor de R$ 0,00 e sob sua responsabilidade. O contato será criado ou reutilizado pelo servidor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saving || !active || missing} onClick={event => { event.preventDefault(); void approve(); }}>
              {saving ? "Aprovando…" : "Confirmar aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  </Sheet>;
}
