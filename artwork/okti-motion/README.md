# Okti logo motion

The production renderer is `scripts/render-okti-motion.py`, invoked with
`npm run render:logo`. It requires Python 3, ffmpeg with librsvg, and the packages
in `requirements.txt` (`python3 -m pip install -r artwork/okti-motion/requirements.txt`).

`reference-motion.mp4` is the silent video supplied by the user as the approved
motion reference: https://grok.com/imagine/post/0109c584-2c89-4119-ac2c-70d9f25b61c6
`art.webp` is the previously approved blank-face microphone artwork. The head
is kept from that artwork; the approved shallow eyes are drawn as vector paths.

The 4.8-second cycle advances forward. A 1.2-second overlap aligns the last
and first movements by matching their continuous outlines and deforming them
with smooth splines before blending them. An opaque foreground mask prevents
background colors fading through the arms. The approved bubble is retained
with a small periodic float.
Both source clocks advance; no reversed section is encoded. Smooth overlap
weights preserve the neighboring motion at each end. The renderer checks the
actual seam against adjacent frame differences. Browser tests repeat this
check after H.264 decoding and verify automatic wraparound.

The older `rig.js`, `scene.html`, and `chains.json` remain as the previous
editable prototype; they are not used to render the current production clip.
