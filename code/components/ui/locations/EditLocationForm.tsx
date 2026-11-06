"use client";

import { useTranslations } from "next-intl";
import { useDefinitionText } from "@/components/ui/common/useDefinitionText";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { testEditedLocation, updateLocation } from "@/app/locations/actions";
import { StandardSubmitButton } from "@/components/ui/standard/StandardSubmitButton";
import { StandardActionButton } from "@/components/ui/standard/StandardActionButton";
import { ActionForm } from "@/components/ui/common/ActionForm";

type ConfigField = {
  name: string;
  label: string;
  type: "text" | "password" | "number" | "checkbox" | "textarea";
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  credential?: boolean;
  secret?: boolean;
};

// Same rule as isSecretField() in lib/backup/destinations/types.ts.
function isSecret(field: ConfigField) {
  return field.type === "password" || !!field.credential || !!field.secret;
}

// Secrets are never sent to the browser: their inputs start blank, and
// leaving one blank keeps the saved value.
export function EditLocationForm({
  location,
  provider,
}: {
  location: { id: string; label: string; values: Record<string, string>; secretsSet: string[] };
  provider: { type: string; label: string; configFields: ConfigField[] };
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const update = updateLocation.bind(null, location.id);
  const t = useTranslations("locations");
  const tCommon = useTranslations("common");
  const text = useDefinitionText("destinations");

  return (
    <ActionForm
      formRef={formRef}
      action={update}
      success={t("updated")}
      onSuccess={() => router.push("/locations")}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm text-ink mb-1" htmlFor="location-label">
          {t("label")}
        </label>
        <input
          id="location-label"
          name="label"
          defaultValue={location.label}
          required
          className="w-full border border-line px-3 py-2 text-sm"
        />
      </div>

      {provider.configFields.map((field) => {
        const secret = isSecret(field);
        const isSet = location.secretsSet.includes(field.name);
        const id = `location-${field.name}`;
        return (
          <div key={field.name}>
            {field.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name={field.name} value="true" defaultChecked={location.values[field.name] === "true"} />
                {text(`${provider.type}.fields.${field.name}.label`, field.label)}
              </label>
            ) : (
              <>
                <label className="block text-sm text-ink mb-1" htmlFor={id}>
                  {text(`${provider.type}.fields.${field.name}.label`, field.label)}
                  {field.required && !secret && <span className="text-danger"> *</span>}
                </label>
                {field.type === "textarea" ? (
                  <textarea
                    id={id}
                    name={field.name}
                    rows={6}
                    spellCheck={false}
                    defaultValue={secret ? "" : location.values[field.name] ?? ""}
                    placeholder={secret && isSet ? t("secretSaved") : text(`${provider.type}.fields.${field.name}.placeholder`, field.placeholder)}
                    className="w-full border border-line px-3 py-2 text-sm font-mono"
                  />
                ) : (
                  <input
                    id={id}
                    name={field.name}
                    type={secret ? "password" : field.type}
                    autoComplete="off"
                    // Secrets are never required here: blank keeps the saved
                    // value, and sign-in (Connect) locations deliberately have
                    // no client ID/secret of their own.
                    required={field.required && !secret}
                    defaultValue={secret ? "" : location.values[field.name] ?? ""}
                    placeholder={secret && isSet ? t("secretSaved") : text(`${provider.type}.fields.${field.name}.placeholder`, field.placeholder)}
                    min={field.type === "number" ? 0 : undefined}
                    step={field.type === "number" ? "any" : undefined}
                    className="w-full border border-line px-3 py-2 text-sm"
                  />
                )}
              </>
            )}
            {field.helpText && <p className="text-xs text-muted mt-1">{text(`${provider.type}.fields.${field.name}.helpText`, field.helpText)}</p>}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <StandardActionButton
          action={async () => {
            if (formRef.current) setResult(await testEditedLocation(location.id, new FormData(formRef.current)));
          }}
          variant="outline"
          title={t("testConnection")}
          pendingTitle={t("testing")}
        />
        <StandardSubmitButton title={t("saveChanges")} />
        <a href="/locations" className="text-sm text-muted hover:text-ink">
          {tCommon("cancel")}
        </a>
      </div>
      {result && (
        <p className={`text-sm ${result.ok ? "text-primary" : "text-danger"}`}>
          {result.ok ? result.message ?? t("connected") : t("failedWhy", { reason: result.message ?? t("unknownError") })}
        </p>
      )}
    </ActionForm>
  );
}
