// recipe: every step's choices saved in meta.recipe of each generated image (shape owned by each page: components/TryOn.tsx, components/Packshot.tsx)
// server stores it as-is after this check; the page validates every field when loading it back

// above the longest recipe the pages can make (Creative with every text box full ≈ 10.8k, scripts/test-packshot-recipe.mjs)
const MAX_RECIPE_CHARS = 20000;

// keys sorted at every level: equal recipes -> equal keys, whatever the field order or which fields exist
export function recipeKey(recipe: unknown): string {
  return JSON.stringify(recipe, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}

export const oneOf = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T => (typeof v === 'string' && ids.includes(v as T) ? v as T : fallback);

// plain object only, JSON size capped; anything else -> null (not stored)
export function storableRecipe(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value).length <= MAX_RECIPE_CHARS ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
