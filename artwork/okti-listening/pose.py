"""Review-only listening animation: coupled mantle, roots and trailing arms.

The production wave supplies the arm poses. A single camera move drives both
the foreground mantle and the roots, with a short hydrodynamic arm follow.
No production assets are modified by this renderer.
"""
from pathlib import Path
import math
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT
OUT = ROOT / 'artwork/okti-listening/review'
W = 544
FPS = 25
SECONDS = 4.8
N = round(FPS * SECONDS)
Y, X = np.mgrid[:W, :W].astype(np.float32)


def smooth(t):
    t = np.clip(t, 0, 1)
    return t*t*(3-2*t)


def recording_amount(time):
    if time < .65:
        return 0.0
    if time < 1.37:
        q = (time-.65)/.72
        return 1-(1-q)**3
    if time < 3.35:
        return 1.0
    if time < 4.07:
        return 1-float(smooth((time-3.35)/.72))
    return 0.0


def decode_video():
    raw = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(ASSETS/'octi-water-motion.mp4'),
        '-vf', f'fps={FPS}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'
    ])
    return np.frombuffer(raw, np.uint8).reshape(-1, W, W, 3)


def silhouette(rgb):
    r, g, b = [rgb[..., k].astype(np.int16) for k in range(3)]
    mask = (b-r > 64) & (r < 195) & (g > 55)
    mask[:135] = 0
    mask[435:] = 0
    mask[:, :117] = 0
    mask[:, 427:] = 0
    mask = ndi.binary_closing(mask, iterations=1)
    labels, count = ndi.label(mask)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    mask = labels == int(sizes.argmax())
    # White mic bars are holes in a colour mask; preserve genuine gaps between
    # the arms, filling only holes smaller than a facial mark.
    holes, _ = ndi.label(ndi.binary_fill_holes(mask) & ~mask)
    hs = np.bincount(holes.ravel())
    small = hs < 210
    small[0] = False
    return mask | small[holes]


def matte(rgb, mask):
    # Extend foreground colour into transparent pixels, avoiding a white fringe
    # during the perspective move. Alpha comes from a subpixel signed distance.
    _, indices = ndi.distance_transform_edt(~mask, return_indices=True)
    color = rgb[tuple(indices)]
    distance = ndi.distance_transform_edt(mask)-ndi.distance_transform_edt(~mask)
    alpha = np.clip(distance*.8+.5, 0, 1)
    return color, alpha


def clear_background(rgb, mask):
    points = np.column_stack(np.where(mask))[:, ::-1]
    hull = points[ConvexHull(points).vertices]
    hull_mask = Image.new('L', (W, W))
    ImageDraw.Draw(hull_mask).polygon([tuple(p) for p in hull], fill=255)
    area = ndi.binary_dilation(np.array(hull_mask)>0, iterations=8)
    background = rgb.copy().astype(float)
    for y in range(W):
        xs = np.flatnonzero(area[y])
        if len(xs):
            lo, hi = xs[0], xs[-1]
            left, right = max(0, lo-3), min(W-1, hi+3)
            u = (np.arange(lo, hi+1)-left)/(right-left)
            background[y, lo:hi+1] = ((1-u[:,None])*rgb[y,left]+u[:,None]*rgb[y,right])
    return Image.fromarray(np.uint8(np.clip(background,0,255)), 'RGB')


def sample(color, alpha, sx, sy):
    coords = [sy, sx]
    rgb = np.stack([ndi.map_coordinates(color[..., k], coords, order=1,
                    mode='nearest') for k in range(3)], axis=-1)
    a = ndi.map_coordinates(alpha, coords, order=1, mode='constant', cval=0)
    return Image.fromarray(np.dstack((rgb, np.uint8(np.clip(a,0,1)*255))), 'RGBA')


def inverse_tilt(x, y, angle, pivot=(272, 292)):
    c, s = math.cos(angle), math.sin(angle)
    dx, dy = x-pivot[0], y-pivot[1]
    return c*dx-s*dy+pivot[0], s*dx+c*dy+pivot[1]


def draw_microphone(image, time, amount):
    # Supersampled vector bars; no painted rectangle or face interpolation.
    layer = Image.new('RGBA', (W*3, W*3))
    draw = ImageDraw.Draw(layer)
    rest = np.array([.55,.85,.55])
    levels = np.array([.58,.75,.58])+np.array([.22,.18,.22])*np.sin(
        np.array([4/4.8,3/4.8,5/4.8])*time*2*math.pi+np.array([0,1.5,3.2]))
    levels += .035*np.sin(np.array([1/4.8,1/4.8,1/4.8])*time*2*math.pi)
    levels = rest*(1-amount)+np.clip(levels,.30,.95)*amount
    for cx, v in zip([252,272,292], levels):
        h, line = 53*v, 5.8
        draw.rounded_rectangle(tuple(3*q for q in (cx-line/2,232-h/2,cx+line/2,232+h/2)),
                               radius=3*line/2, fill='white')
    result = image.copy()
    result.alpha_composite(layer.resize((W,W), Image.Resampling.LANCZOS))
    return result


