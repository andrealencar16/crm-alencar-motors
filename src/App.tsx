import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineDetector } from "@/components/OfflineDetector";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Route-based code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Companies = lazy(() => import("./pages/Companies"));
const Deals = lazy(() => import("./pages/Deals"));
const DealDetail = lazy(() => import("./pages/DealDetail"));
const Activities = lazy(() => import("./pages/Activities"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Inbox = lazy(() => import("./pages/Inbox"));
const EmailTemplates = lazy(() => import("./pages/EmailTemplates"));
const EmailSequences = lazy(() => import("./pages/EmailSequences"));
const LeadScoring = lazy(() => import("./pages/LeadScoring"));
const Reports = lazy(() => import("./pages/Reports"));
const Automations = lazy(() => import("./pages/Automations"));
const Settings = lazy(() => import("./pages/Settings"));
const Integrations = lazy(() => import("./pages/Integrations"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const SalesGoals = lazy(() => import("./pages/SalesGoals"));
const Team = lazy(() => import("./pages/Team"));
const Setup = lazy(() => import("./pages/Setup"));
const Estoque = lazy(() => import("./pages/Estoque"));
const EstoqueDetail = lazy(() => import("./pages/EstoqueDetail"));
const Avaliacoes = lazy(() => import("./pages/Avaliacoes"));
const AvaliacaoNova = lazy(() => import("./pages/AvaliacaoNova"));
const Recompra = lazy(() => import("./pages/Recompra"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OfflineDetector />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/setup" element={<SuspenseRoute><Setup /></SuspenseRoute>} />
              
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<SuspenseRoute><Dashboard /></SuspenseRoute>} />
                <Route path="/contacts" element={<SuspenseRoute><Contacts /></SuspenseRoute>} />
                <Route path="/companies" element={<SuspenseRoute><Companies /></SuspenseRoute>} />
                <Route path="/deals" element={<SuspenseRoute><Deals /></SuspenseRoute>} />
                <Route path="/deals/:id" element={<SuspenseRoute><DealDetail /></SuspenseRoute>} />
                <Route path="/estoque" element={<SuspenseRoute><Estoque /></SuspenseRoute>} />
                <Route path="/estoque/:id" element={<SuspenseRoute><EstoqueDetail /></SuspenseRoute>} />
                <Route path="/avaliacoes" element={<SuspenseRoute><Avaliacoes /></SuspenseRoute>} />
                <Route path="/avaliacoes/nova" element={<SuspenseRoute><AvaliacaoNova /></SuspenseRoute>} />
                <Route path="/recompra" element={<SuspenseRoute><Recompra /></SuspenseRoute>} />
                <Route path="/activities" element={<SuspenseRoute><Activities /></SuspenseRoute>} />
                <Route path="/tasks" element={<SuspenseRoute><Tasks /></SuspenseRoute>} />
                <Route path="/inbox" element={<SuspenseRoute><Inbox /></SuspenseRoute>} />
                <Route path="/email-templates" element={<SuspenseRoute><EmailTemplates /></SuspenseRoute>} />
                <Route path="/email-sequences" element={<SuspenseRoute><EmailSequences /></SuspenseRoute>} />
                <Route path="/lead-scoring" element={<SuspenseRoute><LeadScoring /></SuspenseRoute>} />
                <Route path="/reports" element={<SuspenseRoute><Reports /></SuspenseRoute>} />
                <Route path="/automations" element={<SuspenseRoute><Automations /></SuspenseRoute>} />
                <Route path="/sales-goals" element={<SuspenseRoute><SalesGoals /></SuspenseRoute>} />
                <Route path="/settings" element={<SuspenseRoute><Settings /></SuspenseRoute>} />
                <Route path="/settings/integrations" element={<SuspenseRoute><Integrations /></SuspenseRoute>} />
                <Route path="/settings/security" element={<SuspenseRoute><SecuritySettings /></SuspenseRoute>} />
                <Route path="/team" element={<SuspenseRoute><Team /></SuspenseRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
