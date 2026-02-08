import type { Patch } from "./types";

export type ApplyResult = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Apply a single patch to text only if the anchor is unique (span or from).
 * Returns updated text or a reason when application is unsafe.
 * If span is set but not found in text, falls back to using 'from' so the fix
 * can still apply when the anchor quote doesn't match (e.g. whitespace or editing).
 */
export function applyPatch(text: string, patch: Patch): ApplyResult {
  if (patch.span !== undefined && patch.span !== "") {
    const spanCount = countOccurrences(text, patch.span);
    if (spanCount === 1) {
      return { ok: true, text: text.replace(patch.span!, patch.to) };
    }
    if (spanCount > 1) {
      return { ok: false, reason: `Span appears ${spanCount} times; cannot apply safely` };
    }
    // Span not found: fall back to 'from' so we can still apply when anchor doesn't match
  }
  const count = countOccurrences(text, patch.from);
  if (count === 0) {
    return { ok: false, reason: "Could not locate span or 'from' in text" };
  }
  if (count > 1) {
    return { ok: false, reason: `'from' appears ${count} times; cannot apply safely` };
  }
  return { ok: true, text: text.replace(patch.from, patch.to) };
}

function countOccurrences(text: string, substring: string): number {
  let count = 0;
  let pos = 0;
  while (true) {
    const i = text.indexOf(substring, pos);
    if (i === -1) break;
    count++;
    pos = i + 1;
  }
  return count;
}

/**
 * Check if a patch can be applied safely (without actually applying).
 */
export function canApplyPatch(text: string, patch: Patch): { canApply: true } | { canApply: false; reason: string } {
  const result = applyPatch(text, patch);
  if (result.ok) return { canApply: true };
  return { canApply: false, reason: result.reason };
}
