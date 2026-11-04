import { describe, it, expect } from "vitest";
import { validateFirstAccess } from "@/components/auth/SetPasswordGate";
import { readAuthLinkError } from "@/pages/Login";

describe("first access setup", () => {
  it("requires a full name", () => {
    expect(validateFirstAccess(" ", "secret1", "secret1", false)).toBe("Informe seu nome completo.");
  });
  it("rejects passwords shorter than 6", () => {
    expect(validateFirstAccess("Ana Lima", "12345", "12345", false)).toMatch(/mínimo de 6/);
  });
  it("rejects mismatched passwords", () => {
    expect(validateFirstAccess("Ana Lima", "secret1", "secret2", false)).toMatch(/igual/);
  });
  it("accepts valid input", () => {
    expect(validateFirstAccess("Ana Lima", "secret1", "secret1", false)).toBeNull();
  });
  it("after password saved, only the name is needed (retry)", () => {
    expect(validateFirstAccess("Ana Lima", "", "", true)).toBeNull();
  });
  it("detects expired invite links", () => {
    expect(readAuthLinkError("#error=access_denied&error_code=otp_expired", "")).toMatch(/expirou/);
    expect(readAuthLinkError("#error=access_denied&error_code=bad_jwt", "")).toMatch(/inválido/);
    expect(readAuthLinkError("#access_token=x&type=invite", "")).toBeNull();
  });
});
