import { db } from "@/db";
import { backupTask, ENGINES } from "@/db/schema";
import { authenticateRequest, jsonError } from "@/lib/auth/api-key";
import { wrapConnection, wrapSecret } from "@/lib/backup/crypto";
import { resyncTask } from "@/lib/backup/scheduler";
import { notifySystemEvent } from "@/lib/notifications/notify";
import { v4 as uuid } from "uuid";

// GET /api/v1/tasks — list tasks (connection secrets never included in the response)
export async function GET(req: Request) {
  try {
    await authenticateRequest(req, "tasks:read");
    const tasks = await db.select().from(backupTask);
    return Response.json(
      tasks.map(({ encryptedConnection, encryptedBackupPassword, ...safe }) => safe)
    );
  } catch (e) {
    return jsonError(e);
  }
}

// POST /api/v1/tasks — create a task
// Body: { name, engine, connection: {host,port,user,password,database,ssl?},
//         cronExpression?, retentionCount?, encryptionEnabled?, backupPassword? }
export async function POST(req: Request) {
  try {
    const key = await authenticateRequest(req, "tasks:write");
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
