import { db } from "@/db";
import { backupRun, backupTask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateKey, assertKeyTaskAccess, jsonError } from "@/lib/auth/api-key";
import { enqueueVerify, testRestoreAvailable } from "@/lib/backup/verify";

type Params = Promise<{ runId: string }>;

// POST /api/v1/runs/:runId/verify            — check the file (fingerprint + read-back)
// POST /api/v1/runs/:runId/verify?level=restore — also test-restore it into a throwaway database
// Queues the check and returns 202; poll GET /api/v1/tasks/:id/runs for verifyStatus/verifyMessage.
export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const { runId } = await params;
    const key = await authenticateKey(req, "runs:trigger");
    const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
    if (!run) return Response.json({ error: "Not found" }, { status: 404 });
    await assertKeyTaskAccess(key, "runs:trigger", run.taskId);

    if (run.status !== "completed" || !run.filename) {
      return Response.json({ error: "Only a completed backup with a file can be checked." }, { status: 409 });
    }
    const level = new URL(req.url).searchParams.get("level") === "restore" ? "restore" : "check";
    if (level === "restore") {
      const [task] = await db.select({ engine: backupTask.engine }).from(backupTask).where(eq(backupTask.id, run.taskId)).limit(1);
      if (!task || !testRestoreAvailable(task.engine)) {
        return Response.json({ error: "Test restores aren't set up on this server." }, { status: 409 });
      }
    }

    await enqueueVerify([runId], level);
    return Response.json({ ok: true, runId, level, verifyStatus: "queued" }, { status: 202 });
  } catch (e) {
    return jsonError(e);
  }
}
