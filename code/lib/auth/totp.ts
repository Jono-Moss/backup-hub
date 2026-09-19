import crypto from "crypto";

// A from-scratch RFC 4226 (HOTP) / RFC 6238 (TOTP) implementation. This is
// a well-specified, narrow algorithm (unlike, say, WebAuthn's attestation
// verification) so implementing it directly is reasonable and avoids an
// extra dependency — but it must match the spec exactly, since any
// deviation either breaks every authenticator app or weakens the codes.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20)); // 160 bits, the RFC 4226 recommendation
}

function base32Encode(buffer: Buffer): string {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");

  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder) {
    const chunk = bits.slice(bits.length - remainder).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// RFC 4226 HOTP: HMAC-SHA1 over the counter, then "dynamic truncation" to
// pull a 31-bit integer out of the digest and reduce it mod 10^digits.
function hotp(secret: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

function currentCounter(time: number): number {
  return Math.floor(time / 1000 / STEP_SECONDS);
}

export function generateTotpCode(base32Secret: string, time = Date.now()): string {
  return hotp(base32Decode(base32Secret), currentCounter(time));
}

// Checks the code against the current 30s step and one step on either side,
// to tolerate normal clock drift between the server and the user's phone.
export function verifyTotpCode(base32Secret: string, token: string, windowSteps = 1): boolean {
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;

  const secret = base32Decode(base32Secret);
  const counter = currentCounter(Date.now());

  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    // Constant-time compare to avoid leaking how many characters matched
    // through response timing.
    const candidate = hotp(secret, counter + delta);
    if (
      candidate.length === clean.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))
    ) {
      return true;
    }
  }
  return false;
}

export function buildOtpAuthUri(opts: { secret: string; accountName: string; issuer: string }): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.accountName}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
