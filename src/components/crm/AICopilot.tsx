import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Bot, Send, X, Sparkles, Loader2, User } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`;

const SUGGESTIONS = [
  "Qualifique este lead — quais perguntas fazer?",
  "Checklist de test drive PF",
  "Responda objeção: 'achei mais barato em outra loja'",
  "Compare CDC vs leasing vs consórcio em 3 linhas",
  "Quais clientes estão na janela de recompra?",
  "Sugira veículo de troca para o cliente atual",
];

const STAGE_HINTS: Record<string, string> = {
  Lead: "Script de qualificação inicial: orçamento, prazo, uso (cidade/estrada), preferência de marca, condição financeira (à vista/financiado/troca).",
  Qualificado: "Próximo passo: agendar test drive, perguntar veículo de troca para avaliação.",
  "Test Drive": "Checklist do test drive: documentos, rota fixa de 15min, perguntar sobre conforto/posição de dirigir/visibilidade, oferecer avaliação de troca ao retornar.",
  Proposta: "Objeções comuns: preço (use FIPE como âncora), troca (suba 5-10% se cliente fechar hoje), garantia (oferta de 1 ano de revisão grátis), prazo de entrega.",
  "Financiamento/Pagamento": "CDC: parcela fixa, sem entrada obrigatória, IOF; Leasing: empresa, depreciação fiscal; Consórcio: sem juros mas sem carro imediato; à vista: melhor desconto.",
  "Fechado-Ganho": "Pós-venda: agendar 1ª revisão (1.000 km / 30d), confirmar dados CRLV, oferecer seguro/acessórios, lembrar do ciclo de recompra.",
  "Fechado-Perdido": "Follow-up futuro: registrar motivo (preço/troca/timing/financiamento). Agendar contato em 3-6 meses se motivo foi timing.",
};

export function AICopilot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  // Build page context (assíncrono — busca stage/purchase_history para enriquecer prompts automotivos).
  const getContext = useCallback(async (): Promise<string> => {
    const path = location.pathname;
    const segments = "Você é o AI Copilot do CRM Automotivo — concessionária PME (PF). Foque em vendas de veículos, test drive, avaliação de troca, financiamento (CDC/leasing/consórcio), pós-venda e recompra.";

    if (path.startsWith("/deals/")) {
      const dealId = path.split("/")[2];
      const { data: deal } = await supabase
        .from("deals")
        .select("title, value, vehicle_id, trade_in_id, pipeline_stages(name), contacts(first_name, last_name, purchase_cycle_months)")
        .eq("id", dealId)
        .maybeSingle();
      type DealCtx = {
        title: string;
        value: number | null;
        vehicle_id: string | null;
        trade_in_id: string | null;
        pipeline_stages: { name: string } | null;
        contacts: { first_name: string; last_name: string | null; purchase_cycle_months: number | null } | null;
      };
      const d = deal as DealCtx | null;
      const stage = d?.pipeline_stages?.name ?? "desconhecido";
      const hint = STAGE_HINTS[stage] ?? "";
      return [
        segments,
        `Página atual: detalhe do deal "${d?.title ?? dealId}" no stage "${stage}".`,
        d?.contacts ? `Contato: ${`${d.contacts.first_name} ${d.contacts.last_name ?? ""}`.trim()}.` : "",
        d?.vehicle_id ? "Veículo de interesse já vinculado." : "Nenhum veículo de interesse vinculado ainda.",
        d?.trade_in_id ? "Trade-in já vinculado." : "Nenhum trade-in vinculado.",
        hint ? `Dica para este stage: ${hint}` : "",
      ].filter(Boolean).join(" ");
    }

    if (path.startsWith("/estoque/")) {
      return `${segments} Página atual: detalhe de veículo no estoque. Sugira ações de marketing/negociação e perguntas de qualificação.`;
    }
    if (path === "/estoque") return `${segments} Página atual: lista do estoque de veículos. Foque em giro, status, marcas.`;
    if (path === "/avaliacoes" || path.startsWith("/avaliacoes")) {
      return `${segments} Página atual: avaliação de troca (trade-in). Ajude a interpretar estimativas FIPE vs IA, sugerir valor de oferta.`;
    }
    if (path === "/recompra") {
      return `${segments} Página atual: lista de candidatos a recompra. Sugira scripts de contato, agrupar por marca preferida.`;
    }
    if (path === "/deals") return `${segments} Página atual: pipeline kanban. Foque em deals parados em stage há mais tempo.`;
    if (path === "/contacts") return `${segments} Página atual: lista de contatos (clientes PF da concessionária).`;
    if (path === "/dashboard") return `${segments} Página atual: dashboard principal. Foque em KPIs de estoque, conversão, ticket médio, recompra.`;
    if (path === "/reports") return `${segments} Página atual: relatórios.`;
    return `${segments} Página atual: ${path}`;
  }, [location.pathname]);

  // ⌘+J shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const sendMessage = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isLoading) return;

    const userMsg: Msg = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          context: await getContext(),
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        upsertAssistant(errData.error || "Erro ao processar. Tente novamente.");
        setIsLoading(false);
        return;
      }

      if (!resp.body) {
        upsertAssistant("Erro: resposta vazia");
        setIsLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error("AI Copilot error:", e);
      upsertAssistant("Erro de conexão. Verifique sua internet.");
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
        size="icon"
      >
        <Sparkles className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">AI Copilot</h3>
                <p className="text-[9px] text-muted-foreground">⌘+J para abrir · Powered by Lovable AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[8px]">{messages.filter((m) => m.role === "user").length} msgs</Badge>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollRef as any}>
            <div className="py-3 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground mb-3">Como posso ajudar?</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="text-[10px] px-2.5 py-1.5 rounded-full border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[10px]">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 mt-0.5">
                      <User className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t px-3 py-2">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte algo sobre seus dados..."
                className="min-h-[36px] max-h-[80px] resize-none text-xs"
                rows={1}
              />
              <Button
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
