import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  MessageSquare, Webhook, Key, Code, Plus, Trash2, Copy,
  Check, ExternalLink, RefreshCw, Eye, EyeOff, Loader2, Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ──
type IntegrationConfig = {
  id: string; org_id: string; provider: string; config: any; is_active: boolean;
  connected_at: string | null; connected_by: string | null;
};
type ApiKey = {
  id: string; org_id: string; name: string; key_prefix: string; key_hash: string;
  created_at: string | null; last_used_at: string | null; is_active: boolean; request_count: number;
};
type WebhookRow = {
  id: string; org_id: string; name: string; url: string; events: string[];
  secret: string | null; is_active: boolean; created_at: string | null;
  last_triggered_at: string | null; failure_count: number;
};

const WEBHOOK_EVENTS = [
  { value: "deal.won", label: "Negócio Ganho" },
  { value: "deal.lost", label: "Negócio Perdido" },
  { value: "deal.stage_changed", label: "Mudança de Stage" },
  { value: "contact.created", label: "Contato Criado" },
  { value: "deal.created", label: "Negócio Criado" },
  { value: "activity.created", label: "Atividade Criada" },
];

export default function Integrations() {
  const { user } = useAuth();
  const { orgId } = useOrg();
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrações & API</h1>
        <p className="text-muted-foreground">Conecte ferramentas externas e gerencie sua API</p>
      </div>

      <Tabs defaultValue="integrations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="api">API Keys</TabsTrigger>
          <TabsTrigger value="tracking">Rastreamento</TabsTrigger>
          <TabsTrigger value="import-export">Import/Export</TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab orgId={orgId} userId={user?.id} />
        </TabsContent>
        <TabsContent value="webhooks" className="mt-4">
          <WebhooksTab orgId={orgId} />
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <ApiKeysTab orgId={orgId} userId={user?.id} />
        </TabsContent>
        <TabsContent value="tracking" className="mt-4">
          <TrackingTab orgId={orgId} />
        </TabsContent>
        <TabsContent value="import-export" className="mt-4">
          <ImportExportTab orgId={orgId} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Integrations Tab ──
function IntegrationsTab({ orgId, userId }: { orgId: string | null; userId?: string }) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
  const [editProvider, setEditProvider] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<any>({});

  const fetchConfigs = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from("integration_configs").select("*").eq("org_id", orgId) as any;
    setConfigs(data || []);
  }, [orgId]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const getConfig = (provider: string) => configs.find((c) => c.provider === provider);

  const saveConfig = async (provider: string) => {
    if (!orgId) return;
    const existing = getConfig(provider);
    if (existing) {
      await supabase.from("integration_configs").update({ config: editConfig, is_active: true } as any).eq("id", existing.id);
    } else {
      await supabase.from("integration_configs").insert({ org_id: orgId, provider, config: editConfig, connected_by: userId } as any);
    }
    toast({ title: `${provider} configurado` });
    setEditProvider(null);
    fetchConfigs();
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("integration_configs").update({ is_active: active } as any).eq("id", id);
    fetchConfigs();
  };

  const [slackConnecting, setSlackConnecting] = useState(false);
  const [slackChannels, setSlackChannels] = useState<{ id: string; name: string }[]>([]);
  const [slackWorkspace, setSlackWorkspace] = useState<string | null>(null);
  const [slackSetupGuide, setSlackSetupGuide] = useState(false);

  const handleSlackConnect = async () => {
    if (!orgId) return;
    setSlackConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("slack-connect", {
        body: { org_id: orgId },
      });
      if (error) throw error;
      if (data?.error?.includes("API_KEY")) {
        setSlackSetupGuide(true);
        setSlackConnecting(false);
        return;
      }
      if (data?.workspace_name) {
        setSlackWorkspace(data.workspace_name);
        setSlackChannels(data.channels || []);
        toast({ title: `Conectado ao workspace ${data.workspace_name}` });
        fetchConfigs();
      } else {
        setSlackSetupGuide(true);
      }
    } catch {
      setSlackSetupGuide(true);
    }
    setSlackConnecting(false);
  };

  const integrations = [
    {
      provider: "slack", name: "Slack", icon: MessageSquare,
      description: "Notificações de negócios e resumo diário no canal",
      connectAction: handleSlackConnect,
      connectLoading: slackConnecting,
      fields: [
        { key: "channel", label: "Canal de notificações", placeholder: "#vendas" },
        { key: "daily_summary", label: "Resumo diário às 9h", type: "switch" },
        { key: "notify_won", label: "Notificar negócio ganho", type: "switch" },
        { key: "notify_lost", label: "Notificar negócio perdido", type: "switch" },
      ],
    },
    {
      provider: "zapier", name: "Zapier / Make", icon: Webhook,
      description: "Webhooks de saída e entrada para automação",
      fields: [
        { key: "outbound_url", label: "Webhook URL de saída", placeholder: "https://hooks.zapier.com/..." },
        { key: "events", label: "Eventos", placeholder: "deal.won, deal.lost, contact.created" },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((intg) => {
          const cfg = getConfig(intg.provider);
          const Icon = intg.icon;
          return (
            <Card key={intg.provider}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">{intg.name}</CardTitle>
                      <CardDescription className="text-[10px]">{intg.description}</CardDescription>
                    </div>
                  </div>
                  {cfg && <Switch checked={cfg.is_active} onCheckedChange={(v) => toggleActive(cfg.id, v)} />}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {cfg ? (
                    <>
                      <Badge variant={cfg.is_active ? "default" : "secondary"} className="text-[9px]">
                        {cfg.is_active ? "Conectado" : "Inativo"}
                      </Badge>
                      <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px]"
                        onClick={() => { setEditProvider(intg.provider); setEditConfig(cfg.config || {}); }}>
                        Configurar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="h-7 text-[10px]"
                      disabled={intg.connectLoading}
                      onClick={() => intg.connectAction ? intg.connectAction() : (() => { setEditProvider(intg.provider); setEditConfig({}); })()}>
                      {intg.connectLoading ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Conectando...</> : <><Plus className="mr-1 h-3 w-3" />Conectar</>}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Config Dialog */}
      <Dialog open={!!editProvider} onOpenChange={() => setEditProvider(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Configurar {integrations.find((i) => i.provider === editProvider)?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {integrations.find((i) => i.provider === editProvider)?.fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs">{field.label}</Label>
                {field.type === "switch" ? (
                  <div className="flex items-center gap-2">
                    <Switch checked={!!editConfig[field.key]} onCheckedChange={(v) => setEditConfig({ ...editConfig, [field.key]: v })} />
                    <span className="text-xs text-muted-foreground">{editConfig[field.key] ? "Sim" : "Não"}</span>
                  </div>
                ) : (
                  <Input value={editConfig[field.key] || ""} onChange={(e) => setEditConfig({ ...editConfig, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    aria-label={field.placeholder} className="h-8 text-xs" />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditProvider(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => editProvider && saveConfig(editProvider)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slack Setup Guide */}
      <Dialog open={slackSetupGuide} onOpenChange={setSlackSetupGuide}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Configurar integração com o Slack
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Para conectar o Slack ao Alencar Motors CRM, siga os passos abaixo:
            </p>

            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                <div>
                  <p className="text-sm font-medium">Acesse as configurações do projeto no Lovable</p>
                  <p className="text-xs text-muted-foreground">Clique no nome do projeto (canto superior esquerdo) → "Settings"</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                <div>
                  <p className="text-sm font-medium">Vá em "Connectors"</p>
                  <p className="text-xs text-muted-foreground">Na aba de conectores, procure por "Slack" e clique em "Connect"</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                <div>
                  <p className="text-sm font-medium">Autorize o acesso ao seu workspace</p>
                  <p className="text-xs text-muted-foreground">Selecione o workspace do Slack e autorize as permissões necessárias (enviar mensagens, listar canais)</p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">4</span>
                <div>
                  <p className="text-sm font-medium">Volte aqui e clique em "Conectar"</p>
                  <p className="text-xs text-muted-foreground">Após vincular o conector, o Alencar Motors CRM detectará automaticamente seus canais</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Permissões necessárias:</strong> <code className="text-[10px] bg-muted px-1 rounded">chat:write</code> <code className="text-[10px] bg-muted px-1 rounded">channels:read</code> <code className="text-[10px] bg-muted px-1 rounded">channels:history</code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSlackSetupGuide(false)}>Fechar</Button>
            <Button size="sm" onClick={() => { setSlackSetupGuide(false); handleSlackConnect(); }}>
              <RefreshCw className="mr-1 h-3 w-3" /> Tentar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function WebhooksTab({ orgId }: { orgId: string | null }) {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[], secret: "" });

  const fetchWebhooks = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from("webhooks").select("*").eq("org_id", orgId) as any;
    setWebhooks(data || []);
  }, [orgId]);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const createWebhook = async () => {
    if (!orgId || !form.name || !form.url) return;
    await supabase.from("webhooks").insert({
      org_id: orgId, name: form.name, url: form.url, events: form.events,
      secret: form.secret || null,
    } as any);
    toast({ title: "Webhook criado" });
    setShowCreate(false);
    setForm({ name: "", url: "", events: [], secret: "" });
    fetchWebhooks();
  };

  const deleteWebhook = async (id: string) => {
    await supabase.from("webhooks").delete().eq("id", id);
    toast({ title: "Webhook excluído" });
    fetchWebhooks();
  };

  const toggleWebhook = async (id: string, active: boolean) => {
    await supabase.from("webhooks").update({ is_active: active } as any).eq("id", id);
    fetchWebhooks();
  };

  const inboundUrl = orgId
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inbound-webhook?org_id=${orgId}`
    : "";

  return (
    <div className="space-y-4">
      {/* Outbound Webhooks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Webhooks de Saída</CardTitle>
              <CardDescription className="text-[10px]">Envie notificações para URLs externas quando eventos ocorrerem</CardDescription>
            </div>
            <Button size="sm" className="h-7 text-[10px]" onClick={() => setShowCreate(true)}>
              <Plus className="mr-1 h-3 w-3" />Novo Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum webhook configurado</p>
          ) : (
            <div className="space-y-2">
              {webhooks.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{wh.name}</span>
                      <Badge variant={wh.is_active ? "default" : "secondary"} className="text-[8px]">
                        {wh.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{wh.url}</p>
                    <div className="flex gap-1 mt-1">
                      {wh.events?.map((e) => (
                        <Badge key={e} variant="outline" className="text-[7px]">{e}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={wh.is_active} onCheckedChange={(v) => toggleWebhook(wh.id, v)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteWebhook(wh.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inbound Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Webhook de Entrada</CardTitle>
          <CardDescription className="text-[10px]">
            Receba dados de ferramentas externas (Zapier, Make, etc.) via POST
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={inboundUrl} readOnly className="h-8 text-[10px] font-mono" />
              <Button variant="outline" size="sm" className="h-8"
                onClick={() => { navigator.clipboard.writeText(inboundUrl); toast({ title: "Copiado!" }); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-[10px] text-muted-foreground mb-1 font-medium">Payload esperado (JSON POST):</p>
            <pre className="text-[9px] font-mono text-muted-foreground">{`{
  "entity": "contact",
  "action": "create",
  "data": {
    "first_name": "João",
    "email": "joao@empresa.com"
  }
}`}</pre>
          </div>
        </CardContent>
      </Card>

      {/* Create Webhook Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm">Novo Webhook</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Zapier — Deals Ganhos"
                aria-label="Zapier — Deals Ganhos" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://hooks.zapier.com/..."
                aria-label="https://hooks.zapier.com/..." className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secret (para HMAC)</Label>
              <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}
                placeholder="Opcional"
                aria-label="Opcional" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Eventos</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((ev) => (
                  <label key={ev.value} className="flex items-center gap-2 text-[10px]">
                    <Checkbox
                      checked={form.events.includes(ev.value)}
                      onCheckedChange={(checked) => {
                        setForm({
                          ...form,
                          events: checked
                            ? [...form.events, ev.value]
                            : form.events.filter((e) => e !== ev.value),
                        });
                      }}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button size="sm" onClick={createWebhook}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── API Keys Tab ──
function ApiKeysTab({ orgId, userId }: { orgId: string | null; userId?: string }) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from("api_keys").select("*").eq("org_id", orgId) as any;
    setKeys(data || []);
  }, [orgId]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const generateKey = async () => {
    if (!orgId) return;
    // Generate a random API key
    const rawKey = `fc_${crypto.randomUUID().replace(/-/g, "")}`;
    const prefix = rawKey.slice(0, 8);
    // Hash it (simplified — in production use edge function)
    const encoder = new TextEncoder();
    const data = encoder.encode(rawKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error } = await supabase.from("api_keys").insert({
      org_id: orgId, name: newKeyName, key_hash: hashHex, key_prefix: prefix, created_by: userId,
    } as any);

    if (error) { 
      const msg = error.message.includes("policy") || error.code === "42501" 
        ? "Sem permissão. Apenas Owners e Admins podem gerar API keys." 
        : error.message;
      toast({ title: "Erro ao gerar chave", description: msg, variant: "destructive" }); 
      return; 
    }
    setGeneratedKey(rawKey);
    setShowKey(true);
    fetchKeys();
    toast({ title: "API Key gerada" });
  };

  const revokeKey = async (id: string) => {
    await supabase.from("api_keys").update({ is_active: false } as any).eq("id", id);
    toast({ title: "Chave revogada" });
    fetchKeys();
  };

  const deleteKey = async (id: string) => {
    await supabase.from("api_keys").delete().eq("id", id);
    toast({ title: "Chave excluída" });
    fetchKeys();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">API Keys</CardTitle>
              <CardDescription className="text-[10px]">
                Gere chaves para acessar a API REST do CRM. Rate limit: 1000 req/hora.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Nome da chave"
              aria-label="Nome da chave" className="h-8 text-xs flex-1" />
            <Button size="sm" className="h-8 text-xs" onClick={generateKey}>
              <Key className="mr-1 h-3 w-3" />Gerar Chave
            </Button>
          </div>

          {generatedKey && showKey && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-2">
              <p className="text-[10px] font-medium text-warning">⚠️ Copie esta chave agora — ela não será exibida novamente</p>
              <div className="flex gap-2">
                <Input value={generatedKey} readOnly className="h-8 text-[10px] font-mono" />
                <Button variant="outline" size="sm" className="h-8"
                  onClick={() => { navigator.clipboard.writeText(generatedKey); toast({ title: "Copiado!" }); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[9px]"
                onClick={() => { setShowKey(false); setGeneratedKey(null); }}>
                Esconder
              </Button>
            </div>
          )}

          {keys.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Nome</TableHead>
                  <TableHead className="text-[10px]">Prefixo</TableHead>
                  <TableHead className="text-[10px]">Status</TableHead>
                  <TableHead className="text-[10px]">Requests</TableHead>
                  <TableHead className="text-[10px]">Criada</TableHead>
                  <TableHead className="text-[10px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="text-xs">{k.name}</TableCell>
                    <TableCell className="text-xs font-mono">{k.key_prefix}...</TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "destructive"} className="text-[8px]">
                        {k.is_active ? "Ativa" : "Revogada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{k.request_count}</TableCell>
                    <TableCell className="text-xs">{k.created_at ? new Date(k.created_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {k.is_active && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => revokeKey(k.id)}>
                            <EyeOff className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteKey(k.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* API Docs link */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Documentação da API</CardTitle>
          <CardDescription className="text-[10px]">
            Endpoints REST disponíveis: contacts, companies, deals, activities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-4 space-y-3">
            <p className="text-[10px] font-medium">Base URL</p>
            <code className="text-[10px] font-mono bg-background px-2 py-1 rounded">
              {import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-api
            </code>

            <div className="grid gap-2 mt-3">
              {["GET /contacts", "POST /contacts", "PUT /contacts/:id", "DELETE /contacts/:id",
                "GET /companies", "POST /companies", "GET /deals", "POST /deals",
                "GET /activities", "POST /activities"].map((endpoint) => (
                <div key={endpoint} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[8px] w-12 justify-center">
                    {endpoint.split(" ")[0]}
                  </Badge>
                  <code className="text-[9px] font-mono text-muted-foreground">{endpoint.split(" ")[1]}</code>
                </div>
              ))}
            </div>

            <p className="text-[9px] text-muted-foreground mt-2">
              Headers: <code className="bg-background px-1 rounded">Authorization: Bearer fc_xxx</code>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tracking Tab ──
function TrackingTab({ orgId }: { orgId: string | null }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const trackingUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tracking`;
  const snippet = `<!-- FlowCRM Tracking -->
<script>
(function() {
  var ORG_ID = "${orgId || 'SEU_ORG_ID'}";
  var ENDPOINT = "${trackingUrl}";
  var vid = localStorage.getItem("fc_vid") || (function() {
    var id = "v_" + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
    localStorage.setItem("fc_vid", id);
    return id;
  })();

  function track(eventType, extra) {
    var payload = {
      org_id: ORG_ID,
      visitor_id: vid,
      event_type: eventType || "pageview",
      page_url: location.href,
      page_title: document.title,
      referrer: document.referrer,
      metadata: extra || {}
    };
    navigator.sendBeacon(ENDPOINT, JSON.stringify(payload));
  }

  // Track pageview on load
  track("pageview");

  // Track navigation (SPA support)
  var oldPush = history.pushState;
  history.pushState = function() {
    oldPush.apply(this, arguments);
    setTimeout(function() { track("pageview"); }, 100);
  };

  // Expose for custom events
  window.FlowCRM = {
    track: track,
    identify: function(email) {
      vid = email;
      localStorage.setItem("fc_vid", email);
      track("identify", { email: email });
    }
  };
})();
</script>`;

  const copySnippet = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast({ title: "Snippet copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Rastreamento de Website
          </CardTitle>
          <CardDescription className="text-[10px]">
            Adicione este snippet ao seu site para rastrear visitantes e aumentar o lead score automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="rounded-md bg-muted p-4 text-[9px] font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre">
              {snippet}
            </pre>
            <Button
              variant="outline" size="sm"
              className="absolute top-2 right-2 h-7 text-[9px]"
              onClick={copySnippet}
            >
              {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium">Como funciona:</p>
            <ul className="text-[10px] text-muted-foreground space-y-1">
              <li>• <strong>Pageviews</strong> são registrados automaticamente como atividades</li>
              <li>• <strong>Identificação</strong>: chame <code className="bg-muted px-1 rounded">FlowCRM.identify("email@exemplo.com")</code> após formulários</li>
              <li>• <strong>Eventos customizados</strong>: <code className="bg-muted px-1 rounded">{'FlowCRM.track("demo_request", {"plan": "pro"})'}</code></li>
              <li>• <strong>Lead Score</strong>: +1 ponto por pageview, +5 por identify, +10 por evento customizado</li>
              <li>• Suporte a SPA (intercepta <code className="bg-muted px-1 rounded">history.pushState</code>)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Import/Export Tab ──
function ImportExportTab({ orgId, userId }: { orgId: string | null; userId?: string }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState<string | null>(null);

  const exportEntity = async (entity: string) => {
    if (!orgId) return;
    setExporting(entity);
    try {
      const { data, error } = await supabase.from(entity as any).select("*").eq("org_id", orgId);
      if (error) throw error;
      if (!data || data.length === 0) { toast({ title: "Sem dados para exportar" }); return; }

      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(","),
        ...data.map((row: any) => headers.map((h) => {
          const val = row[h];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${entity}_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `${data.length} registros exportados` });
    } catch (e: any) {
      toast({ title: "Erro na exportação", description: e.message, variant: "destructive" });
    }
    setExporting(null);
  };

  const entities = [
    { key: "contacts", label: "Contatos", icon: "👤" },
    { key: "companies", label: "Empresas", icon: "🏢" },
    { key: "deals", label: "Negócios", icon: "💼" },
    { key: "activities", label: "Atividades", icon: "📋" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Exportar Dados</CardTitle>
          <CardDescription className="text-[10px]">
            Exporte qualquer entidade como arquivo CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {entities.map((ent) => (
              <Button
                key={ent.key}
                variant="outline"
                className="h-auto py-3 flex flex-col gap-1"
                onClick={() => exportEntity(ent.key)}
                disabled={exporting === ent.key}
              >
                {exporting === ent.key ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <span className="text-lg">{ent.icon}</span>
                )}
                <span className="text-[10px]">{ent.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Importar Dados</CardTitle>
          <CardDescription className="text-[10px]">
            Importe contatos e empresas via CSV. Acesse a lista de contatos ou empresas e use o botão "Importar CSV".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-4 space-y-2">
            <p className="text-[10px] font-medium">Formatos suportados:</p>
            <ul className="text-[9px] text-muted-foreground space-y-1">
              <li>• <strong>CSV genérico</strong> — mapeamento de colunas manual</li>
              <li>• <strong>HubSpot Export</strong> — detecta automaticamente colunas "First Name", "Last Name", "Email"</li>
              <li>• <strong>Pipedrive Export</strong> — detecta "Person - Name", "Organization - Name"</li>
            </ul>
            <p className="text-[9px] text-muted-foreground mt-2">
              A importação inclui preview, mapeamento e detecção de duplicatas por email.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
