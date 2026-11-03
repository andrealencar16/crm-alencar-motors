import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Check, ArrowLeft, ArrowRight, Rocket, SkipForward, Loader2 } from "lucide-react";
import { StepPipeline } from "@/components/setup/StepPipeline";
import { StepContacts } from "@/components/setup/StepContacts";
import { StepAI } from "@/components/setup/StepAI";
import { StepResend } from "@/components/setup/StepResend";

import { StepSlack } from "@/components/setup/StepSlack";
import { StepComplete } from "@/components/setup/StepComplete";

export interface SetupStepProps {
  orgId: string | null;
  userId?: string;
  userEmail?: string;
  onComplete: () => void;
  stepData: Record<string, any>;
  setStepData: (data: Record<string, any>) => void;
}

const STEPS = [
  { key: "pipeline", label: "Pipeline", required: true },
  { key: "contacts", label: "Contatos", required: true },
  { key: "ai", label: "AI Copilot", required: false },
  { key: "resend", label: "Email (Resend)", required: false },
  { key: "slack", label: "Slack", required: false },
  { key: "complete", label: "Conclusão", required: true },
];

const TOTAL_STEPS = STEPS.length;

export default function Setup() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  const [stepData, setStepData] = useState<Record<string, any>>({});

  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;
  const step = STEPS[currentStep];
  const isOptional = !step.required;
  const isComplete = currentStep === TOTAL_STEPS - 1;

  const markComplete = () => {
    setCompletedSteps((prev) => new Set([...prev, step.key]));
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) setCurrentStep(currentStep + 1);
  };
  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };
  const handleSkip = () => {
    handleNext();
  };
  const handleStepComplete = () => {
    markComplete();
    handleNext();
  };

  const goToStep = (idx: number) => {
    if (idx <= currentStep || completedSteps.has(STEPS[idx - 1]?.key)) {
      setCurrentStep(idx);
    }
  };

  // Show loader while auth is loading
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  const renderStep = () => {
    const props: SetupStepProps = {
      orgId: profile?.org_id ?? null,
      userId: user?.id,
      userEmail: user?.email ?? profile?.email ?? undefined,
      onComplete: handleStepComplete,
      stepData,
      setStepData: (data) => setStepData((prev) => ({ ...prev, ...data })),
    };

    switch (step.key) {
      case "pipeline": return <StepPipeline {...props} />;
      case "contacts": return <StepContacts {...props} />;
      case "ai": return <StepAI {...props} />;
      case "resend": return <StepResend {...props} />;
      
      case "slack": return <StepSlack {...props} />;
      case "complete": return <StepComplete completedSteps={completedSteps} onFinish={() => navigate("/")} />;
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Rocket className="h-5 w-5 text-primary" />
            <span className="text-lg font-bold">CRM Automotivo Setup</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Passo {currentStep + 1} de {TOTAL_STEPS}
          </span>
        </div>
      </header>

      {/* Progress */}
      <div className="mx-auto w-full max-w-4xl px-4 pt-4 md:px-6">
        <Progress value={progress} className="h-2" />
        <div className="mt-3 flex items-center justify-between overflow-x-auto pb-2">
          {STEPS.map((s, idx) => {
            const done = completedSteps.has(s.key);
            const active = idx === currentStep;
            return (
              <button
                key={`${s.key}-${idx}`}
                onClick={() => goToStep(idx)}
                className={`flex flex-col items-center gap-1 px-1 min-w-0 ${
                  active ? "text-primary" : done ? "text-primary/60" : "text-muted-foreground"
                }`}
                aria-label={`Passo ${idx + 1}: ${s.label}`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : active
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                <span className="hidden text-[10px] md:block whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">
        {renderStep()}
      </main>

      {/* Footer */}
      {!isComplete && (
        <footer className="border-t border-border bg-card px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={currentStep === 0}
              aria-label="Passo anterior"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>
            <div className="flex gap-2">
              {isOptional && (
                <Button variant="outline" size="sm" onClick={handleSkip}>
                  <SkipForward className="mr-1 h-4 w-4" />
                  Pular
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
