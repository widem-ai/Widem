// A frame sequence is a folder under public/film/<id>/ with a manifest.json written by
// scripts/build-sequence.mjs (or by hand for placeholders).
export type Manifest = { id: string; frames: number; pattern: string; poster: string; width: number; height: number };

export function frameAt(progress: number, frames: number): number {
  if (!Number.isFinite(progress) || frames <= 1) return 0;
  const p = Math.min(1, Math.max(0, progress));
  return Math.min(frames - 1, Math.floor(p * frames));
}

export function frameUrl(base: string, m: Manifest, index: number): string {
  return base + m.pattern.replace("{n}", String(index + 1).padStart(4, "0"));
}

export async function loadManifest(base: string, id: string): Promise<Manifest> {
  const res = await fetch(`${base}film/${id}/manifest.json`);
  if (!res.ok) throw new Error(`manifest ${id}: HTTP ${res.status}`);
  return (await res.json()) as Manifest;
}
