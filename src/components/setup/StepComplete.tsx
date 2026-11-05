import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Circle, PartyPopper, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface StepCompleteProps {
  completedSteps: Set<string>;
  onFinish: () => void;
}

const CHECKLIST = [
  { key: "organization", label: "Empresa configurada", settingsPath: "/settings" },
  { key: "pipeline", label: "Pipeline criado", settingsPath: "/settings" },
  { key: "ai", label: "AI Copilot — Claude ativo", settingsPath: "/settings" },
  { key: "resend", label: "Email de envio — Resend", settingsPath: "/settings/integrations" },
  { key: "google_gmail", label: "Gmail sincronizado", settingsPath: "/settings/integrations" },
  { key: "google_calendar", label: "Google Calendar conectado", settingsPath: "/settings/integrations" },
  { key: "slack", label: "Slack configurado", settingsPath: "/settings/integrations" },
  { key: "whatsapp", label: "WhatsApp Business conectado", settingsPath: "/settings/integrations" },
];

export function StepComplete({ completedSteps, onFinish }: StepCompleteProps) {
  const navigate = useNavigate();
  // For google sub-items, check if the parent "google" step was completed
  const isCompleted = (key: string) => {
    if (key === "google_gmail" || key === "google_calendar") {
      return completedSteps.has("google");
    }
    return completedSteps.has(key);
  };

  const completedCount = CHECKLIST.filter((item) => isCompleted(item.key)).length;

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <PartyPopper className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">Setup completo!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu Alencar Motors CRM está pronto para uso. Confira o que foi configurado:
        </p>
      </div>

      <Card className="mx-auto max-w-md text-left">
        <CardContent className="space-y-2 pt-6">
          {CHECKLIST.map((item, idx) => {
            const done = isCompleted(item.key);
            return (
              <div key={idx} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  {done ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                </div>
                {!done && (
                  <button
                    onClick={() => navigate(item.settingsPath)}
                    className="text-[11px] text-primary underline hover:text-primary/80"
                  >
                    configurar
                  </button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 mx-auto max-w-md">
        <Button size="lg" className="w-full" onClick={onFinish}>
          <PartyPopper className="mr-2 h-4 w-4" />
          Ir para o Dashboard
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate("/settings/integrations")}>
          <Settings className="mr-1 h-3.5 w-3.5" />
          Abrir configurações de integrações
        </Button>
      </div>
    </div>
  );
}
