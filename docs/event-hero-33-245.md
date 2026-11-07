# Event header and motion — 33.245

The production baseline was cc3eda5. The existing 2240 ms opening and 1150 ms closing choreography, easing, source tile, flying title/time, pill assembly and recorder handlers remain in place.

## Findings

- In 0c200343 the later `#eventModal #eventHeader .event-header-top` rule forced its gradient with `!important`. It outranked the building-state rule that makes the real row transparent. A stationary, fully painted header could therefore cover the flying panel.
- That same attempt painted the real row with a different gradient from the flight band (`--event-head`), causing a different surface at handoff. Absolute title placement and the negative metadata margin also removed the relationship between measured row height and the visible header, especially when metadata wrapped.
- The gradient-only change in 9ca0e7c changed a shared color variable. The code does not establish that this change alone caused a geometry regression. Do not treat the report as proof of that cause.
- The compact weather observer cleared its contents whenever the modal became hidden, including during the visible exit animation. Weather is now preserved for that exit and follows the existing detail fade.

## Implementation boundary

The decorative element and flight band share `--event-art`. The real decoration is hidden while a flight exists; the top row always stays transparent. `--event-head` and the existing palette selection remain unchanged. The normal-flow grid places controls, title, metadata and weather without negative margins or absolute text positioning. It starts at 230 px and grows for long titles (180 px minimum in short landscape viewports). Short screens can scroll the sheet above the existing dock.

The flight measures the complete header instead of its former top row. Interrupted closes retain the sampled band height as well as the existing sampled panel, opacity and labels. No duration or trajectory was replaced.

The weather view copies the approved forecast artwork with independent SVG IDs. Its reserved grid space prevents asynchronous forecast data from resizing the header. The hidden original forecast no longer reserves an empty content card. The journey line below the address reads an already calculated calendar route via its destination ID; it does not request or calculate another route.

## Verification

`npm run build`, `TZ=Europe/Warsaw npm test`, and `node tests/event-hero-browser-33.cjs`.

The browser suite runs Chromium and WebKit at 320×568, 355×768, 390×844, 430×932 and 844×390. It records frames/video, checks real decoration visibility and full-header band geometry, delayed weather size stability, touch/navigation, menus, natural completion, interruption, immediate reopen, long/all-day titles, notes, routes, reduced motion and background cleanup. Weather/routes are deterministic fixtures. These tests do not verify a live microphone, model or Cloudflare provider. WebKit on a Linux runner is not a physical iPhone test.

Visual artifacts are retained by the Event header visual regression workflow for 14 days.
