// Generate only selected ideas, in order. A failure stops the batch; earlier results remain saved.
export async function generateSelectedShots<T>(ids: string[], generate: (id: string, index: number) => Promise<T>, onSaved: (result: T) => void) {
  const results: T[] = [];
  for (const [index, id] of [...new Set(ids)].entries()) {
    try {
      const result = await generate(id, index);
      results.push(result);
      onSaved(result);
    } catch (e) {
      return { results, error: (e as Error).message };
    }
  }
  return { results, error: null };
}
