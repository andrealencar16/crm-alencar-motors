export const PUBLIC_FIELDS = ["id", "marca", "modelo", "versao", "ano_fabricacao", "ano_modelo", "km", "cor",
  "combustivel", "transmissao", "preco_venda", "descricao", "opcionais", "accepts_trade", "accepts_financing",
  "fotos", "status", "updated_at"] as const;

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backend response");
  return value as Record<string, unknown>;
}
export function photos(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error("Invalid photos");
  return [...value];
}
export function vehicle(value: unknown) {
  const row = object(value);
  if (row.status !== "disponivel" || PUBLIC_FIELDS.some((name) => row[name] === undefined)) {
    throw new Error("Invalid vehicle");
  }
  for (const name of ["marca", "modelo", "versao", "cor", "combustivel", "transmissao", "descricao"]) {
    if (row[name] !== null && typeof row[name] !== "string") throw new Error("Invalid text field");
  }
  for (const name of ["ano_fabricacao", "ano_modelo", "km", "preco_venda"]) {
    if (row[name] !== null && (typeof row[name] !== "number" || !Number.isFinite(row[name]))) throw new Error("Invalid numeric field");
  }
  if (typeof row.id !== "string" || typeof row.updated_at !== "string" ||
      typeof row.accepts_trade !== "boolean" || typeof row.accepts_financing !== "boolean" ||
      !Array.isArray(row.opcionais) || row.opcionais.some((item) => typeof item !== "string")) throw new Error("Invalid vehicle field");
  // No spreads of a database record: schema additions cannot become public.
  return {
    id: row.id, marca: row.marca, modelo: row.modelo, versao: row.versao,
    ano_fabricacao: row.ano_fabricacao, ano_modelo: row.ano_modelo, km: row.km, cor: row.cor,
    combustivel: row.combustivel, transmissao: row.transmissao, preco_venda: row.preco_venda,
    descricao: row.descricao, opcionais: row.opcionais, accepts_trade: row.accepts_trade,
    accepts_financing: row.accepts_financing, fotos: photos(row.fotos), status: row.status, updated_at: row.updated_at,
  };
}
