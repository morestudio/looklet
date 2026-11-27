# Poster page — plan (branch `poster`, started 20 Nov 2026)

## Goal

A third studio page, **โปสเตอร์** (`/poster`), that helps a business make a social-media poster without design skills
or much typing.

## Flow (user's spec, 20 Nov)

1. **Choose** the subject photo (product / food / person), the background (a ready-made scene or the user's own photo of
   the place) and a **text graphic** (template + position; drag it on the poster to fine-tune).
2. **Send the graphic's location to the AI.** The AI generates the whole picture (the subject placed in the background)
   and leaves the graphic's area calm and empty.
3. **Merge:** the app draws the graphic on top of the generated picture = the finished poster. Words can be edited
   afterwards for free (no new AI image).

```
┌─ graphic    template drawn by the app in real fonts (Thai is always right, the logo is never redrawn)
└─ picture    AI: subject + background in one image, with the graphic's area kept empty
```

## Rail steps

1. **ตัวหลัก** — upload the subject photo (HEIC ok). **Since 23 Nov it is cut out and placed by the user** (user's
   request): people are cut out automatically, other things by tapping them in the photo (several taps add up; free,
   MediaPipe in the browser, `lib/cutout.ts`); the cut-out appears on the poster, where it is moved and resized (corner,
   proportions kept). The AI gets a composite (scene preview or own photo + the cut-out at its place) and keeps its
   position and size, a full-detail cut-out on white, and the text guide. ไม่ตัดพื้นหลัง = the whole photo as before.
   Why a composite: on 29 Oct GPT Image ignored size words, guide figures and masks; a placed composite worked.
   First real run: the cut-out lost the men's legs (the photo's title lay over them) and the AI kept them cut off;
   now small fragments are dropped (`cleanMask`) and the AI completes missing parts while keeping position and scale.
   Own place photos keep their signs (the bar's "Repeat" sign had been removed by the no-text rule).
   **Up to 3 subject photos (23 Nov, user's request)**, e.g. a dish + a drink: each is cut out and placed on its own
   (a strip of the photos in the panel: tap to edit that cut, × to remove, + to add); a new cut-out lines all of them
   up side by side, tapping one on the stage brings it to the front. The AI gets the composite, each cut-out on white
   (left to right) and the text guide, and is told to keep them separate and light them together (a small cut-out
   adds only a few hundred tokens, ≈ ฿0.2–0.4; a whole poster image is 5,900–7,700 tokens ≈ ฿3.2–3.7, 23 Nov). ไม่ตัดพื้นหลัง only with one photo. Risk to test: separate photos merged or made alike.
   First run (pizza from above + salad at an angle): the pizza stood on its edge like a wheel, because the AI was told
   not to move or turn anything. Now several subjects = the layout is a rough guide and the AI styles one shot (one
   camera angle, real sizes, same surface, overlapping); a single dish shot from above is turned to the shot's angle.
   Re-run with that wording: the pizza still stood on its edge; the composite wins over words, so the flat-lying has to
   be in the composite (next: a squashed 'lying flat' cut-out).
   **Then the user chose an art director instead (23 Nov):** no composite any more (`EXACT_PLACEMENT = false`); the AI
   gets each cut-out, the own place photo, the text guide and an "act as an art director" brief: it decides where,
   how big and from which angle (moved / turned / resized, details kept, people keep their pose); where the user put
   the cut-outs on the stage is sent as a rough idea in words. One try: nicer composition, pizza still upright.
   **Back to exact placement the same day (user: their own 17:11 run is "the best for now")**: they used a pizza photo
   shot at an angle and placed it in front of the salad board; the composite then already looked like a real food
   shot. `EXACT_PLACEMENT = true`; the art-director code is kept behind it.
   **Original photo as Image 2 (24 Nov, user's idea):** a bottle cut-out kept the shop showing through the carry loops
   and the AI drew them dark (twice, even when told they were background). Sending the original photo instead of the
   cut-out on white (the composite still says where and which part) fixed it in one test: loops show the new backdrop,
   watermark gone. Now the default (`ORIGINAL_PHOTO = true`).
   **Imperfect photos are made perfect (23 Nov, user's request):** a blurry, small, badly lit or mockup-looking subject
   comes out like a professional product photo (sharp, real reflections, crisp printing, fresh food), same design and
   lettering, people keep their faces and skin tone. One prompt sentence, no extra cost; built without a test (user's
   call). Watch: small Thai lettering on product labels may drift.
2. **ฉากหลัง** — **AI ออกแบบให้ (24 Nov, default):** the AI designs the background from the product in the photo, the words on
   the graphic (theme only, never written) and the graphic's main colour, like the user's Thai drink-ad samples (flying
   ingredients, splashes, glow circles); 2-image test on the bottle: "a lot better". Otherwise: — 9 ready-made **graphic** backgrounds since 23 Nov (`POSTER_SCENES`: flat colour + circle, watercolour river,
   watercolour wash, pop art, Memphis, paper cut, gradient, retro sunburst, party; drawn cards in `SceneArt.tsx`; the subject
   stays a real photo on the design) or **รูปฉากของฉัน** (own photo of the place, realistic).
3. **กราฟิก** — 5 templates (ป้ายแคปซูล, อีเวนต์, ลดราคา, เมนู + ราคา, เรียบหรู), each starting in its
   own default spot, then **adjusted freely on the stage, each part on its own (23 Nov, user's request)**: tap a part
   (e.g. อีเวนต์: คำโปรย, ชื่องาน, วันที่) for a frame with handles, drag to move, a corner = bigger / smaller, a side =
   wider / narrower (the text re-wraps; a narrow frame uses the column layout, a wide one the band layout, which
   replaced the ด้านบน / ด้านล่าง / side chips), plus จัดข้อความ ชิดซ้าย / กึ่งกลาง / ชิดขวา (the selected part, or all).
   Colour set, words (sample text prefilled). The AI sees the real graphic (below); the dashed cyan boxes that used
   to preview the empty area on the stage were removed on 23 Nov.
4. **ขนาด** — where it will be posted (`PLATFORM_ASPECTS`), an optional **สั่งเพิ่มเติม** box (23 Nov, up to 400
   characters, added to the prompt before the no-text rule), then **สร้างภาพด้วย AI**, then **ดาวน์โหลด**.

## The AI request (`/api/poster`, GPT Image 2.6 like the product page)

- Image order: **subject** (Image 1) → **own background photo** (Image 2, only when chosen) → **layout plan** (last):
  **the real text graphic** drawn by the app on white at the poster's aspect (`planImage`, since 23 Nov, user's call: let
  the AI see the graphic so the photo fits it; before that a white frame with cyan blocks over the text area). Test: 2/2
  images drew none of the letters; the composition was about the same as with cyan blocks.
- Prompt (`lib/poster-prompts.ts`): the subject from Image 1 in the scene / in the place of Image 2; the subject must
  not change (2nd sentence, like `PRODUCT_FIRST`); the plan is a guide only (never draw its letters, colours or white
  background); where the text sits is also said in words with percentages (`areaWords`, one place per part, parts that
  touch merge); light and contact shadow match the setting; **no text anywhere**.
- **Text may overlap the subject (23 Nov, user's request, like the Soul After Six sample).** Until 23 Nov the subject
  had to stay out of the text area, so with the graphic at the bottom the AI pushed two people to the top and filled the
  bottom with an empty counter. Now the subject is large and may continue behind the text (a person's lower body or
  clothing, a plain side of a product); faces, heads, hair, hands and labels stay outside; no other objects there.
  Test (2 images, the user's photo, night market, graphic bottom centre, 4,896 tokens each): both people large, the
  area over their shirts, faces out, likeness kept, no text copied; a hand still landed in the area both times; the
  red plaid under the text is busy (readability). Scenes now describe the place only, with no fixed surface (23 Nov):
  a product or food rests on a surface that belongs in the place and suits it; people have nothing in front of them.
- The route pads the plan to the AI size's aspect (`editCanvas` / `toEditCanvas`, centred) and centre-crops the
  full-size answer back to the poster aspect (`cropTo`). Saved as a result with `page: 'poster'` (own history, hidden
  from the model and product pages), logged with all inputs (audit page) and counted in the token quota.

## After the AI answers (browser, free)

- The graphic is drawn on top. The area under it is checked (`zoneStats`) only to pick dark or white letters.
  **No background behind the graphic** (no backing card; user, 20 Nov).
- **The graphic sticks to its output (user, 20 Nov).** Each image stores the graphic it was made with
  (`meta.posterGraphic`). Opening an image from ภาพที่สร้างแล้ว brings back its graphic. รูปใหม่ = the latest setup.
- **Custom colour (user, 24 Nov).** Besides the ready-made colours, a rainbow swatch opens the colour picker; the
  other colours of the set (letters on it, dark text, light paper) are worked out from the chosen one. Picked colours
  are kept as สีของฉัน swatches (up to 8, on this browser) to reuse with one tap.
- **Music-poster graphics (user, 25 Nov).** คอนเสิร์ตย้อนยุค and โปสเตอร์คอนเสิร์ต, modelled on two reference posters
  (Atlanta Jazz Festival, Nina Simone): big narrow titles, plates, stars, arrows, dotted rule. A สไตล์ภาพ choice goes
  with them: ภาพถ่าย (as before) / ขาวดำวินเทจ (1960s black-and-white photo) / ภาพวาดย้อนยุค (1970s screen print in the
  main colour); tested 25 Nov on the user's Soul photo, people stayed recognisable.
- **Name behind the person (user, 27 Nov).** ศิลปิน ชื่อยักษ์หลังตัว, modelled on the user's "Atom live at Thirdpark"
  poster: the artist's name huge across the top, behind the person; small name, event, date and contacts at the bottom.
  After the AI answers, the browser cuts the person out of the picture (free) and draws them over the name. The AI is
  told the word sits behind the subject on a plain backdrop and the head may overlap it. Works best with a plain
  backdrop (สตูดิโอพาสเทลคลีน or สีเรียบ). No QR code yet.
- **Edits on a generated image are saved with it (user, 24 Nov).** Moving, resizing, recolouring, rewording or changing
  the design while viewing a generated image is saved to that image's `posterGraphic` (`/api/update`, 0.6 s after the
  last change, or at once when switching images / generating / leaving). The AI picture and `posterLayout` (where the AI
  left the space) are not changed. Until 24 Nov such edits were only for download.
- Moving the graphic or changing the size after generating shows a note (the empty space may no longer match).

## First real results (user's own runs, 20 Nov)

- Two singers on ฉากพาสเทล and fried chicken on แดดฤดูร้อน, graphic at the top: both kept the graphic area calm.
- The chicken image got the Thai menu name drawn in it, most likely copied from a caption on the subject photo (the
  prompt allowed "text printed on the subject"). The rule now keeps only text physically on a product (label,
  packaging) and forbids copying captions, prices or stickers laid over the photo.

## Phases

- **P1 (built, no AI cost):** the page, templates, plan + prompt + route with mocked-AI tests (`scripts/test-poster.mjs`),
  headless check with the AI request intercepted.
- **P2 (paid test, needs the user's go and a real photo, about ฿15–20):** 1 real subject, graphic at the bottom and at
  the side, 3 scenes. Check: is the area under the text calm, is the subject unchanged, does it look natural.
- **P3 (later, after the scope questions):** AI copywriting (3 headline options, voice input), brand kit (logo, colours,
  fonts per account), save a poster as a re-editable recipe, carousel/series, more templates by the design team, LINE.

## Open scope questions (from 20 Nov)

1. First users: restaurants / venues and events / existing Lolo customers?
2. Web, LINE, or both?
3. Output: single poster, carousel, or also caption + posting?
4. Inside Lolo, or its own brand?

## On production (27 Nov): superadmin only

Merged to main and deployed at the user's request, visible to the superadmin account only: the tab, the page (`proxy.ts`
redirects other accounts to `/`) and the two APIs (`canUsePoster` in `lib/account.ts`, 403). Opening it to customers =
change those three places.
