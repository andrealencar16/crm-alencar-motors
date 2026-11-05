export type Sort = "preco_asc" | "preco_desc" | "ano_desc" | "recentes";
export type Query = {
  page: number; limit: number; sort: Sort;
  marca?: string; modelo?: string; ano_min?: number; ano_max?: number;
  preco_min?: number; preco_max?: number; combustivel?: string; transmissao?: string;
};
const fuels = ["flex", "gasolina", "etanol", "diesel", "eletrico", "hibrido"];
const transmissions = ["manual", "automatica", "cvt", "automatizada"];
const sorts: Sort[] = ["preco_asc", "preco_desc", "ano_desc", "recentes"];
const known = ["page", "limit", "sort", "marca", "modelo", "ano_min", "ano_max", "preco_min", "preco_max", "combustivel", "transmissao"];
export class InvalidQuery extends Error {}

export function parseQuery(params: URLSearchParams): Query {
  for (const name of params.keys()) {
    if (!known.includes(name) || params.getAll(name).length !== 1) throw new InvalidQuery();
  }
  const integer = (name: string, fallback?: number, maximum = 9999) => {
    const raw = params.get(name);
    if (raw === null) return fallback;
    if (!/^[0-9]{1,10}$/.test(raw)) throw new InvalidQuery();
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw new InvalidQuery();
    return n;
  };
  const price = (name: string) => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    if (!/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(raw)) throw new InvalidQuery();
    return Number(raw);
  };
  const text = (name: string) => {
    const raw = params.get(name);
    if (raw === null) return undefined;
    const value = raw.trim();
    if (!value || [...value].length > 100 || /[\u0000-\u001f\u007f]/.test(value)) throw new InvalidQuery();
    return value;
  };
  const sort = params.get("sort") ?? "recentes";
  if (!sorts.includes(sort as Sort)) throw new InvalidQuery();
  const q: Query = {
    page: integer("page", 1, 2147483647)!, limit: integer("limit", 20, 100)!, sort: sort as Sort,
    marca: text("marca"), modelo: text("modelo"),
    ano_min: integer("ano_min"), ano_max: integer("ano_max"),
    preco_min: price("preco_min"), preco_max: price("preco_max"),
    combustivel: text("combustivel"), transmissao: text("transmissao"),
  };
  if ((q.ano_min !== undefined && q.ano_max !== undefined && q.ano_min > q.ano_max) ||
      (q.preco_min !== undefined && q.preco_max !== undefined && q.preco_min > q.preco_max) ||
      (q.combustivel !== undefined && !fuels.includes(q.combustivel)) ||
      (q.transmissao !== undefined && !transmissions.includes(q.transmissao)) ||
      (q.page - 1) * q.limit > 10000) throw new InvalidQuery();
  return q;
}

export function queryArgs(q: Query): Record<string, unknown> {
  return Object.fromEntries(Object.entries(q).filter(([, value]) => value !== undefined)
    .map(([name, value]) => [`p_${name}`, value]));
}
