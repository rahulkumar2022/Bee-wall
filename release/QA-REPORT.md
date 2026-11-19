# Bee Wall 1.0.0 — local release QA

Result: local release candidate passes automated game, browser, ZIP, and official public SDK checks. Not uploaded to YouTube, approved, or tested in an authorized YouTube app preview.

| Check | Result |
|---|---|
| Engine, save, art, audio and compatibility tests | 69 passed |
| Playables, offline and GitHub Pages packaging | 3 passed |
| Level replays | 40/40 levels, 2 distinct winning strokes each, 8 variants per stroke (640 winning simulations) |
| Browser scenarios | 7/7 — Chromium desktop/Android emulation, WebKit iPhone emulation, Firefox offline |
| YouTube Playables public SDK Test Suite | 5/5 MUST checks; both SHOULD checks marked passed |
| Submission ZIP | 62,225 bytes. `unzip -tq` passed. Root contains `index.html` and `OFL-Baloo2.txt` only. |
| Listing assets | 4 valid RGB PNG thumbnails; 4 clean 1080×1920 gameplay screenshots |

## Observed evidence

- Official Test Suite logged 0.317 s to `gameReady` on localhost, a 221-byte save after clearing Level 1, and a valid integer score. It reported 0 B for localhost transfer size; use the size of the actual archive, not that estimate, for the local handoff. This is not an on-device load benchmark or a cloud-persistence result from the production app.
- Browser automation covered pointer/stylus/touch input, multi-touch rejection, failure and outside-board retry, ink exhaustion, five-failure skip, screen rotation, extreme aspect ratios, 20 rapid restarts, dark and reduced-motion settings, keyboard focus, reset confirmation, level 40 completion, and no unintended network fetches. Host lifecycle/cloud scenarios used an SDK fixture; the public SDK run independently used Google's actual SDK.
- Muting and pausing produced silence on a real Chromium Web Audio graph; sound resumed under the correct platform settings. Separate music and effects controls were checked.
- Fixed after failing regressions: missing `Array.at` on older browser runtimes, debug bridge retained in the production bundle, and taps outside the board not retrying after failure.

Raw evidence: `../qa/evidence/browser-results.json`, `../qa/evidence/official-sdk-results.txt`, and `../qa/evidence/official-sdk-suite.png`. Re-run with `npm test`, `node --test scripts/bundle-qa.mjs`, `node scripts/verify-levels.mjs`, `npm run test:browser`, and `node scripts/official-sdk-qa.mjs` after `npm run build`.

## Remaining gates

Real Android/iOS YouTube previews, wider physical device matrix, moderated usability, low-end Android soak and performance, authenticated portal thumbnail validation, age rating and certification review are outstanding. The browser runs and deterministic solutions do not establish human clear rates, mobile performance budgets, or physical haptic behavior. Use `../qa/manual-checklist.md` and `SUBMISSION.md` for those gates.

Final ZIP SHA-256: `5fb0cc3d1baebff6780c14c75de7d8f6082479fc6339dd42ff9f08dc2e64dbfb`.
