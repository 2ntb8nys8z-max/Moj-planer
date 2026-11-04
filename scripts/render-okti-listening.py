"""Export the approved listening artwork as WebGL textures and a safe fallback.

Run from any directory with Python, NumPy, SciPy, Pillow and ffmpeg available.
The existing approved idle movie is an input and is never overwritten.
"""
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'artwork/okti-listening'))
import pose
import gesture


def main():
    frames,canonical,hc,ha,background=gesture.assets()
    background.save(ROOT/'octi-listening-background.webp',lossless=True,quality=100)
    gray=np.repeat(np.uint8(np.clip(ha,0,1)*255)[...,None],3,axis=-1)
    Image.fromarray(np.concatenate((hc,gray),axis=1),'RGB').save(
        ROOT/'octi-listening-head.webp',lossless=True,quality=100)
    encoder=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo',
        '-pix_fmt','rgb24','-s','1088x544','-r',str(pose.FPS),'-i','-',
        '-vf','scale=768:384:flags=lanczos','-an','-c:v','libx264','-profile:v','baseline','-level','3.1',
        '-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',
        str(ROOT/'octi-listening-body.mp4')],stdin=subprocess.PIPE)
    pose.recording_amount=lambda _:1.
    gesture.gesture=lambda _:1.
    fallback=[]
    try:
        for i,frame in enumerate(frames):
            color,alpha=pose.matte(frame,pose.silhouette(frame))
            gray=np.repeat(np.uint8(np.clip(alpha,0,1)*255)[...,None],3,axis=-1)
            encoder.stdin.write(np.concatenate((color,gray),axis=1).tobytes())
            held=gesture.render(frame,canonical,hc,ha,background,i/pose.FPS)
            if i==0:held.save(ROOT/'octi-listening-poster.webp',lossless=True,quality=100)
            fallback.append(held.resize((320,320),Image.Resampling.LANCZOS))
            if i%30==0:print(f'Listening assets: {i}/{len(frames)}',flush=True)
    finally:
        encoder.stdin.close()
    if encoder.wait():raise RuntimeError('Body atlas encoder failed')
    fallback[0].save(ROOT/'octi-listening-fallback.webp',save_all=True,
        append_images=fallback[1:],duration=round(1000/pose.FPS),loop=0,
        quality=84,method=4)
    print('Listening textures, continuous held pose, fallback and poster ready.')


if __name__=='__main__':main()
