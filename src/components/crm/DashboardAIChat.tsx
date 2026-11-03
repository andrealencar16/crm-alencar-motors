import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Sparkles, User, Briefcase } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-sales-manager`;

const SUGGESTIONS = [
  "Faça uma análise geral do meu pipeline",
  "Quais negócios preciso priorizar hoje?",
  "Como está minha taxa de conversão?",
  "Quais contatos estão esfriando e precisam de atenção?",
  "Me dê um plano de ação para esta semana",
  "Analise os negócios em risco e sugira próximos passos",
];

interface CrmData {
  wonRevenue: number;
  pipelineValue: number;
  openDealsCount: number;
  winRate: number;
  avgTicket: number;
  avgCycle: number;
  wonDealsCount: number;
  lostDealsCount: number;
  pendingActivities: number;
  newLeadsCount: number;
  atRiskDeals: { title: string; value: number; daysSinceUpdate: number }[];
  closingSoonDeals: { title: string; value: number; daysLeft: number; probability: number }[];
  topPerformers: { name: string; deals: number; revenue: number }[];
  funnelData: { name: string; count: number; value: number }[];
}

interface DashboardAIChatProps {
  crmData: CrmData;
}

function buildCrmContext(data: CrmData): string {
  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  let ctx = `RESUMO DO CRM (dados em tempo real):
- Receita ganha no período: ${fmt(data.wonRevenue)} (${data.wonDealsCount} deals ganhos)
- Pipeline aberto: ${fmt(data.pipelineValue)} (${data.openDealsCount} deals)
- Win rate: ${data.winRate}%
- Ticket médio: ${fmt(data.avgTicket)}
- Ciclo médio de vendas: ${data.avgCycle} dias
- Deals perdidos no período: ${data.lostDealsCount}
- Atividades pendentes: ${data.pendingActivities}
- Novos leads no período: ${data.newLeadsCount}`;

  if (data.funnelData.length > 0) {
    ctx += `\n\nFUNIL DO PIPELINE:`;
    data.funnelData.forEach((s) => {
      ctx += `\n- ${s.name}: ${s.count} deals (${fmt(s.value)})`;
    });
  }

  if (data.atRiskDeals.length > 0) {
    ctx += `\n\nNEGÓCIOS EM RISCO (inativos):`;
    data.atRiskDeals.forEach((d) => {
      ctx += `\n- "${d.title}" — ${fmt(d.value)} — ${d.daysSinceUpdate} dias sem atividade`;
    });
  }

  if (data.closingSoonDeals.length > 0) {
    ctx += `\n\nNEGÓCIOS COM FECHAMENTO PRÓXIMO (prob < 50%):`;
    data.closingSoonDeals.forEach((d) => {
      ctx += `\n- "${d.title}" — ${fmt(d.value)} — ${d.daysLeft <= 0 ? "vencido" : `${d.daysLeft} dias`} — ${d.probability}% probabilidade`;
    });
  }

  if (data.topPerformers.length > 0) {
    ctx += `\n\nTOP PERFORMERS:`;
    data.topPerformers.forEach((p, i) => {
      ctx += `\n${i + 1}. ${p.name}: ${p.deals} deals — ${fmt(p.revenue)}`;
    });
  }

  return ctx;
}

export function DashboardAIChat({ crmData }: DashboardAIChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const crmContext = useMemo(() => buildCrmContext(crmData), [crmData]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
          crmContext,
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
      console.error("AI Sales Manager error:", e);
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
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="font-semibold">Gerente Comercial IA</span>
            <p className="text-[10px] text-muted-foreground font-normal">
              Carlos · Análise em tempo real do seu CRM
            </p>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Messages area */}
        <ScrollArea className="h-[320px] px-4" ref={scrollRef as any}>
          <div className="py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Olá! Sou o Carlos, seu gerente comercial de IA.
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  Tenho acesso completo aos dados do seu CRM. Como posso ajudar?
                </p>
                <div className="flex flex-wrap gap-1.5 justify-center max-w-md mx-auto">
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
                    <div className="prose prose-xs prose-neutral dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[10px] [&_table]:text-[10px]">
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
              placeholder="Pergunte ao Carlos sobre seu pipeline, negócios, equipe..."
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
      </CardContent>
    </Card>
  );
}
