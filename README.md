# Bee Wall

Bee Wall is an HTML5 puzzle for YouTube Playables. Draw one continuous ink wall and keep the dog safe for five seconds. Clear 40 levels across Meadow, Barn, Garden, and Orchard, with up to three stars per level.

## Play now

If you cloned the source, run `npm ci` and `npm run build` first. Then open `dist/standalone/index.html` in a browser. It works from a file and uses no network. Use a finger, mouse, or stylus. R restarts an attempt; Escape closes a menu. The offline build saves to browser storage if available. If a browser blocks file-origin storage, use `npm run serve` and open the standalone URL instead.

## Build and test

Requires Node.js 22+, npm, and `zip` on PATH.

```sh
npm ci
npx playwright install chromium webkit firefox
npm run build
npm test
node --test scripts/bundle-qa.mjs
npm run test:browser
npm run serve -- --csp
```

`npm run build` generates the offline game and the Playables upload ZIP, `release/Bee-Wall-Playables-v1.0.0.zip`. The entry point is `index.html` at ZIP root. The only Playables network load is the required YouTube v1 SDK.[1][9] Progress is stored only via the SDK inside the platform; standalone storage is not used there.[2]

The board, portraits, effects and music are original vector and synthesized game assets. Baloo 2 is bundled under the SIL Open Font License; see `assets/OFL-Baloo2.txt`. No third-party analytics, ads, user accounts, cookies or personal identifiers are added by the game. Its internal gameplay events are available in the standalone debug build's in-memory buffer, not sent to a telemetry service.

## Source and debugging

- `src/levels.json`: data for all worlds and levels.
- `src/engine.js`: one-stroke input, deterministic bee physics and rating.
- `src/art.js`, `src/sound.js`: visuals and Web Audio.
- `src/platform.js`: save schema, official SDK adapter and in-memory events.
- `qa/solutions.json`: two reproducible solution strokes per level in board coordinates.
- `qa/manual-checklist.md`: interactive QA and remaining release gates.

Add `?debug=1` to the served standalone URL for FPS, bee count, remaining ink, and these browser-console diagnostics: `BeeWallDebug.snapshot()`, `.events()`, `.replay()`. Debug mode is not part of the Playables build. For local Playables CSP testing, serve `dist/playables/` via `npm run serve -- --csp`.[5] `node scripts/official-sdk-qa.mjs` runs the public SDK Test Suite against the local release. For the verified build, see `release/QA-REPORT.md`; for upload instructions and listing assets, see `release/SUBMISSION.md`.

## Sources

[1] https://developers.google.com/youtube/gaming/playables/reference/sdk
[2] https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
[5] https://developers.google.com/youtube/gaming/playables/reference/test_suite_guide
[9] https://developers.google.com/youtube/gaming/playables/reference/getting_started
