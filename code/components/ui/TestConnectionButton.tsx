"use client";

import { useState } from "react";
import { testConnection } from "@/app/tasks/actions";
import { StandardActionButton } from "./standard/StandardActionButton";

export function TestConnectionButton() {
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  async function handleClick() {
    const form = document.getElementById("task-form") as HTMLFormElement;
    const data = new FormData(form);

    const res = await testConnection(data);
    setResult(res);

  }

  return (
    <div className="flex items-center gap-3">
      <StandardActionButton
        action={handleClick}
        variant="outline"
        title="Test connection"
        pendingTitle="Testing…"
      />
      {result && (
        <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? "Connected successfully" : `Failed: ${result.message ?? "unknown error"}`}
        </span>
      )}
    </div>
  );
}