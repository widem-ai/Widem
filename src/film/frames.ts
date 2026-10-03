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

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** Checks a fetched manifest field by field; throws on anything the canvas could not use. */
export function parseManifest(json: unknown): Manifest {
  if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error("manifest: not an object");
  const m = json as Record<string, unknown>;
  if (typeof m.id !== "string" || m.id === "") throw new Error("manifest: id must be a non-empty string");
  if (!positive(m.frames) || !Number.isInteger(m.frames)) throw new Error("manifest: frames must be a positive integer");
  if (typeof m.pattern !== "string" || !m.pattern.includes("{n}")) throw new Error('manifest: pattern must contain "{n}"');
  if (typeof m.poster !== "string" || m.poster === "") throw new Error("manifest: poster must be a non-empty string");
  if (!positive(m.width) || !positive(m.height)) throw new Error("manifest: width and height must be positive numbers");
  return { id: m.id, frames: m.frames, pattern: m.pattern, poster: m.poster, width: m.width, height: m.height };
}

export async function loadManifest(base: string, id: string): Promise<Manifest> {
  const res = await fetch(`${base}film/${id}/manifest.json`);
  if (!res.ok) throw new Error(`manifest ${id}: HTTP ${res.status}`);
  return parseManifest(await res.json());
}
