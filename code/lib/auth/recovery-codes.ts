import crypto from "crypto";

const RECOVERY_CODE_COUNT = 10;

// Each code is 10 random hex chars formatted as XXXXX-XXXXX for
// readability. Plaintext codes are only ever returned once, at generation
// time — only their hash is persisted, same pattern as sessions/API keys.
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
