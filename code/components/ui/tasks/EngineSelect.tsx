"use client";

import { useState } from "react";
import type { Engine } from "@/db/schema";
import { ENGINE_COMPATIBILITY, ENGINE_LABELS } from "@/lib/backup/engines/labels";

const ENGINE_OPTIONS = Object.keys(ENGINE_LABELS) as Engine[];

// The new-task engine picker. Underneath, only the selected engine's note on
// which compatible databases it also covers — and, for MongoDB, the "auth
// database" the user is defined in (sent as authSource).
export function EngineSelect() {
  const [engine, setEngine] = useState<Engine>(ENGINE_OPTIONS[0]);

  return (
    <div>
      <label className="block text-sm text-ink mb-1" htmlFor="engine">
        Database engine
      </label>
      <select
        id="engine"
        name="engine"
        value={engine}
        onChange={(e) => setEngine(e.target.value as Engine)}
        aria-describedby="engine-compatibility"
        className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {ENGINE_OPTIONS.map((e) => (
          <option key={e} value={e}>
            {ENGINE_LABELS[e]}
          </option>
        ))}
      </select>
      <p id="engine-compatibility" className="mt-1 text-xs text-muted">
        {ENGINE_COMPATIBILITY[engine]}
      </p>

      {engine === "mongodb" && (
        <div className="mt-4">
          <label className="block text-sm text-ink mb-1" htmlFor="authSource">
            Auth database (optional)
          </label>
          <input
            id="authSource"
            name="authSource"
            placeholder="admin"
            autoComplete="off"
            className="w-full border border-line px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted">
            The database the user was created in. Leave blank for &ldquo;admin&rdquo;, which is right for MongoDB Atlas
            and most servers.
          </p>
        </div>
      )}
    </div>
  );
}
