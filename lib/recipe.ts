// recipe: every step's choices saved in meta.recipe of each generated image (shape owned by each page: lib/tryon-recipe.ts, lib/packshot-recipe.ts)
// server stores it after this check, stamped with its format version; the page validates every field when loading it back

// above the longest recipe the pages can make (Creative with every text box full ≈ 10.8k, scripts/test-packshot-recipe.mjs)
const MAX_RECIPE_CHARS = 20000;
// stored field names / meanings; bump only when renaming or changing a field, and convert older versions in readRecipe
// recipes saved before v existed are format 1
export const RECIPE_VERSION = 1;

// keys sorted at every level: equal recipes -> equal keys, whatever the field order or which fields exist
export function recipeKey(recipe: unknown): string {
  return JSON.stringify(recipe, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}

export const oneOf = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T => (typeof v === 'string' && ids.includes(v as T) ? v as T : fallback);

// plain object only, JSON size capped; anything else -> null (not stored)
// v: a recipe passed on from a stored image (refine-skin) keeps its version; one from the page is the current format
export function storableRecipe(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    if (JSON.stringify(value).length > MAX_RECIPE_CHARS) return null;
  } catch {
    return null;
  }
  const v = (value as { v?: unknown }).v;
  return { ...value, v: typeof v === 'number' ? v : RECIPE_VERSION };
}
