import fs from "fs";
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import type { BackupDestination, DestinationConfig } from "./types";

// Works with real AWS S3 and any S3-compatible provider (Backblaze B2,
// Wasabi, Cloudflare R2, DigitalOcean Spaces, MinIO, etc.) — just point
// `endpoint` at the provider's S3 endpoint and, for most non-AWS providers,
// check "Force path-style addressing".
function client(config: DestinationConfig) {
  return new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle === "true",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function objectKey(config: DestinationConfig, remoteFileName: string): string {
  const prefix = (config.pathPrefix || "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${remoteFileName}` : remoteFileName;
}

export const s3Destination: BackupDestination = {
  type: "s3",
  label: "S3 (AWS / Backblaze / Wasabi / R2 / MinIO / other S3-compatible)",
  configFields: [
    { name: "bucket", label: "Bucket", type: "text", required: true },
    { name: "region", label: "Region", type: "text", placeholder: "us-east-1", helpText: "Use \"auto\" for providers that don't use AWS regions (e.g. R2)." },
    { name: "accessKeyId", label: "Access key ID", type: "text", required: true },
    { name: "secretAccessKey", label: "Secret access key", type: "password", required: true },
    { name: "endpoint", label: "Custom endpoint URL", type: "text", placeholder: "https://s3.us-west-000.backblazeb2.com", helpText: "Leave blank for real AWS S3." },
    { name: "forcePathStyle", label: "Force path-style addressing", type: "checkbox", helpText: "Usually required for non-AWS S3-compatible providers." },
    { name: "pathPrefix", label: "Path prefix (optional)", type: "text", placeholder: "backup-hub/" },
  ],

  async upload(config, localFilePath, remoteFileName) {
    const key = objectKey(config, remoteFileName);
    const stat = await fs.promises.stat(localFilePath);

    await client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        // A stream, not a Buffer — backup files can be large and we
        // don't want to hold the whole thing in memory. The AWS SDK v3
        // Node client fully supports streaming bodies; unlike raw
        // fetch()/Response, it doesn't need a manual Readable.toWeb()
        // conversion (see the download-route fix elsewhere in this repo).
        Body: fs.createReadStream(localFilePath),
        ContentLength: stat.size,
      })
    );

    return { remotePath: `s3://${config.bucket}/${key}` };
  },

  async testConnection(config) {
    try {
      await client(config).send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: String(err.message ?? err).slice(0, 500) };
    }
  },
};
