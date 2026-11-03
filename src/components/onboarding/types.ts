export interface OnboardingStepProps {
  orgId: string | null;
  userId: string;
  userEmail: string;
  userName: string;
  stepData: Record<string, any>;
  setStepData: (key: string, value: any) => void;
  setCanContinue: (can: boolean) => void;
  onNext: () => void;
  onComplete: (navigateTo?: string) => void;
  setOrgId: (id: string) => void;
  completedSteps: Set<string>;
}
