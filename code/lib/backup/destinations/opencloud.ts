import fs from "fs";
import http from "http";
import https from "https";

import type {
  BackupDestination,
  DestinationConfig,
  DestinationUploadContext,
} from "./types";

function getBaseUrl(config: DestinationConfig): URL {
  const value = config.webdavUrl?.trim();

  if (!value) {
    throw new Error("WebDAV URL is required.");
  }

  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("WebDAV URL must use HTTP or HTTPS.");
  }

  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }

  return url;
}

function getAuthHeader(config: DestinationConfig): string {
  const username = config.username?.trim();
  const appToken = config.appToken?.trim();

  if (!username) {
    throw new Error("OpenCloud username is required.");
  }

  if (!appToken) {
    throw new Error("OpenCloud app token is required.");
  }

  return `Basic ${Buffer.from(`${username}:${appToken}`).toString("base64")}`;
}

function getRemoteUrl(
  config: DestinationConfig,
  remoteFileName: string
): URL {
  const url = getBaseUrl(config);

  const prefix = (config.pathPrefix || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (prefix) {
    for (const part of prefix.split("/")) {
      if (part) {
        url.pathname += `${encodeURIComponent(part)}/`;
      }
    }
  }

  url.pathname += encodeURIComponent(remoteFileName);

  return url;
}

function request(
  url: URL,
  method: string,
  headers: Record<string, string>
): Promise<{
  statusCode: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;

    const req = client.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body,
          });
        });
      }
    );

    req.on("error", reject);

    req.end();
  });
}

async function createDirectory(
  config: DestinationConfig,
  url: URL
): Promise<void> {
  const response = await request(url, "MKCOL", {
    Authorization: getAuthHeader(config),
  });

  // 2xx = created/successful.
  // 405 = directory already exists.
  if (
    (response.statusCode < 200 || response.statusCode >= 300) &&
    response.statusCode !== 405
  ) {
    throw new Error(
      `OpenCloud MKCOL failed (${response.statusCode}): ${response.body.slice(
        0,
        500
      )}`
    );
  }
}

async function ensureDirectory(
  config: DestinationConfig
): Promise<void> {
  const baseUrl = getBaseUrl(config);

  const prefix = (config.pathPrefix || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");

  if (!prefix) {
    return;
  }

  const parts = prefix.split("/").filter(Boolean);

  let currentPath = baseUrl.pathname;

  for (const part of parts) {
    currentPath += `${encodeURIComponent(part)}/`;

    const directoryUrl = new URL(baseUrl);
    directoryUrl.pathname = currentPath;

    await createDirectory(config, directoryUrl);
  }
}

function uploadFile(
  config: DestinationConfig,
  filePath: string,
  remoteUrl: URL
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = remoteUrl.protocol === "https:" ? https : http;

    const fileStream = fs.createReadStream(filePath);

    fileStream.on("error", reject);

    const req = client.request(
      remoteUrl,
      {
        method: "PUT",
        headers: {
          Authorization: getAuthHeader(config),
        },
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          const statusCode = res.statusCode ?? 0;

          if (statusCode >= 200 && statusCode < 300) {
            resolve();
            return;
          }

          reject(
            new Error(
              `OpenCloud upload failed (${statusCode}): ${body.slice(
                0,
                500
              )}`
            )
          );
        });
      }
    );

    req.on("error", reject);

    fileStream.pipe(req);
  });
}

export const openCloudDestination: BackupDestination = {
  type: "opencloud",

  label: "OpenCloud",

  configFields: [
    {
      name: "webdavUrl",
      label: "Folder WebDAV URL",
      type: "text",
      required: true,
      placeholder: "https://cloud.example.com/dav/spaces/de000f00-0d0a-000f-00de-000000000000",
    },
    {
      name: "username",
      label: "Username",
      type: "text",
      required: true,
    },
    {
      name: "appToken",
      label: "App token",
      type: "password",
      required: true,
      credential: true,
    },
    {
      name: "pathPrefix",
      label: "Path prefix (optional)",
      type: "text",
      placeholder: "backups/",
    },
  ],

  async upload(
    config: DestinationConfig,
    localFilePath: string,
    remoteFileName: string,
    _context: DestinationUploadContext
  ) {
    await ensureDirectory(config);

    const remoteUrl = getRemoteUrl(config, remoteFileName);

    await uploadFile(config, localFilePath, remoteUrl);

    return {
      remotePath: remoteUrl.toString(),
    };
  },

  async testConnection(config: DestinationConfig) {
    try {
      const url = getBaseUrl(config);

      const response = await request(url, "PROPFIND", {
        Authorization: getAuthHeader(config),
        Depth: "0",
      });

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { ok: true };
      }

      return {
        ok: false,
        message: `OpenCloud returned HTTP ${response.statusCode}: ${response.body.slice(
          0,
          500
        )}`,
      };
    } catch (err) {
      return {
        ok: false,
        message: String(err instanceof Error ? err.message : err).slice(
          0,
          500
        ),
      };
    }
  },
};