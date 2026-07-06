import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "minio";
import { randomUUID } from "node:crypto";

/**
 * Document storage on MinIO (S3-compatible, self-hosted — $0). Holds the raw
 * uploaded document bytes; only object keys + metadata are kept in Postgres.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: Client;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.bucket = this.config.get<string>("MINIO_BUCKET", "bharatchain-docs");
    this.client = new Client({
      endPoint: this.config.get<string>("MINIO_ENDPOINT", "localhost"),
      port: Number(this.config.get<string>("MINIO_PORT", "9000")),
      useSSL: this.config.get<string>("MINIO_USE_SSL", "false") === "true",
      accessKey: this.config.get<string>("MINIO_ACCESS_KEY", "minioadmin"),
      secretKey: this.config.get<string>("MINIO_SECRET_KEY", "minioadmin"),
    });
    if (!(await this.client.bucketExists(this.bucket))) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created bucket '${this.bucket}'`);
    }
    this.logger.log(`Storage ready: bucket='${this.bucket}'`);
  }

  /** Store a document under applications/<applicationId>/<uuid>-<name>. Returns the object key. */
  async putDocument(
    applicationId: string,
    originalName: string,
    body: Buffer,
    contentType?: string,
  ): Promise<string> {
    const safe = originalName.replace(/[^\w.\-]+/g, "_");
    const key = `applications/${applicationId}/${randomUUID()}-${safe}`;
    await this.client.putObject(this.bucket, key, body, body.length, {
      "Content-Type": contentType ?? "application/octet-stream",
    });
    return key;
  }

  /** Time-limited download URL (default 5 min) for an object. */
  presignedGet(objectKey: string, expirySeconds = 300): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
  }
}
