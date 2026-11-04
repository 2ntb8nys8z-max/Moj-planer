"""Render the approved wave with a forward, motion-matched periodic seam."""
from pathlib import Path
import json
import subprocess
import tempfile
import math
from okti_motion_contours import mascot_mask, signed_distance, prepare_pairs, motion_blend, clear_background
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'artwork/okti-motion'
FPS, RAW_COUNT, OVERLAP, SIZE = 60, 360, 72, 544
COUNT = RAW_COUNT-OVERLAP
cv2.setNumThreads(2)

def run(args):
    return subprocess.run(['ffmpeg','-hide_banner','-loglevel','error',*args],check=True)

def ease(x):
    x=max(0.,min(1.,x))
    return x*x*(3-2*x)

def eye_art(time):
    smile=ease((time-.45)/.8)*(1-ease((time-3.05)/.8))
    collapse,spread=ease(smile/.5),ease((smile-.5)/.5)
    s=SIZE/1254
    cx,cy,w,h=627*s,535*s,220*s,319*s
    line=w*.058
    apex=cy-h*.055
    anchor=cy+(apex-cy)*collapse
    remain,half=h*.087*(1-collapse),w*.143*spread
    parts=[]
    def path(d,**attrs):
        props=' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())
        return f'<path d="{d}" {props}/>'
    for side in [-1,1]:
        ex=cx+side*w*.204
        if spread<.00001:
            parts.append(path(f'M{ex} {anchor-remain} V{anchor+remain}',stroke='white',stroke_width=line,stroke_linecap='round',fill='none'))
        else:
            rise=w*.081*spread
            y=apex+rise
            outer,inner=w*.110*spread,w*.052*spread
            temporary=line*(1-spread)
            if temporary>.01:
                d=f'M{ex-half} {y} C{ex-half*2/3} {y-rise*4/3} {ex+half*2/3} {y-rise*4/3} {ex+half} {y}'
                parts.append(path(d,stroke='white',stroke_width=temporary,stroke_linecap='round',fill='none'))
            d=f'M{ex-half} {y} C{ex-half*.60} {y-outer*4/3} {ex+half*.60} {y-outer*4/3} {ex+half} {y} C{ex+half*.55} {y-inner*4/3} {ex-half*.55} {y-inner*4/3} {ex-half} {y} Z'
            parts.append(path(d,fill='white'))
    parts.append(path(f'M{cx} {cy-h*.155} V{cy+h*.155}',stroke='white',stroke_width=line,stroke_linecap='round',opacity=1-smile,fill='none'))
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}"><g transform="translate(0,{.65*math.sin(2*math.pi*time/4.8)})">'+''.join(parts)+'</g></svg>'

