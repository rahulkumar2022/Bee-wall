# Reuse this checklist when staging a YouTube Playables game

- Ship the interactive ZIP separately from any video, source tree or listing artwork. Put `index.html` at ZIP root; load the official SDK before game code. A second offline build can in-line all assets and omit the SDK entirely.
- Exercise cloud ready/load/save sequencing, current official CSP, and mute/host pause in a browser before the real Test Suite. Gate before touching browser storage: reading an SDK no-op as a hosted runtime loses dev progress; a hosted load error must never permit a write that could replace unread progress.
- Check the live Test Suite in a local full browser; the controls are mounted asynchronously under `main-app` (wait for the Game URL field). Point it to localhost; that is separate from uploading or publishing. The live application and human device matrix are still separate gates.
- Deterministic physics should ship with reproducible per-level input and no-move controls, not just a solver assertion. Run actual mouse/touch replays on production HTML and compare final state/score/save; do not derive human clear rate from solver output.
