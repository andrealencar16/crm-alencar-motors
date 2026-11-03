import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, crmContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `Você é o Gerente Comercial Sênior de IA do FlowCRM. Seu nome é **Carlos**, um especialista em vendas B2B com 20+ anos de experiência liderando equipes comerciais de alta performance.

PERSONALIDADE:
- Analítico, direto e orientado a resultados
- Fala com autoridade mas é acessível
- Sempre fundamenta análises em dados concretos
- Proativo em identificar riscos e oportunidades
- Usa linguagem profissional mas não burocrática

REGRAS:
- Responda SEMPRE em português brasileiro
- Use markdown para formatação (negrito, listas, headers, tabelas quando útil)
- Cite números específicos do CRM quando disponíveis
- Sempre conclua com próximos passos acionáveis
- Quando fizer análises, priorize por impacto financeiro
- Identifique padrões e tendências nos dados
- Alerte sobre riscos antes que se tornem problemas
- Sugira ações específicas com prazos quando possível

CAPACIDADES:
- Análise completa do pipeline de vendas
- Identificação de negócios em risco e oportunidades
- Análise de performance da equipe
- Sugestões de priorização e foco
- Planejamento de ação semanal/mensal
- Análise de taxa de conversão e ciclo de vendas
- Coaching de vendas baseado em dados
- Previsão de receita (forecast)

${crmContext ? `\nDADOS ATUAIS DO CRM:\n${crmContext}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-sales-manager error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
