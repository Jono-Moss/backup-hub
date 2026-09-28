"use client";

import { deleteUser } from "@/app/users/actions";
import { DeleteWithFilesButton } from "./DeleteWithFilesButton";

export function DeleteUserButton({ userId }: { userId: string }) {
  return (
    <DeleteWithFilesButton
      buttonTitle="Delete"
      heading="Delete this user?"
      description={
        "Their sessions are revoked immediately, and all of their backup tasks, run history, recipients and API keys are removed from the app. This cannot be undone."
      }
      keepNote="The backup files of their tasks stay on the server, each in a folder named after its task id inside the backup directory, so you can still recover them by hand."
      confirmLabel="Delete user"
      onDelete={(deleteFiles) => deleteUser(userId, deleteFiles)}
    />
  );
}
