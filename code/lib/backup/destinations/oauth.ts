// Small helpers shared by the OAuth-based destinations (Google Drive, OneDrive).

/** POST application/x-www-form-urlencoded and parse the JSON reply (OAuth endpoints answer errors as JSON too). */
export async function postForm(url: string, params: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Reads the claims out of an OIDC id_token, only to show the user which
 * account they just connected. Deliberately NOT verified — the token
 * arrived directly from the provider's token endpoint over TLS, and nothing
 * security-relevant depends on these values.
 */
export function idTokenClaims(idToken?: string): Record<string, any> {
  if (!idToken) return {};
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}
