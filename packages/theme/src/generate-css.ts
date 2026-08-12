import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appCss, firstlightCss } from './css.js';

// Build step: writes the generated CSS contracts to the package root so apps can
// `@import "@khelkhud/theme/firstlight.css"`. Runs via `pnpm build` in this package,
// which turbo schedules before the web build (`build` dependsOn `^build`).
//
// The outputs ARE committed. They are deterministic, and a design-token diff is one of
// the more useful things to see in a review — but they are still generated: edit
// tokens.ts, never the .css.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

fs.writeFileSync(path.join(root, 'firstlight.css'), firstlightCss());
fs.writeFileSync(path.join(root, 'app.css'), appCss());
console.log('@khelkhud/theme: generated firstlight.css and app.css from tokens.');
