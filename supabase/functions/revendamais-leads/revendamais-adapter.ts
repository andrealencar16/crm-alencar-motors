import type { AdaptedLead, LeadAdapter } from "./lead.ts";

/** Configuration is trusted server code, never derived from payload fields. */
export type RevendaMaisConfig = {
  authorizedDealerId: string;
  // Leave absent until the vendor confirms BOTH enums. No assumed numeric values.
  customerInteraction?: { direction: number; typeIds: readonly number[] };
};
export type Interaction = Readonly<{
  leadId: string | null; direction: number | null; typeId: number | null;
  text: string | null; createdAt: string | null;
}>;
export type RevendaMaisEvent = {
  fields: AdaptedLead;
  metadata: {
    dealerId: string; leadId: string | null; channelId: string | null;
    createdAt: string | null; timezone: "unspecified";
    interactions: readonly Interaction[];
    messageSelection: "unconfirmed_sender" | "none" | "ambiguous_order" | "selected";
    identity: "available" | "missing_or_invalid";
  };
};

function invalid(): never { throw new Error("invalid_revendamais_payload"); }
function identifier(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9][0-9]{0,39}$/.test(value) ? value : null;
}
function str(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max || value.includes("\0")) invalid();
  return value.trim() || null;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function enumNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function localDate(value: unknown): string | null {
  const s = str(value, 19);
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) invalid();
  const [y, month, day, h, min, sec] = m.slice(1).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || h > 23 || min > 59 || sec > 59) invalid();
  return s; // Do not pass through Date.parse/toISOString or assign any timezone.
}

// This is deliberately a conservative text extractor, NOT an HTML sanitizer.
// Its output must still only be rendered as text (never innerHTML/Markdown HTML).
export function htmlToPlainText(html: string): string {
  if (html.length > 12000) invalid();
  const blocked = new Set(["script", "style", "iframe", "object", "svg", "math", "template", "noscript"]);
  const voids = new Set(["br", "hr", "img", "input", "meta", "link", "wbr", "area", "base", "embed", "source", "track", "param", "col"]);
  const suppressed: string[] = [];
  let result = "", depth = 0, tags = 0;
  for (let i = 0; i < html.length;) {
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[i] !== "<") { if (!suppressed.length) result += html[i]; i++; continue; }
    let j = i + 1, quote = "";
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) { if (c === quote) quote = ""; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    // Malformed tag remainder is dropped conservatively.
    if (j === html.length) break;
    if (++tags > 512) invalid();
    const tag = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(html.slice(i, j + 1));
    if (tag) {
      const close = !!tag[1], name = tag[2].toLowerCase();
      if (close) {
        depth = Math.max(0, depth - 1);
        if (suppressed.at(-1) === name) suppressed.pop();
      } else if (!voids.has(name)) {
        if (++depth > 32) invalid();
        if (blocked.has(name)) suppressed.push(name);
      }
      if (!suppressed.length) result += " ";
    }
    i = j + 1;
  }
  // Decode once only, AFTER stripping tags. Decoded markup remains literal text.
  const entities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç" };
  result = result.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (original, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity] ?? original;
    const n = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : " ";
  });
  return result.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Reject pathological JSON even for direct callers bypassing the HTTP parser. */
function boundedJson(raw: unknown): void {
  const seen = new Set<object>();
  let nodes = 0, characters = 0;
  function walk(value: unknown, depth: number): void {
    if (++nodes > 2048 || depth > 8) invalid();
    if (value === null || typeof value === "boolean") return;
    if (typeof value === "string") { characters += value.length; if (characters > 65536) invalid(); return; }
    if (typeof value === "number") { if (!Number.isFinite(value)) invalid(); return; }
    if (typeof value !== "object" || !value || seen.has(value)) invalid();
    if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) invalid();
    seen.add(value);
    const keys = Object.keys(value);
    if (keys.length > 128) invalid();
    for (const key of keys) {
      characters += key.length;
      if (key.length > 200 || characters > 65536) invalid();
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !('value' in d)) invalid();
      walk(d.value, depth + 1);
    }
    seen.delete(value);
  }
  walk(raw, 0);
  if (new TextEncoder().encode(JSON.stringify(raw)).length > 65536) invalid();
}

export function createRevendaMaisAdapter(config: RevendaMaisConfig): {
  map: LeadAdapter; inspect: (raw: unknown) => RevendaMaisEvent;
} {
  const dealer = identifier(config.authorizedDealerId);
  if (!dealer) throw new Error("invalid_revendamais_configuration");
  const policy = config.customerInteraction ? {
    direction: config.customerInteraction.direction, typeIds: [...config.customerInteraction.typeIds],
  } : null;
  if (policy && (enumNumber(policy.direction) === null || !policy.typeIds.length || policy.typeIds.length > 20 || policy.typeIds.some(n => enumNumber(n) === null))) {
    throw new Error("invalid_revendamais_configuration");
  }
  function inspect(raw: unknown): RevendaMaisEvent {
    boundedJson(raw);
    const p = record(raw);
    if (identifier(p.dealer_id) !== dealer) throw new Error("revendamais_dealer_mismatch");
    const leadId = identifier(p.id);
    const channelId = identifier(p.lead_channel_id);
    if (p.lead_channel_id != null && channelId === null) invalid();
    if (p.interations != null && !Array.isArray(p.interations)) invalid();
    const input = (p.interations ?? []) as unknown[];
    if (input.length > 50) invalid();
    const interactions = input.map(value => {
      const item = record(value), interactionLead = identifier(item.lead_id);
      if (item.lead_id != null && (!interactionLead || (leadId && interactionLead !== leadId))) invalid();
      const html = str(item.html, 12000);
      return Object.freeze({ leadId: interactionLead, direction: enumNumber(item.direction),
        typeId: enumNumber(item.type_id), text: html ? htmlToPlainText(html) || null : null,
        createdAt: localDate(item.created_at) });
    });
    let selection: RevendaMaisEvent["metadata"]["messageSelection"] = policy ? "none" : "unconfirmed_sender";
    let firstMessage: string | null = null;
    if (policy && leadId) {
      const candidates = interactions.filter(i => i.leadId === leadId && i.direction === policy.direction && i.typeId !== null && policy.typeIds.includes(i.typeId) && i.text);
      if (candidates.length) {
        if (candidates.some(i => !i.createdAt)) selection = "ambiguous_order";
        else {
          candidates.sort((a, b) => a.createdAt! < b.createdAt! ? -1 : a.createdAt! > b.createdAt! ? 1 : 0);
          const earliest = candidates.filter(i => i.createdAt === candidates[0].createdAt);
          if (new Set(earliest.map(i => i.text)).size > 1) selection = "ambiguous_order";
          else { firstMessage = candidates[0].text; selection = "selected"; }
        }
      }
    }
    const channel = str(p.channel_name, 12000);
    return { fields: {
      name: str(p.client_name, 200), phone: str(p.client_phone, 40), email: null,
      title: str(p.title, 300), firstMessage, portal: channel ? htmlToPlainText(channel) || null : null,
      // Namespace encodes the requested logical identity; raw provider ID stays in metadata.
      externalId: leadId ? `dealer:${dealer}:lead:${leadId}` : null,
    }, metadata: { dealerId: dealer, leadId, channelId, createdAt: localDate(p.created_at), timezone: "unspecified",
      interactions: Object.freeze(interactions), messageSelection: selection, identity: leadId ? "available" : "missing_or_invalid" } };
  }
  return { inspect, map: (raw) => inspect(raw).fields };
}
