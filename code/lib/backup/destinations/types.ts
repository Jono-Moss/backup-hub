// Same idea as lib/backup/engines/types.ts (BackupEngine), but for *where a
// finished backup file gets copied to* instead of *how it's produced*.
//
// To add a new destination provider:
//   1. Create lib/backup/destinations/<name>.ts implementing BackupDestination.
//   2. Register it in lib/backup/destinations/index.ts.
// That's it — the "add destination" form is generated from `configFields`,
// so no UI code needs to change for a new provider. If the provider supports
// a "sign in with your account" flow, also implement the optional `connect`.

export type DestinationFieldType = "text" | "password" | "number" | "checkbox";

export interface DestinationConfigField {
  /** Key this value is stored under in the destination's config JSON. */
  name: string;
  /** Label shown in the add/edit destination form. */
  label: string;
  type: DestinationFieldType;
  required?: boolean;
  placeholder?: string;
  /** Pre-filled value in the add form. */
  defaultValue?: string;
  /** Shown as helper text under the field. */
  helpText?: string;
  /**
   * True for fields that only exist to hold app credentials/tokens
   * (client ID, secret, refresh token). When the provider supports
   * `connect`, the form hides these behind an "advanced" toggle and the
   * normal path is just clicking "Connect" — the token comes from the
   * sign-in flow instead of being pasted.
   */
  credential?: boolean;
}

// Config values as submitted by the form / stored (decrypted) — always
// strings on the wire since they come from FormData; a destination casts
// numeric/boolean fields itself.
export type DestinationConfig = Record<string, string>;

export interface DestinationUploadResult {
  /** Human-readable location the file ended up at, e.g. "s3://bucket/key". Shown in the run history UI. */
  remotePath: string;
  /**
   * Set (with a human-readable reason) when the destination deliberately did
   * nothing — e.g. the email destination when the file is over its size
   * limit. Recorded as "skipped" rather than "failed", since nothing is
   * broken and nobody needs to fix anything.
   */
  skipped?: string;
}

/** Lets a destination write changes back to its own stored config. */
export interface DestinationRuntime {
  /**
   * Persist a change to this destination's stored config. Needed for OAuth
   * providers that rotate refresh tokens: OneDrive issues a fresh refresh
   * token on every refresh and each one expires 90 days after it was
   * issued, so reusing the original forever would silently break backups
   * after ~3 months. Merges `patch` into the existing config.
   */
  updateConfig(patch: DestinationConfig): Promise<void>;
}

/** Extra info handed to upload() that some destinations want for their own messaging. */
export interface DestinationUploadContext extends DestinationRuntime {
  taskName: string;
}

// --- "Sign in with your account" (OAuth device flow) ---
//
// The device flow is what makes this workable for a self-hosted app: it
// needs no redirect URI (which would have to be pre-registered per install
// domain). The user is shown a short code + URL, signs in on any device,
// and we poll until they approve. See googledrive.ts / onedrive.ts.

export interface DeviceFlowStart {
  /** Short code the user types at `verificationUrl`. */
  userCode: string;
  verificationUrl: string;
  expiresInSeconds: number;
  intervalSeconds: number;
  /** Opaque provider data needed to poll (device_code etc). Stays server-side — encrypted before it's handed to the browser. */
  state: Record<string, string>;
}

export type DeviceFlowPollResult =
  | { status: "pending"; slowDown?: boolean }
  | {
      status: "complete";
      /** Config to store for this destination (refresh token, etc). */
      config: DestinationConfig;
      /** Display name of the account that was connected, if the provider told us. */
      account?: string;
    }
  | { status: "error"; message: string };

export interface DestinationConnector {
  /** False when the server admin hasn't configured this provider's client ID env vars. */
  isAvailable(): boolean;
  start(): Promise<DeviceFlowStart>;
  poll(state: Record<string, string>): Promise<DeviceFlowPollResult>;
}

export interface BackupDestination {
  /** Matches a DestinationType value in db/schema.ts. */
  readonly type: string;
  /** Shown in the "add destination" provider dropdown. */
  readonly label: string;
  /** Drives the generic config form — see components/ui/AddTaskDestinationForm.tsx. */
  readonly configFields: DestinationConfigField[];
  /** Optional one-click account sign-in. Providers without OAuth simply omit it. */
  readonly connect?: DestinationConnector;
  /** Uploads one local file to this destination. Called after a run completes successfully. */
  upload(
    config: DestinationConfig,
    localFilePath: string,
    remoteFileName: string,
    context: DestinationUploadContext
  ): Promise<DestinationUploadResult>;
  /** Quick credentials/reachability check used by the "test connection" UI action. */
  testConnection(config: DestinationConfig, runtime?: DestinationRuntime): Promise<{ ok: boolean; message?: string }>;
}
