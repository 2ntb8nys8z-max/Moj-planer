'use strict';

// The fold is the perpendicular bisector between the resting corner and the
// lifted tip. Reflecting the peeled part across it keeps the two faces joined.
function pageTurnFrames(width, height) {
  const front = [], back = [], lighting = [], shadow = [];
  const reach = 4 * Math.hypot(width, height);
  const point = (x,y) => x.toFixed(2)+'px '+y.toFixed(2)+'px';
  for (let i=0; i<=48; i++) {
    const t=i/48, swing=t*t*(3-2*t);
    const angle=(-48+41*swing)*Math.PI/180;
    const nx=Math.cos(angle), ny=Math.sin(angle);
    const span=nx*width-ny*height;
    const distance=-width*.035+(span+width*.075)*Math.pow(t,1.24);
    const x=distance*nx, y=height+distance*ny;
    const ax=x-ny*reach, ay=y+nx*reach, bx=x+ny*reach, by=y-nx*reach;
    const mask=side=>'polygon('+[point(ax,ay),point(bx,by),
      point(bx+side*reach*nx,by+side*reach*ny),point(ax+side*reach*nx,ay+side*reach*ny)].join(',')+')';
    front.push({clipPath:mask(1)});

    // Foreshorten the reverse face as the leaf tips up past the far edge.
    const k=.91-.85*Math.pow(t,3), scale=1+k;
    const intercept=distance+ny*height;
    const matrix=[1-scale*nx*nx,-scale*nx*ny,-scale*nx*ny,1-scale*ny*ny,
      scale*intercept*nx,scale*intercept*ny];
    back.push({clipPath:mask(-1),transform:'matrix('+matrix.join(',')+')'});

    const lift=Math.sin(Math.PI*t), band=width*(.035+.13*lift);
    const stop=f=>(distance-band*f).toFixed(2)+'px';
    lighting.push({backgroundImage:'linear-gradient('+(90+angle*180/Math.PI)+'deg,'+
      'rgba(109,85,56,.04) '+stop(1)+',rgba(110,85,55,.21) '+stop(.53)+
      ',rgba(255,249,232,.40) '+stop(.16)+',rgba(232,217,194,.12) '+stop(0)+')'});
    const fade=Math.min(1,(1-t)/.18);
    shadow.push({opacity:fade,filter:'drop-shadow('+(-2-5*lift)+'px '+(1+6*lift)+'px '+
      (1+6*lift)+'px rgba(53,38,24,.37))'});
  }
  return {front,back,lighting,shadow};
}

// Build the turn once. The same timelines can run automatically or be
// scrubbed directly by a finger without measuring or rebuilding the sheet.
function makePageTurn(previous, pose, duration) {
  const wrapper=document.createElement('div');
  wrapper.className='departing paper-turn';
  wrapper.style.transform=pose;
  wrapper.inert=true;
  wrapper.setAttribute('aria-hidden','true');
  const shadow=document.createElement('div'), back=document.createElement('div'), light=document.createElement('div');
  shadow.className='turn-shadow';
  back.className='turn-back';
  light.className='turn-light';
  const scroller=previous.querySelector('.paper-content'), scroll=scroller.scrollTop;
  previous.replaceWith(wrapper);
  previous.classList.replace('departing','turn-front');
  previous.style.transform='none';
  wrapper.append(previous,shadow);
  shadow.append(back);
  back.append(light);
  scroller.scrollTop=scroll;
  const frames=pageTurnFrames(wrapper.clientWidth,wrapper.clientHeight);
  const timing={duration,fill:'both',easing:'linear'};
  return [previous.animate(frames.front,timing),back.animate(frames.back,timing),
    light.animate(frames.lighting,timing),shadow.animate(frames.shadow,timing)];
}
