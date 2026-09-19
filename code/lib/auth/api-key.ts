import { db } from "@/db";
import { apiKey, type Scope } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { hashApiKey } from "@/lib/backup/crypto";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Authenticate an incoming REST API request against a stored API key.
 * Throws AuthError (with an HTTP status) on any failure — callers should
 * catch this and turn it into a JSON error response.
 *
 * `taskId`, if provided, enforces that a task-scoped key can only act on
 * the task it's pinned to. Global keys (taskId = null) can act on any task.
 */
export async function authenticateRequest(
  req: Request,
  requiredScope: Scope,
  taskId?: string
) {
  const header = req.headers.get("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!raw) throw new AuthError("Missing API key (Authorization: Bearer <key>)", 401);

  const hashed = hashApiKey(raw);
  const [record] = await db
    .select()
    .from(apiKey)
    .where(and(eq(apiKey.hashedKey, hashed), isNull(apiKey.revokedAt)))
    .limit(1);

  if (!record) throw new AuthError("Invalid or revoked API key", 401);
  if (!record.scopes.includes(requiredScope)) {
    throw new AuthError(`API key missing required scope: ${requiredScope}`, 403);
  }
  if (record.taskId && taskId && record.taskId !== taskId) {
    throw new AuthError("API key is not scoped to this task", 403);
  }

  // fire-and-forget last-used tracking, don't block the request on it
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, record.id))
    .catch(() => {});

  return record;
}

export function jsonError(e: unknown) {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
