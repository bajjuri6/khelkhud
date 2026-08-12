import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../../config.js";
import type { PresignedUpload, StorageDriver } from "./types.js";

const client = new S3Client({ region: config.AWS_REGION });

export const s3Driver: StorageDriver = {
  name: "s3",
  async presignPut(key, mimeType): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      ContentType: mimeType,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    return { uploadUrl, method: "PUT", headers: { "Content-Type": mimeType } };
  },
  async exists(key) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  },
  async getRedirectUrl(key) {
    const command = new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key });
    return getSignedUrl(client, command, { expiresIn: 300 });
  },
  getLocalPath() {
    return null;
  },
};
