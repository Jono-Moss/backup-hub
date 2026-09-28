import { db } from "@/db";
import { backupTask, taskShare, appUser, SCOPES, type Scope } from "@/db/schema";
import { and, eq, or, isNotNull, desc } from "drizzle-orm";
import { requireUser, type SessionUser } from "./session";

// Who can do what on a task:
//   - the owner (backup_task.owner_id) has every scope, plus owner-only
//     actions (sharing, restoring a backup into the source database);
//   - anyone else has exactly the scopes in their task_share row;
//   - everyone else, admins included, has no access and gets "not found".
//
// Scopes are the same ones API keys use (see SCOPES in db/schema.ts).

export interface TaskAccess {
  isOwner: boolean;
  scopes: Scope[];
}

export function canDo(access: TaskAccess | null | undefined, scope: Scope): boolean {
  return !!access && access.scopes.includes(scope);
}

// Returns null when the task doesn't exist or the user has no access to it —
// callers should treat both identically so task IDs can't be probed.
export async function getTaskAccess(userId: string, taskId: string): Promise<TaskAccess | null> {
  const [task] = await db
    .select({ ownerId: backupTask.ownerId })
    .from(backupTask)
    .where(eq(backupTask.id, taskId))
    .limit(1);
  if (!task) return null;

  if (task.ownerId === userId) return { isOwner: true, scopes: [...SCOPES] };

  const [share] = await db
    .select({ scopes: taskShare.scopes })
    .from(taskShare)
    .where(and(eq(taskShare.taskId, taskId), eq(taskShare.userId, userId)))
    .limit(1);
  if (!share) return null;

  return { isOwner: false, scopes: share.scopes };
}

// For server actions. Throws if the user can't see the task at all, or lacks
// the given scope on it.
export async function requireTaskScope(
  taskId: string,
  scope: Scope
): Promise<{ user: SessionUser; access: TaskAccess }> {
  const user = await requireUser();
  const access = await getTaskAccess(user.id, taskId);
  if (!access) throw new Error("Task not found");
  if (!canDo(access, scope)) throw new Error("You don't have permission to do that on this task");
  return { user, access };
}

export async function requireTaskOwner(taskId: string): Promise<SessionUser> {
  const user = await requireUser();
  const access = await getTaskAccess(user.id, taskId);
  if (!access) throw new Error("Task not found");
  if (!access.isOwner) throw new Error("Only the task owner can do that");
  return user;
}

// Every task the user owns or has been granted at least "View tasks" on,
// with their own access attached.
export async function listAccessibleTasks(userId: string) {
  const rows = await db
    .select({
      task: backupTask,
      shareScopes: taskShare.scopes,
      ownerName: appUser.name,
    })
    .from(backupTask)
    .leftJoin(taskShare, and(eq(taskShare.taskId, backupTask.id), eq(taskShare.userId, userId)))
    .leftJoin(appUser, eq(appUser.id, backupTask.ownerId))
    .where(or(eq(backupTask.ownerId, userId), isNotNull(taskShare.id)))
    .orderBy(desc(backupTask.createdAt));

  return rows
    .map((r) => {
      const isOwner = r.task.ownerId === userId;
      const scopes: Scope[] = isOwner ? [...SCOPES] : (r.shareScopes ?? []);
      return { ...r.task, isOwner, scopes, ownerName: r.ownerName ?? "Unknown" };
    })
    .filter((t) => t.scopes.includes("tasks:read"));
}
