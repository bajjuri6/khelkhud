import { apiClient, API_URL } from "@/lib/api";

export type DocumentKind =
  | "ID_PROOF"
  | "ACHIEVEMENT_PROOF"
  | "RECEIPT"
  | "UPDATE_MEDIA"
  | "PROFILE_PHOTO"
  | "OTHER";

export type UploadedDocument = {
  id: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  kind: DocumentKind;
};

/** presign -> PUT bytes -> confirm; returns the created Document row. */
export async function uploadFile(
  file: File,
  kind: DocumentKind,
  attach?: {
    playerProfileId?: string;
    sponsorProfileId?: string;
    sponsorshipId?: string;
    updateId?: string;
  },
): Promise<UploadedDocument> {
  const presign = await apiClient<{
    data: { uploadUrl: string; method: "PUT"; headers: Record<string, string>; storageKey: string };
  }>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ kind, fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
  });

  const put = await fetch(presign.data.uploadUrl, {
    method: "PUT",
    headers: presign.data.headers,
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed");

  const confirmed = await apiClient<{ data: UploadedDocument }>("/api/uploads/confirm", {
    method: "POST",
    body: JSON.stringify({
      storageKey: presign.data.storageKey,
      kind,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      attach,
    }),
  });
  return confirmed.data;
}

export function profilePhotoUrl(photoKey: string | null | undefined): string | null {
  if (!photoKey) return null;
  return `${API_URL}/api/files/photo?key=${encodeURIComponent(photoKey)}`;
}

export function documentUrl(documentId: string): string {
  return `${API_URL}/api/files/${documentId}`;
}
