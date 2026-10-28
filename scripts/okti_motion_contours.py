"""Match continuous arm outlines before interpolating opaque foregrounds."""
import cv2
import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.ndimage import gaussian_filter1d, distance_transform_edt
from scipy.signal import find_peaks

def mascot_mask(image):
    b,g,r=cv2.split(image)
    mask=((b.astype(np.int16)-r>65)&(r<195)&(g>55)).astype(np.uint8)
    mask[:130]=0;mask[435:]=0;mask[:,:120]=0;mask[:,424:]=0
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    _,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    label=labels[240,272]
    if not label:label=1+np.argmax(stats[1:,cv2.CC_STAT_AREA])
    mask=(labels==label).astype(np.uint8)
    contours,hierarchy=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
    if hierarchy is not None:
        for contour,relation in zip(contours,hierarchy[0]):
            if relation[3]>=0 and cv2.contourArea(contour)<180:cv2.drawContours(mask,[contour],0,1,-1)
    return mask

def signed_distance(mask):
    return cv2.distanceTransform(mask,cv2.DIST_L2,5)-cv2.distanceTransform(1-mask,cv2.DIST_L2,5)

def contour_points(image,count=192):
    contour=max(cv2.findContours(mascot_mask(image),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea)[:,0,:].astype(float)
    anchor=np.argmin((contour[:,0]-272)**2+(contour[:,1]-156)**2)
    contour=np.roll(contour,-anchor,axis=0)
    contour=np.r_[contour,contour[:1]]
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(contour,axis=0),axis=1))]
    samples=np.linspace(0,arc[-1],count,endpoint=False)
    return np.stack([np.interp(samples,arc,contour[:,k]) for k in range(2)],axis=1)

ARM_SAMPLES=16

def anchored_contour(image):
    """Give each of the eight tips and its two banks a stable identity."""
    points=contour_points(image,768)
    smooth=gaussian_filter1d(points,2,axis=0,mode='wrap')
    left=smooth-np.roll(smooth,6,axis=0)
    right=np.roll(smooth,-6,axis=0)-smooth
    curvature=-np.arctan2(left[:,0]*right[:,1]-left[:,1]*right[:,0],np.sum(left*right,axis=1))
    peaks,_=find_peaks(curvature,height=.7,distance=18,prominence=.6)
    peaks=[k for k in peaks if not(225<points[k,0]<320 and points[k,1]<300)]
    tips=sorted(sorted(peaks,key=lambda k:curvature[k],reverse=True)[:8])
    if len(tips)!=8:
        raise ValueError('The overlap must expose all eight tentacle tips; choose a clean forward fragment.')
    anchors=[0]
    def root(start,end):
        indices=np.arange(start,end)
        return indices[np.argmin(np.sum((points[indices]-[272,295])**2,axis=1))]
    anchors.append(root(1,tips[0]))
    for i,tip in enumerate(tips):
        anchors.extend([tip,root(tip+1,tips[i+1] if i<7 else len(points)-1)])
    anchors.append(len(points))
    samples=np.concatenate([np.linspace(lo,hi,ARM_SAMPLES,endpoint=False) for lo,hi in zip(anchors[:-1],anchors[1:])])
    closed=np.r_[points,points[:1]]
    return np.stack([np.interp(samples,np.arange(len(closed)),closed[:,k]) for k in range(2)],axis=1)

def prepare_pairs(a,b):
    # An unconstrained outline match can pair an outer arm with an inner one.
    # Explicit tips and roots keep the same arm identities throughout the join.
    return tuple(gaussian_filter1d(np.stack([anchored_contour(frame) for frame in frames]),1,axis=0,mode='nearest') for frames in (a,b))

