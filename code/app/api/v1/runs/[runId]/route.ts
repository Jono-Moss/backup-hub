import { db } from "@/db";
import { backupRun } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateKey, assertKeyTaskAccess, jsonError } from "@/lib/auth/api-key";
import { deleteRun } from "@/lib/backup/runner";

type Params = Promise<{ runId: string }>;

export async function DELETE(req: Request, { params }: { params: Params }) {
  try {
    const { runId } = await params;
    // Validate the key before touching the DB, so an unauthenticated caller
    // can't tell which run ids exist.
    const key = await authenticateKey(req, "runs:delete");
    const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
    if (!run) return Response.json({ error: "Not found" }, { status: 404 });

    await assertKeyTaskAccess(key, "runs:delete", run.taskId);
    await deleteRun(runId);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
