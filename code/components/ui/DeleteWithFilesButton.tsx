"use client";

import { useState, useTransition } from "react";

// Delete confirmation that also asks what to do with backup files on disk.
// The checkbox starts UNCHECKED: the safe default is to keep the files, so a
// mistaken delete can still be undone by hand from the server.
export function DeleteWithFilesButton({
  buttonTitle,
  heading,
  description,
  keepNote,
  confirmLabel = "Delete",
  onDelete,
}: {
  buttonTitle: string;
  heading: string;
  description: string;
  keepNote: string;
  confirmLabel?: string;
  onDelete: (deleteFiles: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isPending, startTransition] = useTransition();

  const close = () => {
    if (isPending) return;
    setOpen(false);
    setDeleteFiles(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md font-medium px-5 py-2.5 text-sm text-danger hover:underline transition-colors"
      >
        {buttonTitle}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div className="w-full max-w-md rounded-md border border-line bg-white p-6 shadow-lg">
            <h2 className="text-base font-semibold text-ink mb-1">{heading}</h2>
            <p className="text-sm text-ink mb-4 whitespace-pre-line">{description}</p>

            <label className="flex items-start gap-2 mb-2">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                disabled={isPending}
                className="mt-0.5"
              />
              <span className="text-sm text-ink">Also permanently delete the backup files from disk</span>
            </label>
            <p className="text-xs text-muted mb-6">
              {deleteFiles
                ? "The backup files will be erased and cannot be recovered."
                : keepNote}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                autoFocus
                disabled={isPending}
                className="rounded-md border border-line text-ink text-sm font-medium px-4 py-2 hover:border-primary transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await onDelete(deleteFiles);
                  })
                }
                className="rounded-md bg-danger border-b-danger-dark text-white text-sm font-medium px-4 py-2 border-b-2 hover:border-b-transparent transition-colors disabled:opacity-40"
              >
                {isPending ? "Deleting..." : deleteFiles ? `${confirmLabel} and erase files` : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
