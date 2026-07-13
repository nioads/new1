import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Brand } from "../generated/prisma/client";

export type StoredFile = { url: string; storageKey: string };

const MEDIA_DIR = () => path.resolve(process.env.MEDIA_DIR ?? "./data/media");

function makeKey(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase().slice(0, 10) || "";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${stamp}/${crypto.randomBytes(8).toString("hex")}${ext}`;
}

async function putLocal(buffer: Buffer, key: string): Promise<StoredFile> {
  const filePath = path.join(MEDIA_DIR(), key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return { url: `/api/files/${key}`, storageKey: key };
}

async function putS3(
  brand: Brand,
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<StoredFile> {
  const client = new S3Client({
    region: brand.s3Region || "us-east-1",
    ...(brand.s3Endpoint ? { endpoint: brand.s3Endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: brand.s3AccessKeyId,
      secretAccessKey: brand.s3SecretKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: brand.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  const base =
    brand.s3PublicBaseUrl ||
    (brand.s3Endpoint
      ? `${brand.s3Endpoint.replace(/\/$/, "")}/${brand.s3Bucket}`
      : `https://${brand.s3Bucket}.s3.${brand.s3Region || "us-east-1"}.amazonaws.com`);
  return { url: `${base}/${key}`, storageKey: key };
}

// Routes a file to the brand's configured backend; no brand (or incomplete
// S3 config) falls back to local disk.
export async function storeFile(
  brand: Brand | null,
  buffer: Buffer,
  originalName: string,
  contentType: string,
): Promise<StoredFile> {
  const key = makeKey(originalName);
  if (brand?.storageType === "S3" && brand.s3Bucket && brand.s3AccessKeyId) {
    return putS3(brand, buffer, key, contentType);
  }
  return putLocal(buffer, key);
}

export function mediaDir(): string {
  return MEDIA_DIR();
}
