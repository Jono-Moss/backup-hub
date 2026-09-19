import fs from "fs";
import { db } from "@/db";
import { backupRun } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authenticateRequest, jsonError } from "@/lib/auth/api-key";
import { getRunFilePath } from "@/lib/backup/runner";

type Params = Promise<{ runId: string }>;

// Streams the raw backup file. If the task has encryption enabled, this is
// the .enc file — the caller decrypts locally with the backup password.
// We deliberately never decrypt server-side for a download, so the backup
// password is never needed (or held) outside the cron/manual run itself.
export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const { runId } = await params;
    const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
    if (!run || !run.filename) return Response.json({ error: "Run not found" }, { status: 404 });

    await authenticateRequest(req, "runs:download", run.taskId);

    const filePath = getRunFilePath(run.taskId, run.filename);
    const stat = await fs.promises.stat(filePath).catch(() => null);
    if (!stat) return Response.json({ error: "Backup file missing on disk" }, { status: 410 });

    const stream = fs.createReadStream(filePath);
    return new Response(stream as any, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${run.filename}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
