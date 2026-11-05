import { Car, Gauge, Bot, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingStepProps } from "./types";

const features = [
  { icon: Gauge, label: "Estoque + pipeline", desc: "Veículos amarrados ao deal" },
  { icon: Bot, label: "Avaliação com IA", desc: "Foto + FIPE em segundos" },
  { icon: RotateCw, label: "Recompra automática", desc: "Janela de 3-5 anos" },
];

export function WelcomeStep({ userName, onNext }: OnboardingStepProps) {
  const firstName = userName?.split(" ")[0] || "usuário";

  return (
    <div className="text-center space-y-8 py-6">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
        <Car className="h-7 w-7 text-primary-foreground" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Bem-vindo ao Alencar Motors CRM, {firstName}
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Vamos configurar sua concessionária em menos de 5 minutos: dados da empresa, pipelines de venda e
          pós-venda, e os termos de uso. Sem firula.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
        {features.map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/50 p-4">
            <f.icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{f.label}</span>
            <span className="text-xs text-muted-foreground">{f.desc}</span>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="px-8">
        Vamos começar →
      </Button>
    </div>
  );
}
