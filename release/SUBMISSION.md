# Bee Wall – YouTube Playables handoff

Status: locally buildable release candidate. Not uploaded or approved. Confirm your channel has access before starting; Google describes developer access as early access and the Portal as invitation-only/private preview.[6][8]

## Listing copy

- Title: Bee Wall
- Genre: Puzzle (use the Portal's closest available tag)
- Language: English
- Description: Draw one wall to save the dog. Hold off the bees for five seconds, earn up to three stars, and solve 40 puzzles across four worlds.
- Developer and publisher: enter your authorized name(s) in the Portal.
- Content: brief comic bee contact with no injury shown, advertising integrations not added by the game, no purchases, chat, user content or accounts. Complete the Portal's age rating questionnaire yourself; this is a general-audience game, not marketed specifically to children.[11]

## Upload and review

1. If your channel is not onboarded, use the interest form linked from Google's Playables overview.[8]
2. Open https://www.youtube.com/playables_portal with an authorized channel account. Add a new game, upload `Bee-Wall-Playables-v1.0.0.zip`, and select `index.html` at the archive root.[6][9]
3. Enter listing copy and upload the thumbnails from `listing/` for the ratios the portal requests. Use `screenshots/` if the form asks for gameplay screenshots. Match the pixel requirements shown in your account; the public design requirements call for multiple ratios and no branding or logos. The revision history names 16:9, 1:1, and 5:7.[3][6][14]
   - Thumbnail assets: 1920×1080 (16:9), 1080×1080 (1:1), 1000×1400 (5:7), and optional 1600×1200 (4:3). All are RGB PNGs. Editable artwork and custom-size export live in `../marketing/`.
   - Only select accessibility tags that match the game. Menus support keyboard navigation, but drawing uses a pointer; don't claim full keyboard-only play.[13]
4. Use the Portal's Test step to run its Test Suite and preview on desktop web, mobile web, Android YouTube, and iOS YouTube.[5][6] Check readiness order, storage, audio, pause/resume, resizing, input and final completion.[2][3]
5. Complete Age rating and Review & publish in the Portal after the device and human test gates in `../qa/manual-checklist.md` are satisfied. Public publishing follows YouTube review; this ZIP is not proof of certification.[6][10]

Do not share platform development or staging links outside certification testing.[11] The standalone HTML is separate and is not the upload bundle. Retest support and limits if publishing against a later version of the docs.[4]

## Sources

[2] https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
[3] https://developers.google.com/youtube/gaming/playables/certification/requirements_design
[4] https://developers.google.com/youtube/gaming/playables/certification/requirements_stability
[5] https://developers.google.com/youtube/gaming/playables/reference/test_suite_guide
[6] https://developers.google.com/youtube/gaming/playables/developer_portal
[8] https://developers.google.com/youtube/gaming/playables
[9] https://developers.google.com/youtube/gaming/playables/reference/getting_started
[10] https://developers.google.com/youtube/gaming/playables/certification/requirements
[11] https://developers.google.com/youtube/gaming/playables/certification/requirements_trustsafety
[13] https://developers.google.com/youtube/gaming/playables/certification/requirements_accessibility
[14] https://developers.google.com/youtube/gaming/playables/certification/revisionhistory
