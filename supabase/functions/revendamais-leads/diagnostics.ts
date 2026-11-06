/**
 * Privacy-safe validation diagnostics.
 * Only code-defined failure codes, code-defined field paths, JS type names and
 * numeric metrics are ever recorded. NEVER raw values, HTML, names, phones,
 * e-mails, payload fragments, tokens or URLs.
 */
export type DiagnosticDetail = Readonly<Record<string, number | string | boolean>>;
export type ValidationDiagnostic = Readonly<{ code: string; field: string; type?: string; detail?: DiagnosticDetail }>;

export class ValidationFailure extends Error {
  readonly diagnostic: ValidationDiagnostic;
  constructor(diagnostic: ValidationDiagnostic) {
    // Message kept identical to the legacy error so existing callers are unaffected.
    super("invalid_revendamais_payload");
    this.diagnostic = Object.freeze({ ...diagnostic });
  }
}

/** JS type only — never the value. */
export function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isSafeInteger(value) ? "integer" : Number.isFinite(value) ? "number_non_integer" : "number_non_finite";
  return typeof value;
}

export function diagnosticOf(error: unknown): ValidationDiagnostic | null {
  return error instanceof ValidationFailure ? error.diagnostic : null;
}

/** Single sink. Emits a fixed-shape JSON line with controlled keys only. */
export function logRejection(status: number, response: string, d: ValidationDiagnostic | null): void {
  try {
    console.warn(JSON.stringify({
      event: "revendamais_validation_rejected", http_status: status, response,
      failure_code: d?.code ?? "unspecified", field: d?.field ?? "unspecified",
      ...(d?.type ? { received_type: d.type } : {}), ...(d?.detail ? { detail: d.detail } : {}),
    }));
  } catch { /* logging must never alter the response */ }
}
