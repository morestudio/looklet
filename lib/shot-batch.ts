// Generate only selected ideas, in order. One failed idea (for example refused by the AI's safety system) does not stop the
// others; every finished result is saved as soon as it is ready. Errors are returned per idea for the status message.
export async function generateSelectedShots<T>(ids: string[], generate: (id: string, index: number) => Promise<T>, onSaved: (result: T) => void) {
  const results: T[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const [index, id] of [...new Set(ids)].entries()) {
    try {
      const result = await generate(id, index);
      results.push(result);
      onSaved(result);
    } catch (e) {
      errors.push({ id, message: (e as Error).message });
    }
  }
  return { results, errors };
}
