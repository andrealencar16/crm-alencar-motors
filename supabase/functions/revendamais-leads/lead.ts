/** Internal contract only. These are NOT Revenda Mais payload field names. */
export type Lead = Readonly<{
  name: string | null;
  phone: string | null;
  email: string | null;
  title: string;
  firstMessage: string | null;
  portal: string | null;
  externalId: string | null; // Reserved for a stable commercial ID; current adapter returns null.
}>;
export type LeadField = "name" | "phone" | "email" | "title" | "firstMessage" | "portal" | "externalId";
export type AdaptedLead = Partial<Record<LeadField, unknown>>;
// Trusted code adapter, versioned and implemented only after official payload confirmation.
export type LeadAdapter = (raw: unknown) => AdaptedLead;
export type Normalized = { ok: true; lead: Lead } | { ok: false; code: "invalid_payload" };

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max || /\u0000/.test(value)) throw new Error();
  return value.trim() || null;
}

export function normalizeBrazilianPhone(value: unknown): string | null {
  const input = text(value, 40);
  if (!input) return null;
  if (!/^\+?[0-9\s().-]+$/.test(input)) throw new Error();
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  // Do not infer area code, carrier prefix or missing ninth digit.
  if (!/^[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(digits)) throw new Error();
  if (input.startsWith("+") && !input.startsWith("+55")) throw new Error();
  return `+55${digits}`;
}

export function normalizeLead(raw: unknown, adapter: LeadAdapter): Normalized {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid_payload" };
    const fields = adapter(raw);
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { ok: false, code: "invalid_payload" };
    const name = text(fields.name, 200)?.replace(/\s+/g, " ") ?? null;
    const phone = normalizeBrazilianPhone(fields.phone);
    const email = text(fields.email, 254)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, code: "invalid_payload" };
    const title = text(fields.title, 300);
    const firstMessage = text(fields.firstMessage, 10000);
    const portal = text(fields.portal, 100);
    const externalId = text(fields.externalId, 200);
    // Empty/unrecognized payload must not become a fabricated lead.
    if (![name, phone, email, title, firstMessage, portal, externalId].some(Boolean)) return { ok: false, code: "invalid_payload" };
    return { ok: true, lead: Object.freeze({ name, phone, email, title: title ?? "Interesse recebido pelo Revenda Mais", firstMessage, portal, externalId }) };
  } catch {
    return { ok: false, code: "invalid_payload" };
  }
}
