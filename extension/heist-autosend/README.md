# Heist auto-send (Firefox)

When Discord (open in Firefox) shows a **new** Heist image — `locksmith-captcha`, `locksmith-morse`,
`locksmith-binary`, `locksmith-a1z26`, `vanguard-braille`, `vanguard-sort`, `gunner-shoot` (.png or .webp), and `heist-map` only when
**Blackout** is ticked in the toolbar popup — this sends it to the open Heist app and copies the answer.
It never reads or changes Discord's page and never sends anything to Discord.

- **Glass / Guard (digits → words), Caesar and Sort:** the instruction ("spell only the even digits, left to right",
  "shift every letter 5 to the right", "sort the numbers descending") is read from a **screenshot of the Discord tab**: the extension finds the
  white puzzle picture and OCRs the 2–3 lines above it (~0.3 s). If it can't read the instruction it does NOT
  copy, it notifies you instead. Puzzles for other players are copied too (the notification says who it was for).
- **Morse, Binary, A1Z26, Braille, Captcha** (and Sort): the file name tells the app which puzzle it is, so it doesn't have to
  guess; if that fails it falls back to auto-detect. The app goes back to "All" afterwards.

## Install
1. Open the Heist app in Firefox (the built `dist/*.html` → Heist, or `npm run dev` → `#play=heist`).
2. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `manifest.json`.
   (Temporary = until Firefox restarts. To keep it: sign it for free as "unlisted" on addons.mozilla.org
   with `npx web-ext sign`, or use Firefox Developer Edition with `xpinstall.signatures.required = false`.)
3. Keep the Discord tab in front while playing (the screenshot is of the tab on screen).

**On / off:** the toolbar button's popup has an ON/OFF switch (the icon shows "OFF" while it's off). Off means
nothing is watched, screenshotted or read. It stays as you left it across Firefox restarts.

Settings (file names, puzzle modes, max age, notifications) are at the top of `background.js`. The extension's
console (about:debugging → **Inspect**) logs every ignored attachment, the app's reading and the OCR'd
instruction, so problems are easy to see.

`ocr/` is Tesseract.js 5.1.1 (Apache-2.0) with the English `best_int` model, bundled so nothing is downloaded.
