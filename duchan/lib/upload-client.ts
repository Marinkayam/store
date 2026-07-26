"use client";

// העלאה ל-R2 דרך presigned URL מ-/api/upload. השרת מאמת בעלות ומכסה.

export async function uploadBlob(
  kind: "image" | "video" | "poster" | "cover" | "avatar",
  blob: Blob
): Promise<{ key: string } | { error: string }> {
  const contentType = blob.type || "application/octet-stream";
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, contentType, bytes: blob.size }),
  });
  const data = await res.json();
  if (!res.ok) return { error: data.error ?? "ההעלאה נכשלה" };

  const put = await fetch(data.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!put.ok) return { error: "ההעלאה נכשלה — נסי שוב" };
  return { key: data.key };
}
