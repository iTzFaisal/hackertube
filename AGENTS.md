# AGENTS.md

HackerTube for Samsung TVs: a plain ES5 Tizen web app (`app/`), a Cloudflare
Worker CORS proxy (`proxy/`), and Node scripts for dev/package (`scripts/`).
No bundler, transpiler, framework, or app-level dependencies. TV install and
signing steps live in `README.md`; don't duplicate them here.

## Commands

- `npm install` — root only; `proxy/` has no dependencies. Node 20+.
- `npm run dev` — serves `app/` at http://127.0.0.1:4173 and proxies `/api` to
  hackertube.org, so the browser preview needs no deployed Worker.
- `npm run check` — `node --check` over `app/js/*.js` plus `app/config.xml` and
  asset assertions. There is no lint/typecheck and this does not catch
  ES5-incompatible syntax.
- `npm test` — Playwright at 1920×1080, Chrome channel, one worker; starts or
  reuses the dev server. Requires network and Google Chrome.
  Single test: `npx playwright test -g "hands a video"`.
  Single file/line: `npm test -- tests/app.spec.js:31`.
- `npm run package -- --api https://YOUR-WORKER.workers.dev` — writes unsigned
  `dist/HackerTube.wgt` and staged `build/HackerTube/`. The script appends
  `/api`; `HACKERTUBE_API_BASE` also works. `npm run package:tv` uses the
  project's deployed Worker.
- `npm run deploy:proxy` — deploys `proxy/` with `npx wrangler@latest`.

## App constraints

- `app/index.html` loads classic scripts in order; app modules are IIFEs that
  attach to `window.HT` (`config.js` sets `window.HACKERTUBE_CONFIG`). Add new
  script files to `index.html` in dependency order.
- Keep `app/` ES5: no `const`/`let`, arrow functions, template literals, ES
  modules, or modern syntax. Nothing transpiles it; the Tizen webview runs the
  source directly.
- Never insert API data with `innerHTML`. Build DOM with `HT.dom.h` and
  `textContent` (see `app/js/dom.js`).
- CSS must avoid `display: grid`, `gap`, `aspect-ratio`, `inset`, `:is()` and
  `:where()` — documented at the top of `app/css/app.css`. Use flexbox and
  explicit offsets instead.

## Architecture

- `app/js/app.js` — boot, page stack, sidebar, remote keys. OK plays; hold OK
  (~600 ms) opens details for elements with `data-long="details"`; Info also
  opens details. New sidebar sections need an entry in `sections` and a branch
  in `App.prototype.sectionPage`.
- `app/js/screens.js` — all pages. New screens should subclass
  `HT.screens.Page` and use its `show`/`hide`/`dispose` lifecycle.
- `app/js/focus.js` — geometric D-pad navigation. It only scans `.focusable`
  elements inside `#sidebar` and `#pages .page.active`; `data-key` is how a
  page remembers and restores focus.
- `app/js/api.js` — hackertube.org JSON client; `app/js/library.js` — likes,
  history and Watch later in `localStorage` (`hackertube.library.v1`);
  `app/js/youtube.js` — Tizen app-control handoff to YouTube.
- `proxy/worker.js` is the production CORS proxy; `scripts/dev-server.mjs`
  provides the same `/api` proxy for local development.
- `app/js/config.js` uses `apiBase: ''` for same-origin `/api`. The packager
  patches the build copy with a regex matching that exact form, so don't
  reformat the line. A packaged build with an empty `apiBase` shows the setup
  screen.

## Gotchas

- `npm test` overwrites tracked screenshots in `docs/*.png` (home, details,
  search, categories, playlist, and others). Revert them if the change is not
  intentional.
- Tests hit the live hackertube.org API, so they fail offline and can break
  when upstream data changes.
- Releases run only on `v*` tags. `.github/workflows/release.yml` fails unless
  the tag, `package.json` version, and `app/config.xml` version all match.
  Bump both versions before tagging. No CI workflow runs the tests.
- Packaging uses fflate's seekable `zipSync`; Tizen rejects streaming zips with
  data descriptors. Don't replace it with a streaming archiver.
- `build/` and `dist/` are generated and gitignored. Edit `app/`, never
  `build/`.
