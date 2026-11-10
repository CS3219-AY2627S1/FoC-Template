// AI-assisted (Claude Opus 5.5): loads chat photos with the login token (an <img> tag
// cannot send it) and keeps them as object URLs, so each photo downloads once.
// Reviewed by authors.
import { useEffect, useState } from "react";
import { chatApi } from "../api";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CACHE_LIMIT = 150;

// attachment_id -> object URL. A Map keeps insertion order, so the first key is oldest.
const urls = new Map<string, string>();
const loading = new Map<string, Promise<string>>();

function remember(id: string, url: string): void {
  urls.set(id, url);
  if (urls.size > CACHE_LIMIT) {
    const [oldest] = urls.keys();
    URL.revokeObjectURL(urls.get(oldest)!);
    urls.delete(oldest);
  }
}

function load(conversationId: string, attachmentId: string): Promise<string> {
  let p = loading.get(attachmentId);
  if (!p) {
    p = chatApi
      .photo(conversationId, attachmentId)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        remember(attachmentId, url);
        return url;
      })
      .finally(() => loading.delete(attachmentId));
    loading.set(attachmentId, p);
  }
  return p;
}

/** Problem with a picked file, or null if it can be uploaded. */
export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return "Only JPEG, PNG or WebP photos can be sent.";
  if (file.size > MAX_PHOTO_BYTES) return "Photos must be 5 MB or smaller.";
  return null;
}

/** Object URL for a chat photo; `error` is set if it cannot be loaded. */
export function usePhoto(
  conversationId: string,
  attachmentId: string | undefined,
): { url: string | null; error: boolean } {
  const [state, setState] = useState<{ id?: string; url: string | null; error: boolean }>({
    url: null,
    error: false,
  });

  useEffect(() => {
    if (!attachmentId || urls.has(attachmentId)) return;
    let alive = true;
    load(conversationId, attachmentId).then(
      (url) => alive && setState({ id: attachmentId, url, error: false }),
      () => alive && setState({ id: attachmentId, url: null, error: true }),
    );
    return () => {
      alive = false;
    };
  }, [conversationId, attachmentId]);

  if (!attachmentId) return { url: null, error: true };
  const cached = urls.get(attachmentId);
  if (cached) return { url: cached, error: false };
  return state.id === attachmentId ? state : { url: null, error: false };
}
