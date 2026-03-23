import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const isLocal = process.env.S3_ENDPOINT?.includes('localhost') || process.env.S3_ENDPOINT?.includes('minio');
    this.bucket = process.env.S3_BUCKET || 'agentops-documents';
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'eu-west-1',
      ...(isLocal && {
        endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin', secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin' },
      }),
    });
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    this.logger.log(`Uploaded: ${key} (${body.length} bytes)`);
    return key;
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) { chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks);
  }
}
