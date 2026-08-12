export type PresignedUpload = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

export interface StorageDriver {
  name: "local" | "s3";
  presignPut(key: string, mimeType: string, sizeBytes: number): Promise<PresignedUpload>;
  exists(key: string): Promise<boolean>;
  /** S3: presigned GET url to redirect to. Local: null (stream via getLocalPath). */
  getRedirectUrl(key: string): Promise<string | null>;
  /** Local: absolute file path to stream. S3: null. */
  getLocalPath(key: string): string | null;
}
