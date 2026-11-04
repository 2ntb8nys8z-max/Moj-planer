# Okti listening

`octi-listening.js` decorates the existing recording state in all three docks.
It does not change recording, sending, transcription, dialogue or stored data.
The approach is 720 ms, the return is 700 ms, and listening holds until recording
ends. A shared camera move enlarges the arms and body. The shallow capsule turns
8 degrees with a small pitch/roll; the light and the three calm microphone bars
follow its surface. The glass has its original independent breathing motion.

`scripts/render-okti-listening.py` reproduces the textures from the unchanged idle
movie and blank microphone artwork. It needs Python, ffmpeg, Pillow, NumPy and
SciPy. The opaque body atlas contains RGB on its left and alpha on its right.
The video is 768x384 at 25 fps. Only the visible, recording dock plays it.

Unsupported WebGL or blocked/stalled video uses a continuously held animated
WebP; reduced motion uses the still listening poster. These fallbacks do not run
the fixed-duration approach/return demonstration while the user is recording.
All artwork is decorative and leaves the existing recorder hit target intact.

Tests: `node tests/octi-listening-33.cjs` checks event-driven state transitions
with mocked graphics. `node tests/octi-listening-browser-33.cjs` checks the real
GLSL renderer at phone icon size, duration, return and fallback behavior. The
browser fixture is served beside the generated assets only during testing.