def main():
    with tempfile.TemporaryDirectory(prefix='okti-forward-loop-') as folder:
        temp=Path(folder)
        # Use the original approved capsule. The taller alpha also clears the
        # old reference head when it rises, preventing a second cyan rim.
        mask='255*clip((61-sqrt(pow(X-272,2)+pow(Y-clip(Y,188,247),2)))/2,0,1)'
        head=temp/'head.png'
        run(['-i',str(ART/'art.webp'),'-vf',"scale=544:544,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='"+mask+"'",'-frames:v','1','-y',str(head)])
        # The reference's final fraction merges two inner tips. End at 5.4s,
        # while all eight tips remain distinct, and slow the forward wave 10%.
        command=['ffmpeg','-hide_banner','-loglevel','error','-i',str(ART/'reference-motion.mp4'),'-loop','1','-framerate','24','-i',str(head),'-filter_complex_threads','1','-filter_complex','[0:v:0]trim=duration=5.4,setpts=(PTS-STARTPTS)*10/9[wave];[wave][1:v]overlay=shortest=1:format=auto,minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,tpad=stop_mode=clone:stop_duration=0.2,trim=end_frame=360,format=bgr24[result]','-map','[result]','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','bgr24','-']
        raw=subprocess.check_output(command)
        frames=np.frombuffer(raw,np.uint8).reshape(-1,SIZE,SIZE,3)
        assert len(frames)==RAW_COUNT,len(frames)
        start=RAW_COUNT-OVERLAP
        points_a,points_b=prepare_pairs(frames[start:],frames[:OVERLAP])
        canonical=cv2.resize(cv2.imread(str(ART/'art.webp')),(SIZE,SIZE))
        background=clear_background(canonical)
        y,x=np.mgrid[:SIZE,:SIZE].astype(np.float32)
        grid=np.dstack((x,y))
        head_rgba=cv2.imread(str(head),cv2.IMREAD_UNCHANGED)
        head_alpha=head_rgba[...,3:4].astype(np.float32)/255
        qa={}
        for i in range(COUNT):
            if i<COUNT-OVERLAP:
                color=frames[i+OVERLAP].astype(np.float32)
                opacity=np.clip(signed_distance(mascot_mask(frames[i+OVERLAP]))+.5,0,1)
            else:
                k=i-(COUNT-OVERLAP)
                u=k/OVERLAP
                alpha=u*u*u*(10+u*(-15+6*u))
                color,opacity=motion_blend(frames[start+k],frames[k],points_a[k],points_b[k],alpha,grid)
            frame=np.clip(np.rint(opacity[...,None]*color+(1-opacity[...,None])*background),0,255).astype(np.uint8)
            # Keep the capsule fixed while the arms follow the reference wave.
            frame=np.rint(head_alpha*head_rgba[...,:3]+(1-head_alpha)*frame).astype(np.uint8)
            bob=.65*math.sin(2*math.pi*i/COUNT)
            frame=cv2.warpAffine(frame,np.float32([[1,0,0],[0,1,bob]]),(SIZE,SIZE),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT101)
            assert cv2.imwrite(str(temp/f'body-{i:03d}.png'),frame)
            (temp/f'eyes-{i:03d}.svg').write_text(eye_art(i/FPS))
            if i in [0,1,2,COUNT-3,COUNT-2,COUNT-1]:qa[i]=frame
        region=np.s_[280:435,120:424]
        difference=lambda a,b:float(np.mean(np.abs(a[region].astype(float)-b[region])))
        seam=difference(qa[COUNT-1],qa[0])
        neighbors=[difference(qa[COUNT-3],qa[COUNT-2]),difference(qa[COUNT-2],qa[COUNT-1]),difference(qa[0],qa[1]),difference(qa[1],qa[2])]
        assert .01<seam<max(neighbors)*1.5+.25,(seam,neighbors)
        print('Forward loop join:',json.dumps({'duration':COUNT/FPS,'seamDelta':seam,'adjacentDeltas':neighbors}),flush=True)
        video=temp/'motion.mp4'
        run(['-framerate','60','-i',str(temp/'body-%03d.png'),'-framerate','60','-i',str(temp/'eyes-%03d.svg'),'-filter_complex','[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[result]','-map','[result]','-an','-c:v','libx264','-profile:v','baseline','-level','3.1','-pix_fmt','yuv420p','-preset','slow','-crf','20','-movflags','+faststart','-y',str(video)])
        (ROOT/'octi-water-motion.mp4').write_bytes(video.read_bytes())
        run(['-i',str(video),'-frames:v','1','-c:v','libwebp','-quality','92','-y',str(ROOT/'octi-water-motion-poster.webp')])
        # Decode this exact MP4 so the animated fallback shares its sequence.
        run(['-i',str(video),'-vf','scale=320:320','-an','-c:v','libwebp_anim','-quality','84','-loop','0','-y',str(ROOT/'octi-water-motion.webp')])
        print('Rendered 4.8-second forward Okti wave at 60 fps; fallback and poster ready.')

if __name__=='__main__':main()
