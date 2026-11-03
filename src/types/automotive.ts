// Tipos espelhando o schema Fase 2 (vehicles, trade_ins, service_reminders, purchase_history).
// supabase/types.ts ainda não foi regenerado — usar estes tipos nos queries.

export type VehicleStatus = "disponivel" | "reservado" | "vendido" | "em_preparacao";
export type Combustivel = "flex" | "gasolina" | "etanol" | "diesel" | "eletrico" | "hibrido";
export type Transmissao = "manual" | "automatica" | "cvt" | "automatizada";

export interface Vehicle {
  id: string;
  org_id: string;
  owner_id: string | null;
  marca: string;
  modelo: string;
  versao: string | null;
  ano_fabricacao: number | null;
  ano_modelo: number | null;
  km: number | null;
  cor: string | null;
  placa: string | null;
  chassi: string | null;
  renavam: string | null;
  combustivel: Combustivel | null;
  transmissao: Transmissao | null;
  preco_venda: number | null;
  preco_custo: number | null;
  status: VehicleStatus;
  fotos: string[];
  deal_id_atual: string | null;
  data_entrada: string;
  fipe_code: string | null;
  fipe_price: number | null;
  created_at: string;
  updated_at: string;
}

export type TradeInStatus = "aguardando" | "avaliado" | "aceito" | "rejeitado";
export type TradeInCondicao = "excelente" | "bom" | "regular" | "ruim";

export interface TradeIn {
  id: string;
  org_id: string;
  owner_id: string | null;
  deal_id: string | null;
  contato_id: string | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  km: number | null;
  cor: string | null;
  condicao: TradeInCondicao | null;
  fotos: string[];
  estimativa_fipe: number | null;
  estimativa_ia: number | null;
  estimativa_ia_justificativa: string | null;
  valor_final_ofertado: number | null;
  status: TradeInStatus;
  created_at: string;
  updated_at: string;
}

export type ServiceReminderTipo =
  | "revisao_km"
  | "revisao_tempo"
  | "ipva"
  | "seguro"
  | "licenciamento";
export type ServiceReminderStatus = "pendente" | "enviado" | "concluido" | "cancelado";

export interface ServiceReminder {
  id: string;
  org_id: string;
  contato_id: string | null;
  vehicle_id: string | null;
  tipo: ServiceReminderTipo;
  data_vencimento: string;
  status: ServiceReminderStatus;
  ultimo_alerta_em: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "avista" | "financiado" | "consorcio" | "leasing";

export interface PurchaseHistory {
  id: string;
  org_id: string;
  contato_id: string | null;
  vehicle_id: string | null;
  deal_id: string | null;
  data_compra: string;
  valor: number;
  payment_method: PaymentMethod | null;
  financiamento_banco: string | null;
  created_at: string;
}

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  disponivel: "Disponível",
  reservado: "Reservado",
  vendido: "Vendido",
  em_preparacao: "Em preparação",
};

export const TRADE_IN_STATUS_LABEL: Record<TradeInStatus, string> = {
  aguardando: "Aguardando",
  avaliado: "Avaliado",
  aceito: "Aceito",
  rejeitado: "Rejeitado",
};

export const REMINDER_TIPO_LABEL: Record<ServiceReminderTipo, string> = {
  revisao_km: "Revisão por KM",
  revisao_tempo: "Revisão por tempo",
  ipva: "IPVA",
  seguro: "Seguro",
  licenciamento: "Licenciamento",
};

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
