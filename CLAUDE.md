# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Looklet (package name `clotheson`) — an AI fitting room. The user picks a model + outfit + accessories + pose + scene, the server asks Gemini or OpenAI to generate a fashion photo, then the browser retouches it (makeup/skin) locally with MediaPipe at no cost. UI text and code comments are in Thai; keep writing comments in Thai to match. AI prompts are written in English on purpose (image models follow English more precisely).

`AGENTS.md` warns that this Next.js (16.4, with `cacheComponents` + `partialPrefetching` in `next.config.ts`) differs from training data — read `node_modules/next/dist/docs/` before using Next APIs.

## Commands

```
npm install
npm run dev      # dev server, bound to 127.0.0.1 only (port in package.json scripts) so no one on the LAN can use our API keys
npm run lint     # eslint
npm run build && npm start
```

There are no tests. Requires Node >= 20.9.

`.env` (gitignored) holds `GEMINI_API_KEY` and/or `OPENAI_API_KEY`; restart the dev server after editing. Models only appear in the UI when their provider key is set (`availableModels()` in `lib/ai.ts`).

## Architecture

**Client / server split.** `components/TryOn.tsx` is the single client page (`app/page.tsx` just renders it). It calls our own `app/api/*` routes via `api()` in `lib/browser.ts`; API keys never reach the browser. Server-only modules import `'server-only'` (`ai.ts`, `prompts.ts`, `storage.ts`, `genlog.ts`, `route.ts`). POST routes are wrapped with `post()` from `lib/route.ts`, which parses JSON and turns `ApiError` (an AI provider error) into a 502 and other errors into a 500, with a message the UI shows directly.

**Generation flow (`app/api/generate/route.ts`).** The browser downscales each selected image to a JPEG ≤1024px (`jpegBase64`) and posts base64 data. The route builds one ordered `inputs` list — model (required), outfit, accessories (max `MAX_ACCESSORIES`), pose, scene — used for both the AI call and the log. **Image order must match the "Image n" references in `buildPrompt()` (`lib/prompts.ts`)**; changing one requires changing the other. `poseMode` (`POSE_MODES` in catalog) controls whether the pose image supplies only the pose or also the camera/lighting/scene ("shot-scene" drops the selected scene). An optional second "harmonize" pass re-runs the result through `harmonizePrompt`. The result is saved immediately (it's already paid for), then logged. **Photoshoot set** (`SET_SHOTS` in catalog, `generate(true)` in TryOn): the first shot is generated normally, then the other angles are generated in parallel through the same route with `set_ref` (the first result) + `set_shot`, which switches to `buildSetPrompt` (image order: set ref, model, outfit, accessories; no pose/scene images).

**AI providers (`lib/ai.ts`).** Model ids are `"<provider>:<model>"`. Gemini uses `generateContent` with `responseModalities: ['IMAGE']`; OpenAI uses `/v1/images/edits` with `input_fidelity: 'high'` and automatically retries without it for models that reject it. `describeAccessory()` auto-classifies uploaded accessories (Gemini first, then OpenAI) into `ACCESSORY_TYPES`.

**Catalog (`lib/catalog.ts`).** Static choices: built-in images in `public/images` (Thai filenames, URL-encoded via `img()`), plus `PRESETS` (shoot presets: each part — light, lens, angle, framing, color — has a Thai `label` shown in the UI and the English `prompt` actually sent, so the UI always matches the prompt) and smaller prompt-fragment lists (gazes, props, accessory types with `prompt`/`show`/`face`). User-uploaded items come from `/api/library` and are merged with these in the UI; items are identified by `src` (or by `name` for text-only scenes), never by index.

**Storage (`lib/storage.ts`).** With Supabase env vars it delegates to `lib/storage-supabase.ts` (private `images` bucket + `images` table, `supabase/schema.sql`; reads check the table row first because Supabase's CDN keeps deleted files for an hour). Otherwise everything is local files: generated images go to `results/`, uploads to `images/uploads/<kind>/`, and each image has a sidecar `.json` with its metadata. Images are served through `/api/files/...` (not `public/`, which doesn't see files added at runtime); `resolveFile` guards against path traversal. Delete moves files to `~/.Trash`. Keep the `saveImage / listImages / readImage / updateMeta / deleteImage` interface stable; routes only use these.

**Auth (only when Supabase env vars are set).** `proxy.ts` (Next 16's replacement for middleware) refreshes the Supabase session and sends non-members to `/login` (pages) or 401 (`/api/*`); every API route checks again via `signedIn()` in `lib/route.ts`. Membership is `app_metadata.looklet === true` (`isMember` in `lib/auth.ts`), set only with the secret key by `scripts/add-user.mjs` — there is no sign-up page. Without Supabase env vars, auth and Supabase storage are both off and the app behaves as a local-only tool.

**Generation logs (`lib/genlog.ts`).** Every generation (success or failure) writes `logs/<same name as result>.json` (or `<stamp>-error.json`), with sections `ai / model / element / pose / style / prompt`. Read these to debug what was actually sent to the AI.

**Retouching (browser only).** `lib/vision.js` loads MediaPipe FaceLandmarker + ImageSegmenter (the wasm version must match `@mediapipe/tasks-vision` in package.json) and is loaded with dynamic `import()`. `lib/beauty.js` holds the pure pixel algorithms (RGBA arrays, 478-point face mesh indices). `components/useRetouchCanvas.ts` applies the slider amounts to a canvas. Pasting the real face from the model photo is disabled by the `REAL_FACE` flag in `TryOn.tsx`; the code is kept so it can be re-enabled (see the comment there for why).

`results/`, `images/uploads/`, `logs/` and `.env*` are gitignored.
