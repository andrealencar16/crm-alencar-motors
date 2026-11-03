import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Shield, CheckCircle2, XCircle, HelpCircle } from "lucide-react";

interface BANTData {
  budget: boolean | null;
  authority: boolean | null;
  need: boolean | null;
  timeline: boolean | null;
  budget_notes: string;
  authority_notes: string;
  need_notes: string;
  timeline_notes: string;
}

const bantCriteria = [
  { key: "budget" as const, label: "Budget", description: "O prospect tem orçamento disponível?", icon: "💰" },
  { key: "authority" as const, label: "Authority", description: "Estamos falando com o decisor?", icon: "👤" },
  { key: "need" as const, label: "Need", description: "Existe uma necessidade real e urgente?", icon: "🎯" },
  { key: "timeline" as const, label: "Timeline", description: "Há um prazo definido para decisão?", icon: "⏰" },
];

function calcQualScore(data: BANTData): number {
  let score = 0;
  let total = 0;
  bantCriteria.forEach(({ key }) => {
    total += 25;
    if (data[key] === true) score += 25;
    else if (data[key] === null) score += 0;
  });
  return score;
}

function getScoreColor(score: number) {
  if (score >= 75) return "text-success";
  if (score >= 50) return "text-warning";
  if (score >= 25) return "text-primary";
  return "text-muted-foreground";
}

function getProgressColor(score: number) {
  if (score >= 75) return "bg-success";
  if (score >= 50) return "bg-warning";
  if (score >= 25) return "bg-primary";
  return "bg-muted-foreground";
}

interface Props {
  dealId: string;
  qualification: any;
  qualificationScore: number;
  onUpdate: () => void;
}

export function DealQualification({ dealId, qualification, qualificationScore, onUpdate }: Props) {
  const { toast } = useToast();
  const [bant, setBant] = useState<BANTData>({
    budget: null, authority: null, need: null, timeline: null,
    budget_notes: "", authority_notes: "", need_notes: "", timeline_notes: "",
    ...(qualification || {}),
  });
  const [editing, setEditing] = useState(false);

  const score = calcQualScore(bant);

  const save = async () => {
    await supabase.from("deals").update({
      qualification: bant as any,
      qualification_score: score,
    } as any).eq("id", dealId);
    setEditing(false);
    onUpdate();
    toast({ title: "Qualificação atualizada" });
  };

  const toggleCriteria = (key: keyof BANTData) => {
    if (typeof bant[key] === "string") return; // notes field
    const current = bant[key] as boolean | null;
    const next = current === null ? true : current === true ? false : null;
    setBant({ ...bant, [key]: next });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" />Qualificação BANT
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${getScoreColor(score)}`}>{score}%</span>
            {!editing && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setEditing(true)}>Editar</Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${getProgressColor(score)}`} style={{ width: `${score}%` }} />
        </div>

        {/* Criteria */}
        <div className="space-y-2">
          {bantCriteria.map(({ key, label, description, icon }) => {
            const val = bant[key] as boolean | null;
            const notesKey = `${key}_notes` as keyof BANTData;
            return (
              <div key={key} className={`rounded-md border border-border p-2.5 transition-colors ${val === true ? "bg-success/5 border-success/30" : val === false ? "bg-destructive/5 border-destructive/30" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{icon}</span>
                    <div>
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  {editing ? (
                    <button onClick={() => toggleCriteria(key)} className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent">
                      {val === true ? (
                        <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />Sim</span>
                      ) : val === false ? (
                        <span className="flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" />Não</span>
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground"><HelpCircle className="h-3.5 w-3.5" />N/A</span>
                      )}
                    </button>
                  ) : (
                    <span>
                      {val === true ? <CheckCircle2 className="h-4 w-4 text-success" /> : val === false ? <XCircle className="h-4 w-4 text-destructive" /> : <HelpCircle className="h-4 w-4 text-muted-foreground" />}
                    </span>
                  )}
                </div>
                {editing && (
                  <Input
                    className="mt-1.5 h-7 text-[10px]"
                    placeholder="Notas..."
                    aria-label="Notas..."
                    value={(bant[notesKey] as string) || ""}
                    onChange={(e) => setBant({ ...bant, [notesKey]: e.target.value })}
                  />
                )}
                {!editing && bant[notesKey] && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">{bant[notesKey] as string}</p>
                )}
              </div>
            );
          })}
        </div>

        {editing && (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button size="sm" onClick={save}>Salvar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Score badge component for use in tables/cards
export function LeadScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "bg-success/10 text-success border-success/30"
    : score >= 60 ? "bg-warning/10 text-warning border-warning/30"
    : score >= 30 ? "bg-primary/10 text-primary border-primary/30"
    : "bg-muted text-muted-foreground";

  return (
    <div className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${color}`}>
      <div className="h-1.5 w-1.5 rounded-full bg-current" />
      {score}
    </div>
  );
}

// Qualification mini-bar for deal cards/lists
export function QualificationBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${getProgressColor(score)}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[9px] font-bold ${getScoreColor(score)}`}>{score}%</span>
    </div>
  );
}
