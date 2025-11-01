import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { loadConfig, type BackupStorageConfig, type BackupStorageProvider } from "../config.js";
import { log } from "../log.js";

export type BackupPayload = {
  id: string;
  topic: string;
  payload: unknown;
  createdAt: Date;
  processedAt: string;
};

export type BackupResult = {
  provider: BackupStorageProvider;
  location?: string;
};

type BackupSink = {
  provider: BackupStorageProvider;
  store(payload: BackupPayload): Promise<BackupResult>;
};

let cachedSink: BackupSink | null = null;

function sanitizeSegment(segment: string): string {
  return segment
    .trim()
  .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
}

function buildObjectKey(prefix: string, topic: string, id: string, processedAt: string): string {
  const timestamp = processedAt.replace(/[:T]/g, "-").replace(/\..+$/, "");
  const safeTopic = sanitizeSegment(topic).replace(/\//g, "-") || "event";
  const safePrefix = sanitizeSegment(prefix);
  const prefixPath = safePrefix ? `${safePrefix}/` : "";
  return `${prefixPath}${safeTopic}/${timestamp}-${id}.json`;
}

async function ensureDirectory(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
}

function createLocalSink(config: BackupStorageConfig): BackupSink {
  const baseDir = config.localDir?.trim() || path.join(os.tmpdir(), "infinity-gauntlet", "outbox-backups");

  return {
    provider: "local",
    async store(payload: BackupPayload): Promise<BackupResult> {
      const key = buildObjectKey(config.prefix, payload.topic, payload.id, payload.processedAt);
      const filePath = path.join(baseDir, key);
      await ensureDirectory(path.dirname(filePath));
      const body = JSON.stringify(
        {
          id: payload.id,
          topic: payload.topic,
          createdAt: payload.createdAt.toISOString(),
          processedAt: payload.processedAt,
          payload: payload.payload,
        },
        null,
        2,
      );
      await fs.writeFile(filePath, body, "utf8");
      return { provider: "local", location: `file://${filePath}` };
    },
  };
}

function createS3Sink(config: BackupStorageConfig): BackupSink {
  const bucket = config.bucket;
  const region = config.region;
  if (!bucket || !region) {
    throw new Error("BACKUP_STORAGE_S3_BUCKET and BACKUP_STORAGE_S3_REGION must be set when provider=s3");
  }

  const client = new S3Client({
    region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle,
  });

  return {
    provider: "s3",
    async store(payload: BackupPayload): Promise<BackupResult> {
      const key = buildObjectKey(config.prefix, payload.topic, payload.id, payload.processedAt);
      const body = JSON.stringify({
        id: payload.id,
        topic: payload.topic,
        createdAt: payload.createdAt.toISOString(),
        processedAt: payload.processedAt,
        payload: payload.payload,
      });

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
        }),
      );

      return { provider: "s3", location: `s3://${bucket}/${key}` };
    },
  };
}

function createNoopSink(): BackupSink {
  return {
    provider: "none",
    async store(): Promise<BackupResult> {
      return { provider: "none" };
    },
  };
}

function createSink(): BackupSink {
  const runtimeConfig = loadConfig();
  const storage = runtimeConfig.backupStorage;

  switch (storage.provider) {
    case "s3":
      return createS3Sink(storage);
    case "local":
      return createLocalSink(storage);
    case "none":
    default:
      return createNoopSink();
  }
}

function getSink(): BackupSink {
  if (!cachedSink) {
    cachedSink = createSink();
  }
  return cachedSink;
}

export async function storeBackup(payload: BackupPayload): Promise<BackupResult> {
  const sink = getSink();
  try {
    const result = await sink.store(payload);
    return result;
  } catch (error) {
    log.error("backup.sink_failed", error, { topic: payload.topic, id: payload.id, provider: sink.provider });
    throw error;
  }
}

export function getBackupProvider(): BackupStorageProvider {
  return getSink().provider;
}

export function resetBackupSinkForTests(): void {
  cachedSink = null;
}
