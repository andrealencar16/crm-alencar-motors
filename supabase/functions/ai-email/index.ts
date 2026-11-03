import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, tone, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const toneMap: Record<string, string> = {
      formal: "profissional e formal, com linguagem corporativa",
      casual: "amigável e casual, mantendo profissionalismo",
      persuasive: "persuasivo e convincente, focado em benefícios",
      urgent: "urgente e direto, transmitindo importância e prazo",
    };

    const toneDesc = toneMap[tone] || toneMap.formal;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Você é um assistente de redação de emails profissionais B2B. Gere emails em português brasileiro.
Tom: ${toneDesc}.
${context ? `Contexto: ${context}` : ""}`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_email",
              description: "Generate a professional email with subject suggestions",
              parameters: {
                type: "object",
                properties: {
                  subject_options: {
                    type: "array",
                    items: { type: "string" },
                    description: "3 subject line options",
                  },
                  body: { type: "string", description: "Full email body in plain text" },
                  sentiment: { type: "string", enum: ["positive", "neutral", "negative"], description: "Overall tone" },
                },
                required: ["subject_options", "body", "sentiment"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_email" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI email error:", response.status, t);
      throw new Error("AI error");
    }

    const data = await response.json();
    let result = { subject_options: [], body: "", sentiment: "neutral" };
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        result = JSON.parse(toolCall.function.arguments);
      }
    } catch (e) {
      console.error("Parse error:", e);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
