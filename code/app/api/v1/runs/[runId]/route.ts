import { db } from "@/db";
import { backupRun } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/auth/api-key";
import { deleteRun } from "@/lib/backup/runner";

type Params = Promise<{ runId: string }>;

export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const { runId } = await params;
    const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

    await authenticateRequest(req, "runs:delete", run.taskId);
    await deleteRun(runId);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
