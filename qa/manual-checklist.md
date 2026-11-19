# Bee Wall – interactive regression and release gates

Check the packaged Playables build using the official Test Suite and the Developer Portal preview, not just the offline build. Use a fresh game save for first-launch tests. Save states used by automated tests are fixtures, not evidence of a live YouTube cloud save.

| ID | What to do | Expected |
|----|------------|----------|
| T-01 | Open with no progress. | Meadow level 1 is immediately playable after loading and a ghost hand demonstrates a stroke. |
| T-02 | Start on the dog; then start outside and drag a long segment across it. | A dog-origin stroke does nothing. The accepted ink never runs through the dog. |
| T-03 | Keep drawing in empty space until the ink is spent. | The meter reaches zero; bees release once, before lifting the finger. |
| T-04 | Tap without dragging, then draw a proper line. | Initial tap neither spends ink nor releases bees. A real stroke still works. |
| T-05 | Draw a short, misplaced stroke. | Bee contact freezes at the dog with a visible reaction. Retry is available in about 0.4 s; one tap retries. |
| T-06 | Draw a protective wall. | After five seconds, win and give 3 stars for ≥50% ink, 2 for ≥20%, otherwise 1. |
| T-07 | Restart during an active swarm. | Board and ink reset in under 1 second. No leftover wall or bees from the run. |
| T-08 | Draw a quick diagonal, then throttle rendering/CPU during the chase. | Bees do not cross solid ink or obstacles; no false collision or timer jump. |
| T-09 | Pause on the platform mid-run, then resume. | Bees, clock, animation, input and sound freeze. Resume continues from that time. |
| T-10 | Turn YouTube audio off and on while drawing and while the bees chase. | All output stops while muted and returns only if allowed; in-game settings cannot override platform mute. |
| T-11 | Win, close, and reopen with the same user. | Last unlocked level, settings and stars are restored. |
| T-12 | Supply empty and corrupt loads; separately simulate load rejection. | Fresh run works, and load rejection does not overwrite an unread cloud save. |
| T-13 | Rotate or resize during the chase. | Board scales, input remains correctly mapped, and wall/time remain intact. |
| T-14 | Add a second finger while drawing. | First finger stays in control. No second wall or ink drain. |
| T-15 | Tap restart 20 times; look at loop and heap in the profiler. | Board remains responsive; no duplicate loop or growing heap after GC. |
| T-16 | Clear level 40. | Explicit end-of-content notice; replay and level select work. |
| T-17 | Open settings, reset and cancel. Open again and confirm. | Cancel leaves progress alone. Confirm clears level progress and stars; settings and personal best stay. |
| T-18 | Navigate by Tab, Shift+Tab, Enter/Space, Escape. | Visible focus, modal focus stays inside until closed, buttons reachable, focus returns. |

Also try: five consecutive failures unlock Skip except on the final level; verify recovery after a pointer cancellation; test Assist, sound effects/music/haptics and reduced motion switches or system settings. Test 320 px and tablet layouts, landscape, high DPR, light/dark contrast, and mobile safe-area/player chrome. Confirm the SDK registers readiness, save-before-score ordering, no unexpected requests, and audio lifecycle on actual app and web previews.

## Device and human gates not replaced by local automation

- Android: low-end (2–3 GB RAM), mid-range, flagship; Chrome/mobile web and YouTube app.
- iPhone: two older models and a current model; Safari/mobile web and YouTube app.
- Tablets: iPad and Android; check thin/tall, square, and landscape aspects. Desktop: Chrome, Edge, Firefox, and Safari.
- Performance: throttle network to slow 4G for cold start; run 10 minutes on low-end Android and profile the final Orchard swarm. Target <2 s to interaction (brief), at least 30 FPS, <150 MB, <100 ms visible input response. Record traces instead of inferring hardware performance from desktop or emulated runs.
- Moderated usability: 8–10 people per round, mixed ages, include 3 people aged 45+ and 2 non-gamers. Say only “Play this game.” Record time to first stroke, first fail/retry, confusion, and reach to level 5. Aim for at least 9/10 clearing level 1 unaided and 8/10 reaching level 5; log observations, don’t count automated replays as people. The brief calls for rounds at the vertical slice, beta and release-candidate stages.
- Release sign-off: no open Sev 1s; full Must matrix, performance and usability gates pass; claim YouTube certification only after platform review. Record age rating and owner/publisher details in the Portal.
