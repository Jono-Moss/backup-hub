import { db } from "@/db";
import { apiKey, type Scope } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { hashApiKey } from "@/lib/backup/crypto";
import { getTaskAccess, canDo } from "@/lib/auth/task-access";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Step 1 of API auth: validate the bearer key and that it carries the scope.
 * Does not look at any task. Routes that only learn the task id after a
 * lookup (e.g. /runs/:runId) call this first, then assertKeyTaskAccess.
 */
export async function authenticateKey(req: Request, requiredScope: Scope) {
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

  // fire-and-forget last-used tracking, don't block the request on it
  db.update(apiKey)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKey.id, record.id))
    .catch(() => {});

  return record;
}

/**
 * Step 2: a key acts as the user who created it, so on a given task it can
 * only do what BOTH the key's scopes and that user's own permission on the
 * task allow. Unshared or reduced access takes effect on the key immediately.
 * A task the user can't see is reported as 404, same as one that doesn't exist.
 */
export async function assertKeyTaskAccess(
  record: { userId: string; scopes: Scope[]; taskId: string | null },
  requiredScope: Scope,
  taskId: string
) {
  if (record.taskId && record.taskId !== taskId) {
    throw new AuthError("API key is not scoped to this task", 403);
  }
  const access = await getTaskAccess(record.userId, taskId);
  if (!access) throw new AuthError("Not found", 404);
  if (!canDo(access, requiredScope)) {
    throw new AuthError(`You don't have the ${requiredScope} permission on this task`, 403);
  }
  return access;
}

/**
 * Authenticate an incoming REST API request against a stored API key.
 * Throws AuthError (with an HTTP status) on any failure — callers should
 * catch this and turn it into a JSON error response.
 *
 * With a `taskId`, also enforces the key's task pin and the owning user's
 * permission on that task (see assertKeyTaskAccess). Without one, only the
 * key itself is validated — list/create endpoints scope their results to the
 * key owner's accessible tasks themselves.
 */
export async function authenticateRequest(req: Request, requiredScope: Scope, taskId?: string) {
  const record = await authenticateKey(req, requiredScope);
  if (taskId) await assertKeyTaskAccess(record, requiredScope, taskId);
  return record;
}

export function jsonError(e: unknown) {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