def render_frame(frame, canonical, head_color, head_alpha, background, time):
    a = recording_amount(time)
    lag = recording_amount(max(0,time-.09))
    tilt = math.radians(11*a)
    # One camera approach acts on the entire animal, including all eight arms.
    # The front mantle then adds a smaller depth difference within that move.
    camera_scale = 1+.40*a
    view_x = (X-272)/camera_scale+272
    view_y = (Y-274)/camera_scale+274
    # The front of the mantle approaches the glass. Its apparent base moves
    # close to the lower-right rim, while the rear body and arms stay deeper.
    root_x = 272+38*a/camera_scale
    root_y = 274+(298+134*a-274)/camera_scale
    rear_x, rear_y = 272+12*a, 298+62*a
    body_mask = silhouette(frame)
    color, alpha = matte(frame, body_mask)
    # The complete head comes from the original blank artwork, avoiding every
    # old eye or mic mark; all video pixels above the arm junction are removed.
    capsule_distance = np.hypot(X-272, Y-np.clip(Y,205,251))
    old_mantle = (1-smooth((capsule_distance-50)/2))*(1-smooth((Y-290)/15))
    old_head_margin = (1-smooth((np.abs(X-272)-60)/7))*(1-smooth((Y-292)/18))
    old_mantle = np.maximum(old_mantle,a*old_head_margin)
    alpha *= 1-old_mantle

    ux, uy = inverse_tilt(view_x,view_y,tilt*.55,(rear_x,rear_y))
    # Inverse arm mesh. Nearby roots follow fully; tips sweep slightly outward
    # and down with a lag, preserving their original continuous wave.
    arm_scale_x = 1+.06*a+.03*lag
    arm_scale_y = 1-.05*a
    sx = (ux-rear_x)/arm_scale_x+272
    side_arch = 27*a*np.clip(np.abs(sx-272)/150,0,1.2)**1.6
    sy = (uy-rear_y+side_arch)/arm_scale_y+298
    tip_weight = np.clip(np.hypot(sx-272, sy-298)/135,0,1)**1.5
    sweep = 7*(a-lag)+3.5*a*math.sin(time*2*math.pi/2.4)
    sx -= np.sign(sx-272)*tip_weight*sweep
    sy -= tip_weight*(5*lag)
    arms = sample(color,alpha,sx,sy)

    front_capsule = np.clip(49-capsule_distance,0,1)
    front_alpha = (1-a)*head_alpha+a*np.minimum(head_alpha,front_capsule)
    clean_head = Image.fromarray(np.dstack((head_color,np.uint8(front_alpha*255))),'RGBA')
    clean_head = draw_microphone(clean_head,time,a)
    hc = np.array(clean_head)[...,:3]
    ha = np.array(clean_head)[...,3].astype(float)/255
    # Strong foreground perspective: the mantle covers its rear attachment and
    # most of the tentacles, like a character pressing against a window.
    ux,uy = inverse_tilt(view_x,view_y,tilt,(root_x,root_y))
    hx = (ux-root_x)/((1+1.65*a)/camera_scale)+272
    hy = (uy-root_y)/((1+1.16*a)/camera_scale)+298
    mantle = sample(hc,ha,hx,hy)

    mascot = Image.new('RGBA',(W,W))
    mascot.alpha_composite(arms)
    mascot.alpha_composite(mantle)
    sphere_alpha = np.clip((194-np.hypot(X-272,Y-274))/1.3,0,1)
    ma = np.array(mascot.getchannel('A'),dtype=float)
    mascot.putalpha(Image.fromarray(np.uint8(ma*sphere_alpha)))
    scene = background.convert('RGBA')
    scene.alpha_composite(mascot)
    # The existing front glass covers arms reaching the inner rim, avoiding a
    # visibly chopped blue outline at the window boundary. This uses the same
    # background once, so the glass ring is never duplicated.
    radius = np.hypot(X-272,Y-274)
    front_glass = background.convert('RGBA')
    front_glass.putalpha(Image.fromarray(np.uint8(smooth((radius-180)/14)*255)))
    scene.alpha_composite(front_glass)

    # Continuous, gentle float and breathing apply to the whole bubble scene.
    phase = 2*math.pi*time/4.8
    bx,by = 1+.009*math.sin(phase),1+.006*math.sin(phase+.6)
    bob = 1.7*math.sin(phase)
    coefficients = (1/bx,0,272-272/bx,0,1/by,274-(274+bob)/by)
    scene = scene.transform((W,W),Image.Transform.AFFINE,coefficients,
                            resample=Image.Resampling.BICUBIC,
                            fillcolor=(236,247,253,255))
    return scene.convert('RGB')


