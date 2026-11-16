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

The approved pose is preserved from commit `058ddbf` (33.239), with the original
coupled arm fan, camera, head perspective and shallow 3-D listening turn. The
33.307 change that froze the arms is reverted. Foreground event ownership and
bounded media/GPU recovery remain independent of this artwork.

Unsupported WebGL or blocked/stalled video uses a Canvas 2D evaluation of the
same historical pose and capsule. It samples the body atlas while video is
available, and the transparent idle poster otherwise. Reduced motion uses the
static poster. Recording state owns the approach, held pose and return; there
is no fixed-duration demonstration during recording.
All artwork is decorative and leaves the existing recorder hit target intact.

Tests: `node tests/octi-listening-33.cjs` checks event-driven state transitions
with mocked graphics. `node tests/octi-listening-browser-33.cjs` checks the real
GLSL renderer at phone icon size, duration, return and fallback behavior. The
browser fixture is served beside the generated assets only during testing.
`tests/octi-listening-history-browser-33.cjs` compares real GPU/Canvas pixels
against a frozen historical renderer at approach, listening and return poses.
