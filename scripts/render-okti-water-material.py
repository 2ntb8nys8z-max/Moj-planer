"""Bake the approved diffuse crown and pressure edge from the original artwork."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
def smooth(x):
    t = np.clip(x, 0, 1)
    return t * t * (3 - 2 * t)

def color_head(frame):
    data = np.asarray(frame, dtype=float) / 255
    h, w = data.shape[:2]
    y, x = (np.indices((h, w)) + .5) * (246 / h) - .5
    u, v = (x - 123) / 21.4, (y - 102) / 32
    normal = np.sqrt(np.maximum(0, 1 - (.95 * u)**2 - (.93 * v)**2))
    diffuse = np.clip(-.48*u - .59*v + .63*normal, 0, 1)
    pool = np.exp(-((u+.46)/.65)**2 - ((v+.68)/.59)**2)
    bounce = .065*np.exp(-((u-.83)/.48)**2 - ((v-.32)/.9)**2)
    skin = np.stack([.016+.043*diffuse+.26*pool, .266+.28*diffuse+.30*pool+bounce,
                     .72+.22*diffuse+.07*pool+.52*bounce], axis=-1)
    ink = smooth((data[:,:,0]-.17)/.79)*smooth((15-abs(x-123))/2)*smooth((y-92)/3)*smooth((122-y)/3)
    skin = skin*(1-ink[:,:,None]) + np.array([.97,.99,1])*ink[:,:,None]
    mask = smooth((135-y)/11)*smooth((26-abs(x-123))/3.5)
    data[:,:,:3] += (skin-data[:,:,:3])*mask[:,:,None]
    return Image.fromarray(np.uint8(np.clip(data*255+.5,0,255)))

for mode in ('idle','poster'):
    source = Image.open(ROOT/f'octi-actor-{mode}.webp')
    frames, times = [], []
    for i in range(source.n_frames):
        source.seek(i)
        frames.append(color_head(source.convert('RGBA')))
        times.append(source.info.get('duration',67))
    frames[0].save(ROOT/f'octi-water-{mode}-332.webp',save_all=True,append_images=frames[1:],
                   duration=times,loop=0,quality=97,method=5)
source = Image.open(ROOT/'octi-listening-head.webp').convert('RGB')
head = np.array(color_head(source.crop((0,0,544,544))), dtype=float)
# Keep the same three printed capsules visible at the 128 CSS-pixel size
# after removing the unrelated white glint from the side of the mantle.
y,x = np.indices(head.shape[:2])
for center,height in ((252,30),(272,45),(292,30)):
    distance=np.hypot(x-center,np.maximum(0,abs(y-232)-(height/2-4)))
    coverage=smooth(4.6-distance)[:,:,None]
    head+=(255-head)*coverage
source.paste(Image.fromarray(np.uint8(head+.5)),(0,0))
source.save(ROOT/'octi-water-head-332.webp',lossless=True)

# A single exterior boundary feeds every optical path. The material only
# thickens in finite sectors, leaving gaps between the deposits.
y,x = np.indices((384,384))+.5
u,v=(x-192)/172,(y-192)/172
depth=(1-np.hypot(u,v))*107
angle=np.arctan2(v,u)
def sector(center,span):
    d=np.arctan2(np.sin(angle-center),np.cos(angle-center))
    return np.exp(-(d/span)**2)
shoulder=sector(-2.48,.56)+.72*sector(-.07,.42)+.72*sector(2.08,.48)
caustic=sector(.69,.38)+.54*sector(-1.56,.24)
for held in (False,True):
    rgb=np.zeros((384,384,3)); alpha=np.zeros((384,384))
    def over(color,a):
        global rgb,alpha
        a=np.clip(a,0,1)*smooth(depth+.5)
        rgb=rgb*(1-a[:,:,None])+np.asarray(color)*a[:,:,None]
        alpha=alpha*(1-a)+a
    d=np.maximum(0,depth)
    if held:
        over([56,128,162],.43*shoulder*np.exp(-d/(3.7+8.5*shoulder)))
        over([72,150,197],.62*shoulder*np.exp(-d/(2.65+10.7*shoulder)))
        over([93,224,226],.81*caustic*np.exp(-d/(2.65+7.3*caustic)))
        over([235,255,250],.88*(sector(.64,.19)+.58*sector(-1.53,.14))*np.exp(-d/4.3))
    else:
        over([127,196,230],.012+.245*np.minimum(1,np.hypot(u,v))**2.6)
        mix=np.clip(.50+.27*u+.34*v,0,1)[:,:,None]
        over(np.array([139,186,214])*(1-mix)+np.array([43,155,187])*mix,.82*np.exp(-d/2.1))
    rgba=np.dstack([rgb/np.maximum(alpha[:,:,None],1e-9),255*alpha])
    name='octi-water-depth-332.png' if held else 'octi-water-shell-332.png'
    Image.fromarray(np.uint8(np.clip(rgba+.5,0,255))).save(ROOT/name)
