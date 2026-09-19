import { db } from "@/db";
import { backupRun } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/auth/api-key";
import { runBackupForTask } from "@/lib/backup/runner";

type Params = Promise<{ id: string }>;

// GET /api/v1/tasks/:id/runs — run history for a task
export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await authenticateRequest(req, "tasks:read", id);
    const runs = await db
      .select()
      .from(backupRun)
      .where(eq(backupRun.taskId, id))
      .orderBy(desc(backupRun.startedAt));
    return Response.json(runs);
  } catch (e) {
    return jsonError(e);
  }
}

// POST /api/v1/tasks/:id/runs — trigger a backup now
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await authenticateRequest(req, "runs:trigger", id);
    const result = await runBackupForTask(id, "api");
    return Response.json(result, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
