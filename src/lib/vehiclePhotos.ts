export const MAX_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_DESCRICAO = 5000;
export const MAX_NOTES = 5000;
export const MAX_OPCIONAIS = 100;

export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return "Formato não suportado (use JPG, PNG ou WEBP)";
  if (file.size > MAX_PHOTO_BYTES) return "Arquivo maior que 10 MB";
  return null;
}

/** Moves item at `from` to index `to`, returning a new array. */
export function movePhoto<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Extracts the storage path from a public vehicle-photos URL, or null for foreign URLs. */
export function storagePathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/vehicle-photos/";
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

/** Normalizes a free-text list of opcionais: trims, drops empties, dedupes case-insensitively. */
export function normalizeOpcionais(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const v = raw.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