def arm_middle(pa,pb,alpha):
    """Blend forward arm bends without collapsing their lengths or widths."""
    result=(1-alpha)*pa+alpha*pb
    n=ARM_SAMPLES
    for arm in range(8):
        start=(1+2*arm)*n
        def banks(points):return points[start:start+n+1],points[start+n:start+2*n+1][::-1]
        al,ar=banks(pa);bl,br=banks(pb)
        ac,bc=(al+ar)/2,(bl+br)/2
        ad,bd=np.diff(ac,axis=0),np.diff(bc,axis=0)
        aa=np.unwrap(np.arctan2(ad[:,1],ad[:,0]));ba=np.unwrap(np.arctan2(bd[:,1],bd[:,0]))
        delta=(ba-aa+np.pi)%(2*np.pi)-np.pi
        angles=aa+alpha*delta
        lengths=(1-alpha)*np.linalg.norm(ad,axis=1)+alpha*np.linalg.norm(bd,axis=1)
        root=(1-alpha)*ac[:1]+alpha*bc[:1]
        centers=np.r_[root,root+np.cumsum(lengths[:,None]*np.stack([np.cos(angles),np.sin(angles)],axis=1),axis=0)]
        def vertex_angles(values):return np.r_[values[0],(values[:-1]+values[1:])/2,values[-1]]
        def turn(offsets,source_angles):
            rotation=vertex_angles(angles)-vertex_angles(source_angles)
            cs,sn=np.cos(rotation),np.sin(rotation)
            return np.stack([offsets[:,0]*cs-offsets[:,1]*sn,offsets[:,0]*sn+offsets[:,1]*cs],axis=1)
        offset=(1-alpha)*turn(al-ac,aa)+alpha*turn(bl-bc,aa+delta)
        # Shared roots remain attached; the rest unfolds by interpolating bends.
        weight=np.minimum(1,np.arange(n+1)/4)[:,None]
        for indices,desired in [(np.arange(start,start+n+1),centers+offset),(np.arange(start+n,start+2*n+1)[::-1],centers-offset)]:
            result[indices]=result[indices]*(1-weight)+desired*weight
    return result

def motion_blend(a,b,pa,pb,alpha,grid=None):
    height,width=a.shape[:2]
    pins=np.array([[x,y] for y in range(80,470,65) for x in range(90,470,65) if x<150 or x>395 or y<135 or y>430],float)
    head=np.array([[x,y] for y in [165,190,220,250] for x in [235,272,307]],float)
    pins=np.r_[pins,head]
    middle=arm_middle(pa,pb,alpha)
    landmarks=np.r_[middle,pins]
    y,x=np.mgrid[0:height:2,0:width:2].astype(float)
    samples=np.stack([x.ravel(),y.ravel()],axis=1)
    yy,xx=np.mgrid[:height,:width].astype(np.float32)
    def warp(image,points):
        mask=mascot_mask(image)
        # Extend foreground color rather than pulling pale background into tips.
        _,nearest=distance_transform_edt(1-mask,return_indices=True)
        foreground=image[tuple(nearest)]
        displacement=np.r_[points-middle,np.zeros_like(pins)]
        low=RBFInterpolator(landmarks,displacement,smoothing=.15,kernel='thin_plate_spline')(samples).reshape(x.shape+(2,)).astype(np.float32)
        delta=cv2.resize(low,(width,height),interpolation=cv2.INTER_CUBIC)
        mx,my=xx+delta[:,:,0],yy+delta[:,:,1]
        rgb=cv2.remap(foreground,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT101).astype(np.float32)
        mask=cv2.remap(mask,mx,my,cv2.INTER_NEAREST)
        return rgb,mask
    aa,am=warp(a,pa);bb,bm=warp(b,pb)
    color=(1-alpha)*aa+alpha*bb
    outline=np.zeros((height*3,width*3),np.uint8)
    cv2.fillPoly(outline,[np.rint(middle*3).astype(np.int32)],255)
    outline=cv2.resize(outline,(width,height),interpolation=cv2.INTER_AREA)
    # Exact source masks at the ends preserve ordinary neighboring motion.
    # In the middle, one solid silhouette avoids eroding or doubling the tips.
    weight=4*alpha*(1-alpha)
    distance=(1-weight)*((1-alpha)*signed_distance(am)+alpha*signed_distance(bm))+weight*signed_distance((outline>127).astype(np.uint8))
    opacity=np.clip(distance+.5,0,1)
    return color,opacity

def clear_background(art):
    mask=mascot_mask(art)
    contours=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)[0]
    hull=cv2.convexHull(max(contours,key=cv2.contourArea))
    clean=np.zeros(mask.shape,np.uint8);cv2.drawContours(clean,[hull],0,255,-1)
    clean=cv2.dilate(clean,np.ones((11,11),np.uint8))
    return cv2.inpaint(art,clean,7,cv2.INPAINT_TELEA)
