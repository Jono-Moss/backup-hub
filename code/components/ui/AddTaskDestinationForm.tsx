"use client";

import { useEffect, useRef, useState } from "react";
import {
  addTaskDestination,
  testDestinationConnection,
  startDestinationConnect,
  pollDestinationConnect,
} from "@/app/tasks/actions";
import type { DestinationType } from "@/db/schema";
import { StandardSubmitButton } from "./standard/StandardSubmitButton";
import { StandardActionButton } from "./standard/StandardActionButton";

type ConfigField = {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "checkbox";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  helpText?: string;
  credential?: boolean;
};

type Provider = {
  type: string;
  label: string;
  configFields: ConfigField[];
  supportsConnect: boolean;
  connectAvailable: boolean;
};

type Flow = {
  token: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: number;
  label: string;
  extra: Record<string, string>;
};

// Renders the right config fields for whichever provider is selected —
// this is what makes adding a new destination provider (lib/backup/destinations/)
// a backend-only change: this form never needs to know S3 from Google
// Drive, it just reflects each provider's own configFields.
//
// Providers with a sign-in flow (Google Drive, OneDrive) default to a
// "Connect" mode: no credentials to paste, just click, enter a code on the
// provider's site, and approve. "Advanced" reveals the credential fields
// for people bringing their own OAuth app.
export function AddTaskDestinationForm({ taskId, providers }: { taskId: string; providers: Provider[] }) {
  const [type, setType] = useState(providers[0]?.type ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const provider = providers.find((p) => p.type === type);
  const bound = addTaskDestination.bind(null, taskId);
  const formId = `add-destination-form-${taskId}`;

  // "Connect" mode = provider supports sign-in, the server has it set up,
  // and the user hasn't opted into pasting their own credentials.
  const connectMode = !!provider?.supportsConnect && provider.connectAvailable && !advanced;
  const visibleFields = provider?.configFields.filter((f) => !connectMode || !f.credential) ?? [];

  function resetTransient() {
    setResult(null);
    setFlow(null);
    setConnectError(null);
    setConnectedAccount(null);
  }

  async function handleTest() {
    const form = document.getElementById(formId) as HTMLFormElement;
    setResult(await testDestinationConnection(new FormData(form)));
  }

  async function handleConnect() {
    resetTransient();
    const form = formRef.current;
    if (!form || !provider) return;
    const data = new FormData(form);

    const extra: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      if (key !== "type" && key !== "label" && typeof value === "string") extra[key] = value;
    }

    const started = await startDestinationConnect(taskId, provider.type as DestinationType);
    if (!started.ok) {
      setConnectError(started.message);
      return;
    }
    setFlow({
      token: started.token,
      userCode: started.userCode,
      verificationUrl: started.verificationUrl,
      intervalSeconds: started.intervalSeconds,
      expiresAt: Date.now() + started.expiresInSeconds * 1000,
      label: String(data.get("label") ?? ""),
      extra,
    });
  }

  // Poll until the user approves, declines, or the code expires. Cleanup
  // cancels the loop so switching provider / cancelling / unmounting stops it.
  useEffect(() => {
    if (!flow) return;
    let cancelled = false;
    let delay = Math.max(flow.intervalSeconds, 3) * 1000;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled || !flow) return;
      if (Date.now() > flow.expiresAt) {
        setConnectError("The code expired before it was approved. Try again.");
        setFlow(null);
        return;
      }
      const res = await pollDestinationConnect(taskId, flow.token, flow.label, flow.extra);
      if (cancelled) return;
      if (res.status === "pending") {
        if (res.slowDown) delay += 5000;
        timer = setTimeout(tick, delay);
      } else if (res.status === "complete") {
        setFlow(null);
        setConnectedAccount(res.account ?? "your account");
        formRef.current?.reset();
      } else {
        setConnectError(res.message);
        setFlow(null);
      }
    }

    timer = setTimeout(tick, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [flow, taskId]);

  if (providers.length === 0) return null;

  return (
    <form
      id={formId}
      ref={formRef}
      action={async (formData) => {
        // In Connect mode there's no submit button, but pressing Enter in a
        // text field would still submit — and save a destination with no
        // credentials. The destination is only ever created by the sign-in
        // flow itself in this mode.
        if (connectMode) return;
        setResult(null);
        await bound(formData);
        formRef.current?.reset();
      }}
      className="space-y-4"
    >
      <p className="mt-2 text-sm font-semibold text-ink">
        Add Destination
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="destination-type">
            Provider
          </label>
          <select
            id="destination-type"
            name="type"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setAdvanced(false);
              resetTransient();
            }}
            className="w-full border border-line px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {providers.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="destination-label">
            Label
          </label>
          <input
            id="destination-label"
            name="label"
            placeholder={provider?.label}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      {provider?.supportsConnect && !provider.connectAvailable && (
        <p className="text-xs text-muted">
          One-click sign-in isn&apos;t set up on this server, so you&apos;ll need to enter your own OAuth credentials
          below. (An admin can enable sign-in by setting the provider&apos;s client ID in the server environment — see the README.)
        </p>
      )}

      {visibleFields.map((field) => (
        <div key={`${type}-${field.name}`}>
          {field.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name={field.name} />
              {field.label}
            </label>
          ) : (
            <>
              <label className="block text-sm text-ink mb-1" htmlFor={`destination-${field.name}`}>
                {field.label}
                {field.required && <span className="text-danger"> *</span>}
              </label>
              <input
                id={`destination-${field.name}`}
                name={field.name}
                type={field.type}
                required={field.required}
                placeholder={field.placeholder}
                defaultValue={field.defaultValue}
                min={field.type === "number" ? 0 : undefined}
                step={field.type === "number" ? "any" : undefined}
                className="w-full border border-line px-3 py-2 text-sm"
              />
            </>
          )}
          {field.helpText && <p className="text-xs text-muted mt-1">{field.helpText}</p>}
        </div>
      ))}

      {flow && (
        <div className="border border-line rounded-md p-4 space-y-2 bg-white">
          <p className="text-sm text-ink">
            1. Open{" "}
            <a href={flow.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
              {flow.verificationUrl}
            </a>{" "}
            and sign in.
          </p>
          <p className="text-sm text-ink">
            2. Enter this code: <span className="font-mono text-lg font-semibold tracking-widest">{flow.userCode}</span>
          </p>
          <p className="text-xs text-muted">Waiting for you to approve… this page updates automatically.</p>
          <StandardActionButton
            title="Cancel"
            variant="link"
            compact
            action={() => {
              setFlow(null);
            }}
          />
        </div>
      )}

      {connectedAccount && (
        <p className="text-sm text-primary">Connected as {connectedAccount}. The destination has been added.</p>
      )}
      {connectError && <p className="text-sm text-danger">{connectError}</p>}

      <div className="flex items-center gap-3">
        {connectMode ? (
          <StandardActionButton
            title={`Connect ${provider?.label ?? ""}`}
            pendingTitle="Starting…"
            action={handleConnect}
            disabled={!!flow}
          />
        ) : (
          <>
            <StandardActionButton action={handleTest} variant="outline" title="Test connection" pendingTitle="Testing…" />
            <StandardSubmitButton title="Add destination" />
          </>
        )}
        {provider?.supportsConnect && provider.connectAvailable && (
          <StandardActionButton
            variant="link"
            compact
            title={advanced ? "Use sign-in instead" : "Advanced: use my own credentials"}
            action={() => {
              setAdvanced(!advanced);
              resetTransient();
            }}
          />
        )}
        {result && (
          <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
            {result.ok ? result.message ?? "Connected successfully" : `Failed: ${result.message ?? "unknown error"}`}
          </span>
        )}
      </div>
    </form>
  );
}
