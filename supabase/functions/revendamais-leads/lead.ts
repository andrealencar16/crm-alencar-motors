import { ValidationFailure, diagnosticOf, typeOf } from "./diagnostics.ts";
import type { ValidationDiagnostic } from "./diagnostics.ts";

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
export type Normalized = { ok: true; lead: Lead } | { ok: false; code: "invalid_payload"; diagnostic?: ValidationDiagnostic };

function fail(code: string, field: string, type?: string, detail?: ValidationDiagnostic["detail"]): never {
  throw new ValidationFailure({ code, field, type, detail });
}
function text(value: unknown, max: number, field = "value"): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") fail("unexpected_type", field, typeOf(value), { expected: "string" });
  if (value.length > max) fail("length_exceeded", field, "string", { length: value.length, limit: max });
  if (/\u0000/.test(value)) fail("nul_character", field, "string");
  return value.trim() || null;
}

export function normalizeBrazilianPhone(value: unknown): string | null {
  const input = text(value, 40, "phone");
  if (!input) return null;
  if (!/^\+?[0-9\s().-]+$/.test(input)) fail("phone_invalid_characters", "phone", "string", { length: input.length });
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  // Do not infer area code, carrier prefix or missing ninth digit.
  if (!/^[1-9][0-9](?:[2-5][0-9]{7}|9[0-9]{8})$/.test(digits)) fail("phone_pattern_mismatch", "phone", "string", { digits: digits.length });
  if (input.startsWith("+") && !input.startsWith("+55")) fail("phone_non_brazilian_prefix", "phone", "string");
  return `+55${digits}`;
}

export function normalizeLead(raw: unknown, adapter: LeadAdapter): Normalized {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid_payload", diagnostic: { code: "unexpected_type", field: "payload", type: typeOf(raw) } };
    const fields = adapter(raw);
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return { ok: false, code: "invalid_payload", diagnostic: { code: "adapter_output_invalid", field: "adapter" } };
    const name = text(fields.name, 200, "name")?.replace(/\s+/g, " ") ?? null;
    const phone = normalizeBrazilianPhone(fields.phone);
    const email = text(fields.email, 254, "email")?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, code: "invalid_payload", diagnostic: { code: "email_pattern_mismatch", field: "email", type: "string" } };
    const title = text(fields.title, 300, "title");
    const firstMessage = text(fields.firstMessage, 10000, "firstMessage");
    const portal = text(fields.portal, 100, "portal");
    const externalId = text(fields.externalId, 200, "externalId");
    // Empty/unrecognized payload must not become a fabricated lead.
    if (![name, phone, email, title, firstMessage, portal, externalId].some(Boolean)) return { ok: false, code: "invalid_payload", diagnostic: { code: "no_usable_fields", field: "lead" } };
    return { ok: true, lead: Object.freeze({ name, phone, email, title: title ?? "Interesse recebido pelo Revenda Mais", firstMessage, portal, externalId }) };
  } catch (error) {
    // Only the code-defined diagnostic is kept; the error message/value is discarded.
    const diagnostic = diagnosticOf(error);
    return diagnostic ? { ok: false, code: "invalid_payload", diagnostic } : { ok: false, code: "invalid_payload" };
  }
}
