import { db } from "@/db";
import { backupTask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/auth/api-key";
import { wrapConnection, wrapSecret } from "@/lib/backup/crypto";
import { resyncTask, unscheduleTask } from "@/lib/backup/scheduler";
import { notifySystemEvent } from "@/lib/notifications/notify";

type Params = Promise<{ id: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await authenticateRequest(req, "tasks:read", id);
    const [task] = await db.select().from(backupTask).where(eq(backupTask.id, id)).limit(1);
    if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
    const { encryptedConnection, encryptedBackupPassword, ...safe } = task;
    return Response.json(safe);
  } catch (e) {
    return jsonError(e);
  }
}

// PATCH — partial update. Only fields present in the body are changed.
export async function PATCH(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await authenticateRequest(req, "tasks:write", id);
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.cronExpression !== undefined) updates.cronExpression = body.cronExpression;
    if (body.retentionCount !== undefined) updates.retentionCount = body.retentionCount;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.encryptionEnabled !== undefined) updates.encryptionEnabled = body.encryptionEnabled;
    if (body.connection !== undefined) updates.encryptedConnection = wrapConnection(body.connection);
    if (body.backupPassword !== undefined) updates.encryptedBackupPassword = wrapSecret(body.backupPassword);

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    await db.update(backupTask).set(updates).where(eq(backupTask.id, id));
    await resyncTask(id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await authenticateRequest(req, "tasks:write", id);
    const [task] = await db.select().from(backupTask).where(eq(backupTask.id, id)).limit(1);

    unscheduleTask(id);
    await db.delete(backupTask).where(eq(backupTask.id, id));

    if (task) {
      notifySystemEvent("task_deleted", `Task "${task.name}" was deleted via the API.`).catch((err) =>
        console.error("[notify] task_deleted email failed:", err)
      );
    }

    // Note: this does NOT delete existing backup_run rows or files on disk —
    // callers that want that should delete runs explicitly first. This keeps
    // "delete task" from silently destroying backup history/files.
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
