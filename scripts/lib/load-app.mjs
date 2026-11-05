// Run the app's server-only TypeScript helpers in small CLI demos and isolated tests.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
export function appLoader({ env = process.env, fetchImpl = fetch, overrides = {} } = {}) {
  const modules = new Map();
  function load(file) {
    if (file in overrides) return overrides[file];
    if (modules.has(file)) return modules.get(file);
    const loaded = { exports: {} };
    modules.set(file, loaded.exports);
    const code = ts.transpileModule(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function('require', 'module', 'exports', 'process', 'fetch', code)((id) => {
      if (id === 'server-only') return {};
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) + '.ts');
      return require(id);
    }, loaded, loaded.exports, { ...process, env }, fetchImpl);
    return loaded.exports;
  }
  return load;
}
