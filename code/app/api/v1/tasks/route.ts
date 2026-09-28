import { db } from "@/db";
import { backupTask, ENGINES } from "@/db/schema";
import { authenticateRequest, jsonError, AuthError } from "@/lib/auth/api-key";
import { listAccessibleTasks } from "@/lib/auth/task-access";
import { wrapConnection, wrapSecret } from "@/lib/backup/crypto";
import { resyncTask } from "@/lib/backup/scheduler";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { v4 as uuid } from "uuid";

// GET /api/v1/tasks — list the tasks the key's owner can see: ones they own
// plus ones shared with them (connection secrets never included). A key
// pinned to one task only ever sees that task. `permissions` is what the
// owner may do on each task; the key's own scopes narrow that further.
export async function GET(req: Request) {
  try {
    const key = await authenticateRequest(req, "tasks:read");
    const tasks = (await listAccessibleTasks(key.userId)).filter((t) => !key.taskId || t.id === key.taskId);
    return Response.json(
      tasks.map(({ encryptedConnection, encryptedBackupPassword, scopes, ...safe }) => ({
        ...safe,
        permissions: scopes,
      }))
    );
  } catch (e) {
    return jsonError(e);
  }
}

// POST /api/v1/tasks — create a task, owned by the user who owns the API key
// Body: { name, engine, connection: {host,port,user,password,database,ssl?},
//         cronExpression?, retentionCount?, encryptionEnabled?, backupPassword? }
export async function POST(req: Request) {
  try {
    const key = await authenticateRequest(req, "tasks:write");
    if (key.taskId) {
      throw new AuthError("A key scoped to a single task can't create new tasks", 403);
    }
    const body = await req.json();

    if (!body.name || !body.engine || !body.connection) {
      return Response.json({ error: "name, engine, and connection are required" }, { status: 400 });
    }
    if (!ENGINES.includes(body.engine)) {
      return Response.json({ error: `engine must be one of: ${ENGINES.join(", ")}` }, { status: 400 });
    }

    const id = uuid();
    await db.insert(backupTask).values({
      id,
      ownerId: key.userId,
      name: body.name,
      engine: body.engine,
      encryptedConnection: wrapConnection(body.connection),
      cronExpression: body.cronExpression ?? "0 3 * * *",
      retentionCount: body.retentionCount ?? 7,
      encryptionEnabled: !!body.encryptionEnabled,
      encryptedBackupPassword: body.backupPassword ? wrapSecret(body.backupPassword) : null,
    });

    await resyncTask(id);

    notifySystemEvent("task_created", `Task "${body.name}" was created via the API (key: ${key.name}).`).catch(
      (err) => console.error("[notify] task_created email failed:", err)
    );

    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
