# Okti logo motion

The production renderer is `scripts/render-okti-motion.py`, invoked with
`npm run render:logo`. It requires Python 3, ffmpeg with librsvg, and the packages
in `requirements.txt` (`python3 -m pip install -r artwork/okti-motion/requirements.txt`).

`reference-motion.mp4` is the silent video supplied by the user as the approved
motion reference: https://grok.com/imagine/post/0109c584-2c89-4119-ac2c-70d9f25b61c6
`art.webp` is the previously approved blank-face microphone artwork. The head
is kept from that artwork; the approved shallow eyes are drawn as vector paths.

The 4.8-second cycle advances forward. The first 5.4 seconds of the reference
are slowed by 10%, excluding the final fraction in which two inner tips merge.
A 1.2-second overlap identifies all eight tips and the roots between them.
The two banks of each arm have a consistent identity; interpolating its bends
and lengths prevents a curled arm collapsing into a short stub halfway through
the join. Smooth splines carry the foreground colors to the resulting outline.
One opaque silhouette and extended foreground colors prevent doubled arms,
eroded tips and pale background showing through. The approved bubble is retained
with a small periodic float. The original capsule and eyes are composited last.
Both source clocks advance; no reversed section is encoded. Smooth overlap
weights preserve the neighboring motion at each end. The renderer checks the
actual seam against adjacent frame differences. Browser tests repeat this
check after H.264 decoding and verify automatic wraparound.

The older `rig.js`, `scene.html`, and `chains.json` remain as the previous
editable prototype; they are not used to render the current production clip.
