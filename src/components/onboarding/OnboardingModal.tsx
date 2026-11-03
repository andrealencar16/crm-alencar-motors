import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import { WelcomeStep } from "./WelcomeStep";
import { CompanyStep } from "./CompanyStep";

import { PipelineStep } from "./PipelineStep";
import { TermosStep } from "./TermosStep";
import { AICopilotStep } from "./AICopilotStep";
import { EmailStep } from "./EmailStep";
import { SlackStep } from "./SlackStep";
import { CompleteStep } from "./CompleteStep";
import { getResumeStep, loadPersistedOnboardingState } from "./persistence";
import type { OnboardingStepProps } from "./types";

const STEPS = [
  { key: "welcome", label: "Boas-vindas", required: true },
  { key: "company", label: "Concessionária", required: true },
  { key: "pipeline", label: "Pipelines", required: true },
  { key: "termos", label: "Termos", required: true },
  { key: "ai", label: "AI Copilot", required: false },
  { key: "email", label: "Email", required: false },
  { key: "slack", label: "Slack", required: false },
  { key: "complete", label: "Conclusão", required: true },
];

export function OnboardingModal() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [canContinue, setCanContinue] = useState(false);
  const [direction, setDirection] = useState<"left" | "right">("left");
  const [stepData, setStepData] = useState<Record<string, any>>({});
  const [orgId, setOrgId] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  // Track which user we've loaded persisted state for, so logout+login resets cleanly.
  const persistenceLoadedForUserRef = useRef<string | null>(null);

  // Reactive open/close: depends ONLY on profile.onboarding_completed.
  useEffect(() => {
    if (!user || !profile) {
      setIsOpen(false);
      return;
    }
    const p = profile as any;
    if (profile.org_id) setOrgId(profile.org_id);

    if (p.onboarding_completed) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
  }, [user, profile]);

  // Load persisted state once per user.id (resets on logout/login).
  useEffect(() => {
    if (!user || !profile) return;
    const p = profile as any;
    if (p.onboarding_completed) return;
    if (persistenceLoadedForUserRef.current === user.id) return;
    persistenceLoadedForUserRef.current = user.id;

    void (async () => {
      const persisted = await loadPersistedOnboardingState(user.id, profile.org_id ?? null);
      const resumeStep = getResumeStep(p.onboarding_step, persisted.completedSteps);

      if (persisted.orgId) setOrgId(persisted.orgId);
      if (persisted.completedSteps.size > 0) setCompletedSteps(new Set(persisted.completedSteps));
      if (Object.keys(persisted.stepData).length > 0) {
        setStepData((prev) => ({ ...prev, ...persisted.stepData }));
      }

      setCurrentStep(resumeStep);

      if ((p.onboarding_step ?? 1) < resumeStep + 1) {
        await supabase.from("profiles").update({ onboarding_step: resumeStep + 1 } as any).eq("id", user.id);
      }
    })();
  }, [user, profile]);

  // Focus trap + block Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); return; }
      if (e.key === "Tab" && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const saveProgress = useCallback(async (step: number) => {
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_step: step + 1 } as any).eq("id", user.id);
  }, [user]);

  const advancingRef = useRef(false);

  const handleNext = useCallback(() => {
    if (advancingRef.current) return;
    if (currentStep < STEPS.length - 1) {
      advancingRef.current = true;
      const next = currentStep + 1;
      setDirection("left");
      setCompletedSteps(prev => new Set([...prev, STEPS[currentStep].key]));
      setCurrentStep(next);
      setCanContinue(false);
      // Save progress to profile (non-blocking, using setTimeout to avoid re-fetch loop)
      if (user) {
        setTimeout(() => {
          supabase.from("profiles").update({ onboarding_step: next + 1 } as any).eq("id", user.id);
        }, 0);
      }
      setTimeout(() => { advancingRef.current = false; }, 300);
    }
  }, [currentStep, user]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setDirection("right");
      setCurrentStep(currentStep - 1);
      setCanContinue(true);
    }
  }, [currentStep]);

  const handleComplete = useCallback(async (navigateTo?: string) => {
    if (!user) return;
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    // Mark onboarding as completed in profile
    await supabase.from("profiles").update({ onboarding_completed: true, onboarding_step: STEPS.length } as any).eq("id", user.id);

    // Update onboarding_progress table for full tracking
    if (orgId) {
      const progressData: Record<string, any> = {
        user_id: user.id,
        org_id: orgId,
        completed: true,
        profile_configured: completedSteps.has("company") || !!stepData.orgName,
        pipeline_created: completedSteps.has("pipeline") || !!stepData.pipelineName,
        email_connected: !!stepData.emailConfigured,
      };
      const { data: existing } = await supabase
        .from("onboarding_progress")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) {
        await supabase.from("onboarding_progress").update(progressData).eq("id", existing.id);
      } else {
        await supabase.from("onboarding_progress").insert(progressData as any);
      }
    }

    setTimeout(() => {
      setIsOpen(false);
      if (navigateTo) navigate(navigateTo);
    }, 600);
  }, [user, navigate, orgId, completedSteps, stepData]);

  const updateStepData = useCallback((key: string, value: any) => {
    setStepData(prev => ({ ...prev, [key]: value }));
  }, []);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const isWelcome = step.key === "welcome";
  const isComplete = step.key === "complete";
  const showFooter = !isWelcome && !isComplete;

  const stepProps: OnboardingStepProps = {
    orgId,
    userId: user?.id ?? "",
    userEmail: user?.email ?? "",
    userName: (profile as any)?.name ?? user?.email?.split("@")[0] ?? "",
    stepData,
    setStepData: updateStepData,
    setCanContinue,
    onNext: handleNext,
    onComplete: handleComplete,
    setOrgId,
    completedSteps,
  };

  const renderStep = () => {
    switch (step.key) {
      case "welcome": return <WelcomeStep {...stepProps} />;
      case "company": return <CompanyStep {...stepProps} />;
      case "pipeline": return <PipelineStep {...stepProps} />;
      case "termos": return <TermosStep {...stepProps} />;
      case "ai": return <AICopilotStep {...stepProps} />;
      case "email": return <EmailStep {...stepProps} />;
      case "slack": return <SlackStep {...stepProps} />;
      case "complete": return <CompleteStep {...stepProps} />;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Configuração inicial">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full h-full md:w-[92vw] md:max-w-[640px] md:h-auto md:max-h-[85vh] md:rounded-2xl border border-border bg-card flex flex-col overflow-hidden"
      >
        {showFooter && (
          <div className="px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Passo {currentStep + 1} de {STEPS.length} · {step.label}
              </span>
              <Badge variant={step.required ? "destructive" : "secondary"} className="text-xs">
                {step.required ? "Obrigatório" : "Opcional"}
              </Badge>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div
            key={currentStep}
            className="px-6 py-6 onboarding-slide-in"
            style={{ animationName: direction === "left" ? "onboardingSlideLeft" : "onboardingSlideRight" }}
          >
            {renderStep()}
          </div>
        </div>

        {showFooter && (
          <div className="border-t border-border px-6 py-4 flex items-center justify-between shrink-0">
            <Button variant="ghost" size="sm" onClick={handleBack} disabled={currentStep <= 1}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button size="sm" onClick={handleNext} disabled={step.required && !canContinue}>
                Continuar <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              {!step.required && (
                <button
                  onClick={handleNext}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                >
                  Pular por agora
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
