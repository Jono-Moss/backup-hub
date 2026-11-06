"use client";

import { useTranslations } from "next-intl";
import { useDefinitionText } from "@/components/ui/common/useDefinitionText";
import { useEffect, useRef, useState } from "react";
import {
  addDestination,
  testDestinationConnection,
  startDestinationConnect,
  pollDestinationConnect,
} from "@/app/tasks/actions";
import type { DestinationType } from "@/db/schema";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { ActionForm } from "@/components/ui/common/ActionForm";
import { useToast } from "@/components/ui/common/ToastProvider";
import { fail } from "@/lib/action-result";

type ConfigField = {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "checkbox" | "textarea";
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
  saveToAccount: boolean;
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
//
// Used on a task page (taskId set: the location is added to that task —
// task-only unless the owner ticks "save to my account") and on the save
// locations page (taskId null: always saved to the account).
export function AddTaskDestinationForm({
  taskId,
  providers,
  canSaveToAccount = false,
}: {
  taskId: string | null;
  providers: Provider[];
  /** Task owners only — a shared user's credentials can't become reusable by the owner. */
  canSaveToAccount?: boolean;
}) {
  const [type, setType] = useState(providers[0]?.type ?? "");
  const [advanced, setAdvanced] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const text = useDefinitionText("destinations");

  const provider = providers.find((p) => p.type === type);
  const bound = addDestination.bind(null, taskId);
  const formId = `add-destination-form-${taskId ?? "account"}`;

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
      if (key !== "type" && key !== "label" && key !== "saveToAccount" && typeof value === "string") extra[key] = value;
    }
    const saveToAccount = data.get("saveToAccount") === "true";

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
      saveToAccount,
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
        setConnectError(t("codeExpired"));
        setFlow(null);
        return;
      }
      const res = await pollDestinationConnect(taskId, flow.token, flow.label, flow.extra, flow.saveToAccount);
      if (cancelled) return;
      if (res.status === "pending") {
        if (res.slowDown) delay += 5000;
        timer = setTimeout(tick, delay);
      } else if (res.status === "complete") {
        setFlow(null);
        setConnectedAccount(res.account ?? t("yourAccount"));
        toast.success(t("connectedToast", { account: res.account ?? t("yourAccount") }));
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
    <ActionForm
      id={formId}
      formRef={formRef}
      action={async (formData) => {
        // In Connect mode there's no submit button, but pressing Enter in a
        // text field would still submit — and save a destination with no
        // credentials. The destination is only ever created by the sign-in
        // flow itself in this mode.
        if (connectMode) return fail(tErrors("connectFirst"));
        setResult(null);
        return bound(formData);
      }}
      success={t("added")}
      resetOnSuccess
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="destination-type">
            {t("provider")}
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
                {text(`${p.type}.label`, p.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-ink mb-1" htmlFor="destination-label">
            {t("label")}
          </label>
          <input
            id="destination-label"
            name="label"
            placeholder={provider ? text(`${provider.type}.label`, provider.label) : undefined}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      {provider?.supportsConnect && !provider.connectAvailable && (
        <p className="text-xs text-muted">
          {t("noOneClick")}
        </p>
      )}

      {visibleFields.map((field) => (
        <div key={`${type}-${field.name}`}>
          {field.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name={field.name} value="true" />
              {text(`${type}.fields.${field.name}.label`, field.label)}
            </label>
          ) : (
            <>
              <label className="block text-sm text-ink mb-1" htmlFor={`destination-${field.name}`}>
                {text(`${type}.fields.${field.name}.label`, field.label)}
                {field.required && <span className="text-danger"> *</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  id={`destination-${field.name}`}
                  name={field.name}
                  required={field.required}
                  placeholder={text(`${type}.fields.${field.name}.placeholder`, field.placeholder)}
                  defaultValue={field.defaultValue}
                  rows={6}
                  spellCheck={false}
                  className="w-full border border-line px-3 py-2 text-sm font-mono"
                />
              ) : (
              <input
                id={`destination-${field.name}`}
                name={field.name}
                type={field.type}
                required={field.required}
                placeholder={text(`${type}.fields.${field.name}.placeholder`, field.placeholder)}
                defaultValue={field.defaultValue}
                min={field.type === "number" ? 0 : undefined}
                step={field.type === "number" ? "any" : undefined}
                className="w-full border border-line px-3 py-2 text-sm"
              />
              )}
            </>
          )}
          {field.helpText && <p className="text-xs text-muted mt-1">{text(`${type}.fields.${field.name}.helpText`, field.helpText)}</p>}
        </div>
      ))}

      {canSaveToAccount && (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="saveToAccount" value="true" className="mt-0.5" />
          <span>
            {t("saveToAccount")}
            <span className="block text-xs text-muted">
              {t("saveToAccountHint")}
            </span>
          </span>
        </label>
      )}

      {flow && (
        <div className="border border-line rounded-md p-4 space-y-2 bg-white">
          <p className="text-sm text-ink">
            {t.rich("openAndSignIn", {
              url: flow.verificationUrl,
              link: (chunks) => (
                <a href={flow.verificationUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p className="text-sm text-ink">
            {t.rich("enterCode", {
              code: flow.userCode,
              mono: (chunks) => <span className="font-mono text-lg font-semibold tracking-widest">{chunks}</span>,
            })}
          </p>
          <p className="text-xs text-muted">{t("waiting")}</p>
          <StandardActionButton
            title={tCommon("cancel")}
            variant="link"
            compact
            action={() => {
              setFlow(null);
            }}
          />
        </div>
      )}

      {connectedAccount && (
        <p className="text-sm text-primary">{t("connectedAs", { account: connectedAccount })}</p>
      )}
      {connectError && <p className="text-sm text-danger">{connectError}</p>}

      <div className="flex items-center gap-3">
        {connectMode ? (
          <StandardActionButton
            title={t("connect", { provider: provider ? text(`${provider.type}.label`, provider.label) ?? "" : "" })}
            pendingTitle={t("starting")}
            action={handleConnect}
            disabled={!!flow}
          />
        ) : (
          <>
            <StandardActionButton action={handleTest} variant="outline" title={t("testConnection")} pendingTitle={t("testing")} />
            <StandardSubmitButton title={t("addLocation")} />
          </>
        )}
        {provider?.supportsConnect && provider.connectAvailable && (
          <StandardActionButton
            variant="link"
            compact
            title={advanced ? t("useSignIn") : t("useOwnCredentials")}
            action={() => {
              setAdvanced(!advanced);
              resetTransient();
            }}
          />
        )}
        {result && (
          <span className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
            {result.ok ? result.message ?? t("connected") : t("failedWhy", { reason: result.message ?? t("unknownError") })}
          </span>
        )}
      </div>
    </ActionForm>
  );
}
