import type { DestinationType } from "@/db/schema";
import type { BackupDestination } from "./types";
import { s3Destination } from "./s3";
import { googleDriveDestination } from "./googledrive";
import { oneDriveDestination } from "./onedrive";
import { emailDestination } from "./email";
import { openCloudDestination } from "./opencloud";

// Add a new provider by implementing BackupDestination (see types.ts) and
// adding one line here — the "add destination" form, its config fields,
// and testConnection/upload wiring all follow automatically.
const destinations: Record<DestinationType, BackupDestination> = {
  s3: s3Destination,
  google_drive: googleDriveDestination,
  onedrive: oneDriveDestination,
  email: emailDestination,
  opencloud:  openCloudDestination
};

export function getDestination(type: DestinationType): BackupDestination {
  const destination = destinations[type];
  if (!destination) throw new Error(`Unsupported backup destination: ${type}`);
  return destination;
}

export function listDestinationTypes(): BackupDestination[] {
  return Object.values(destinations);
}
