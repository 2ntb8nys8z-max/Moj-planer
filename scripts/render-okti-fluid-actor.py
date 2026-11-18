"""Build the live, continuous actor and RGB/alpha atlas from the 60 Hz master."""
from pathlib import Path
import subprocess
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'artwork/okti-listening'))
import pose

def pipe(args, **kwargs):
    return subprocess.Popen(['ffmpeg','-v','error','-y',*args], **kwargs)

def main():
    # The reference has genuine 60 Hz intermediate positions. Sample every
    # second master frame; no alpha dissolve between moving fingertips.
    fps = 30
    decoder=pipe(['-i',str(ROOT/'octi-water-motion.mp4'),'-vf','fps=30',
                  '-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
    encoder=pipe(['-f','rawvideo','-pix_fmt','rgb24','-s','1088x544','-r','30',
                  '-i','-','-an','-vf','scale=768:384:flags=lanczos',
                  '-c:v','libx264','-profile:v','baseline','-level','3.1',
                  '-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',
                  str(ROOT/'octi-listening-body.mp4')],stdin=subprocess.PIPE)
    head=Image.open(ROOT/'octi-water-poster-332.webp').convert('RGBA')
    head=np.asarray(head).astype(float)
    y,x=np.indices(head.shape[:2])
    # Preserve a white core in the three small printed bars after WebP chroma
    # subsampling and Safari's final bilinear reduction to button size.
    ink=(head[:,:,0]>189)&(abs(x-192)<21)&(y>144)&(y<185)
    white=ndi.gaussian_filter(ndi.maximum_filter(ink.astype(float),size=3),.4)[:,:,None]
    head[:,:,:3]+=(255-head[:,:,:3])*white
    # Keep the approved rest head and its marking. Only blend in the neck
    # where the source and the printed material occupy the same body.
    weight=np.clip((207-y)/12,0,1)*np.clip((44-abs(x-192))/5,0,1)
    # The source contains the old glass as well as the animal. Its blue
    # caustic can touch an arm in a color mask. Use the two neighboring
    # approved silhouettes as a loose spatial envelope, never as a crossfade.
    guide=Image.open(ROOT/'octi-actor-idle.webp')
    envelopes=[]
    for index in range(guide.n_frames):
        guide.seek(index)
        alpha=np.asarray(guide.convert('RGBA').getchannel('A').resize((544,544)))>64
        envelopes.append(ndi.maximum_filter(alpha, size=17))
    frames=[]
    try:
        for i in range(144):
            frame=np.frombuffer(decoder.stdout.read(544*544*3),np.uint8).reshape(544,544,3)
            left=i//2
            mask=pose.silhouette(frame)&(envelopes[left]|envelopes[(left+1)%len(envelopes)])
            labels,_=ndi.label(mask)
            mask=labels==labels[238,272]
            # Close only pinholes within the material. Large gaps between
            # curled arms are part of the silhouette and must stay transparent.
            holes,n=ndi.label(ndi.binary_fill_holes(mask)&~mask)
            areas=np.bincount(holes.ravel());small=areas<32;small[0]=False
            color,alpha=pose.matte(frame,mask|small[holes])
            gray=(alpha*255).astype(np.uint8)
            encoder.stdin.write(np.concatenate((color,np.repeat(gray[:,:,None],3,axis=2)),axis=1).tobytes())
            native=np.array(Image.fromarray(np.dstack((color,gray))).resize((384,384),Image.Resampling.LANCZOS),float)
            # Do not paint a second silhouette at the crown.
            native=native*(1-weight[:,:,None])+head*weight[:,:,None]
            frames.append(Image.fromarray(np.uint8(np.clip(native+.5,0,255))))
    finally:
        encoder.stdin.close();decoder.stdout.close()
    if encoder.wait() or decoder.wait():raise RuntimeError('Actor encoding failed')
    durations=[round((i+1)*1000/fps)-round(i*1000/fps) for i in range(len(frames))]
    frames[0].save(ROOT/'octi-water-idle-332.webp',save_all=True,append_images=frames[1:],
                   duration=durations,loop=0,quality=89,method=4,alpha_quality=100)

if __name__=='__main__': main()
