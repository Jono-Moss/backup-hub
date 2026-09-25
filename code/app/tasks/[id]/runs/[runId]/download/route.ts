import fs from "fs";
import { Readable } from "stream";
import { db } from "@/db";
import { backupRun } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/session";
import { getRunFilePath } from "@/lib/backup/runner";

type Params = Promise<{ id: string; runId: string }>;

// First-party UI download — gated by the logged-in session rather than an
// API key. External callers should use /api/v1/runs/:runId/download instead.
export async function GET(_req: Request, { params }: { params: Params }) {
  if (!(await getCurrentUser())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id, runId } = await params;
  const [run] = await db.select().from(backupRun).where(eq(backupRun.id, runId)).limit(1);
  if (!run || !run.filename || run.taskId !== id) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = getRunFilePath(run.taskId, run.filename);
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat) return new Response("Backup file missing on disk", { status: 410 });

  const stream = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${run.filename}"`,
      "Content-Length": String(stat.size),
    },
  });
}