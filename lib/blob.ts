import { del } from "@vercel/blob";

/** Our Blob store's public host, derived from its read-write token
 * (vercel_blob_rw_<storeId>_<secret>), so a URL from any other store fails. */
function ourHost(): string | null {
  const id = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  return id ? `${id.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

/** Videos live under btt/<sessionId>/. */
export const videoPrefix = (sessionId: string) => `btt/${sessionId}/`;

/** Is this a blob in our store, under this session's folder? */
export function isSessionBlob(url: unknown, sessionId: string): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === ourHost() && u.pathname.startsWith(`/${videoPrefix(sessionId)}`) && !u.search;
  } catch {
    return false;
  }
}

/** Best effort: a refused or replaced video shouldn't linger at a public URL. */
export async function dropBlob(url: string | undefined): Promise<void> {
  if (!url) return;
  try { await del(url); } catch {}
}
