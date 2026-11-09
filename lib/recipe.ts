// recipe: every step's choices saved in meta.recipe of each generated image (shape owned by each page: components/TryOn.tsx, components/Packshot.tsx)
// server stores it as-is after this check; the page validates every field when loading it back

const MAX_RECIPE_CHARS = 8000;

// plain object only, JSON size capped; anything else -> null (not stored)
export function storableRecipe(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    return JSON.stringify(value).length <= MAX_RECIPE_CHARS ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
