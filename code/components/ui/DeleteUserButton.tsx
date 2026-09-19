"use client";

import { deleteUser } from "@/app/users/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function DeleteUserButton({
    userId,
    disabled,
}: {
    userId: string;
    disabled?: boolean;
}) {
    return (
        <StandardActionButton
            title="Delete"
            pendingTitle="Deleting..."
            variant="danger"
            action={() => deleteUser(userId)}
            confirmMessage="Delete this user? Their sessions will be revoked immediately."
            disabled={disabled}
            tooltip={disabled ? "You can't delete your own account" : undefined}
        />
    );
}