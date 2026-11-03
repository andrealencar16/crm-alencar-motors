import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Trophy, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import {
  DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { DealWithRelations } from "@/pages/Deals";
import type { Database } from "@/integrations/supabase/types";


type Stage = Database["public"]["Tables"]["pipeline_stages"]["Row"];

function formatCurrency(value: number, currency: string = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

/* ── Deal Card (Pipedrive-style) ─────────────────────────── */

function DealCard({
  deal,
  onClick,
}: {
  deal: DealWithRelations;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  // Build subtitle: company, contact names
  const subtitleParts: string[] = [];
  if (deal.company) subtitleParts.push(deal.company.name);
  if (deal.contact) subtitleParts.push(`${deal.contact.first_name} ${deal.contact.last_name || ""}`.trim());
  const subtitle = subtitleParts.join(", ");

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group"
    >
      <div
        className="cursor-pointer rounded-md border border-border bg-card p-2.5 transition-all hover:shadow-md active:cursor-grabbing"
        onClick={onClick}
      >
        {/* Title */}
        <p className="truncate text-[13px] font-medium leading-snug text-foreground">
          {deal.title}
        </p>

        {/* Subtitle: company, contact */}
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground leading-tight">
            {subtitle}
          </p>
        )}

        {/* Bottom row: value + indicators */}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
            <svg className="h-3 w-3 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            {formatCurrency(Number(deal.value) || 0, deal.currency || "BRL")}
          </span>

          <div className="flex items-center gap-1.5">
            {deal.owner && (
              <Avatar className="h-5 w-5">
                <AvatarImage src={deal.owner.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-[8px]">
                  {deal.owner.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Stage Column (Pipedrive-style) ──────────────────────── */

function StageColumn({
  stage,
  deals,
  onDealClick,
  onAddDeal,
}: {
  stage: Stage;
  deals: DealWithRelations[];
  onDealClick: (d: DealWithRelations) => void;
  onAddDeal: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[220px] sm:w-[240px] shrink-0 flex-col transition-colors ${
        isOver ? "bg-primary/5" : ""
      }`}
    >
      {/* Header — Pipedrive style */}
      <div className="mb-1 px-1">
        <h3 className="text-[13px] font-bold text-foreground leading-tight">{stage.name}</h3>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground font-medium">
            {formatCurrency(total)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            · {deals.length} {deals.length === 1 ? "negócio" : "negócios"}
          </span>
        </div>
      </div>

      {/* Color bar */}
      <div
        className="h-1 w-full rounded-full mb-2"
        style={{ backgroundColor: stage.color || "hsl(var(--primary))" }}
      />

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-240px)] pr-0.5">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onClick={() => onDealClick(deal)}
          />
        ))}

        {/* Add button at bottom */}
        <button
          onClick={() => onAddDeal(stage.id)}
          className="flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
        >
          <Plus className="h-3 w-3" /> Adicionar
        </button>
      </div>
    </div>
  );
}

/* ── Collapsible Won/Lost ────────────────────────────────── */

function CollapsibleStatusColumn({
  title,
  icon: Icon,
  deals,
  color,
  onDealClick,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  deals: DealWithRelations[];
  color: string;
  onDealClick: (d: DealWithRelations) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const total = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);

  if (deals.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <span className="text-sm font-semibold">{title}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatCurrency(total)}</span>
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {!collapsed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 p-2 border-t border-border">
          {deals.map((deal) => (
            <div
              key={deal.id}
              className="cursor-pointer rounded-md border border-border bg-card p-2 hover:shadow-sm transition-shadow"
              onClick={() => onDealClick(deal)}
            >
              <p className="truncate text-[13px] font-medium">{deal.title}</p>
              {deal.company && (
                <p className="truncate text-[11px] text-muted-foreground">{deal.company.name}</p>
              )}
              <p className={`text-xs font-semibold mt-0.5 ${color}`}>
                {formatCurrency(Number(deal.value) || 0, deal.currency || "BRL")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Won/Lost Drop Zones ─────────────────────────────────── */

function WonLostDropZone({
  id,
  label,
  icon: Icon,
  color,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
        isOver ? "border-primary bg-primary/10 scale-105" : "border-border bg-muted/10"
      }`}
    >
      <Icon className={`h-5 w-5 ${color}`} />
      <span className={`mt-1 text-[10px] font-medium ${color}`}>{label}</span>
    </div>
  );
}

/* ── Main Kanban ─────────────────────────────────────────── */

interface DealsKanbanProps {
  deals: DealWithRelations[];
  wonDeals: DealWithRelations[];
  lostDeals: DealWithRelations[];
  stages: Stage[];
  onDragEnd: (dealId: string, newStageId: string) => void;
  onDealClick: (deal: DealWithRelations) => void;
  onAddDeal: (stageId?: string) => void;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
}

export function DealsKanban({
  deals, wonDeals, lostDeals, stages, onDragEnd, onDealClick, onAddDeal, onMarkWon, onMarkLost,
}: DealsKanbanProps) {
  const [activeDeal, setActiveDeal] = useState<DealWithRelations | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 8 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals.find((d) => d.id === event.active.id);
    setActiveDeal(deal || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDeal(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = active.id as string;
    const overId = over.id as string;

    if (overId === "won-drop") {
      onMarkWon(dealId);
    } else if (overId === "lost-drop") {
      onMarkLost(dealId);
    } else if (dealId !== overId) {
      onDragEnd(dealId, overId);
    }
  };

  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-20">
        <div className="text-center">
          <p className="text-muted-foreground">Nenhum pipeline configurado</p>
          <p className="text-sm text-muted-foreground">Vá em Configurações → Pipelines para criar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={deals.filter((d) => d.stage_id === stage.id)}
              onDealClick={onDealClick}
              onAddDeal={onAddDeal}
            />
          ))}

          {/* Won/Lost drop zones */}
          <WonLostDropZone id="won-drop" label="Ganho" icon={Trophy} color="text-success" />
          <WonLostDropZone id="lost-drop" label="Perdido" icon={XCircle} color="text-destructive" />
        </div>

        <DragOverlay>
          {activeDeal && (
            <div className="w-[220px] opacity-90">
              <div className="rounded-md border border-primary bg-card p-2.5 shadow-lg">
                <p className="text-[13px] font-medium">{activeDeal.title}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">
                  {formatCurrency(Number(activeDeal.value) || 0, activeDeal.currency || "BRL")}
                </p>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Collapsible won/lost sections below kanban */}
      {(wonDeals.length > 0 || lostDeals.length > 0) && (
        <div className="space-y-2">
          <CollapsibleStatusColumn title="Ganhos" icon={Trophy} deals={wonDeals} color="text-success" onDealClick={onDealClick} />
          <CollapsibleStatusColumn title="Perdidos" icon={XCircle} deals={lostDeals} color="text-destructive" onDealClick={onDealClick} />
        </div>
      )}
    </div>
  );
}
