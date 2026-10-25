"""Match continuous arm outlines before interpolating opaque foregrounds."""
import cv2
import numpy as np
from scipy.interpolate import RBFInterpolator

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

def prepare_pairs(a,b):
    pa=np.stack([contour_points(frame) for frame in a])
    pb=np.stack([contour_points(frame) for frame in b])
    # One monotone correspondence for the entire overlap prevents flickering
    # between alternative arm matches in successive frames.
    cost=np.mean(np.sum((pa[:,:,None,:]-pb[:,None,:,:])**2,axis=3),axis=0)
    def curvature(points):
        left=points-np.roll(points,2,axis=1)
        right=np.roll(points,-2,axis=1)-points
        return np.arctan2(left[:,:,0]*right[:,:,1]-left[:,:,1]*right[:,:,0],np.sum(left*right,axis=2))
    ca,cb=curvature(pa),curvature(pb)
    cost+=600*np.mean((ca[:,:,None]-cb[:,None,:])**2,axis=0)
    n=len(cost);dp=np.full((n+1,n+1),np.inf);dp[0,0]=0;previous=np.zeros((n,n),np.int8)
    for i in range(n):
        for j in range(max(0,i-45),min(n,i+46)):
            values=[dp[i,j],dp[i,j+1]+35,dp[i+1,j]+35]
            k=int(np.argmin(values));previous[i,j]=k;dp[i+1,j+1]=cost[i,j]+values[k]
    i=j=n-1;ia=[];ib=[]
    while i>=0 and j>=0:
        ia.append(i);ib.append(j);k=previous[i,j]
        if k in [0,1]:i-=1
        if k in [0,2]:j-=1
    ia,ib=np.array(ia[::-2]),np.array(ib[::-2])
    def smooth(points):
        weights=[1,2,3,2,1]
        return np.stack([sum(w*points[max(0,min(len(points)-1,t+k-2))] for k,w in enumerate(weights))/sum(weights) for t in range(len(points))])
    return smooth(pa[:,ia]),smooth(pb[:,ib])

def motion_blend(a,b,pa,pb,alpha,grid=None):
    height,width=a.shape[:2]
    pins=np.array([[x,y] for y in range(80,470,65) for x in range(90,470,65) if x<150 or x>395 or y<135 or y>430],float)
    head=np.array([[x,y] for y in [165,190,220,250] for x in [235,272,307]],float)
    pins=np.r_[pins,head]
    middle=(1-alpha)*pa+alpha*pb
    landmarks=np.r_[middle,pins]
    y,x=np.mgrid[0:height:4,0:width:4].astype(float)
    samples=np.stack([x.ravel(),y.ravel()],axis=1)
    yy,xx=np.mgrid[:height,:width].astype(np.float32)
    def warp(image,points):
        displacement=np.r_[points-middle,np.zeros_like(pins)]
        low=RBFInterpolator(landmarks,displacement,smoothing=1.2,kernel='thin_plate_spline')(samples).reshape(x.shape+(2,)).astype(np.float32)
        delta=cv2.resize(low,(width,height),interpolation=cv2.INTER_CUBIC)
        mx,my=xx+delta[:,:,0],yy+delta[:,:,1]
        rgb=cv2.remap(image,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT101).astype(np.float32)
        mask=cv2.remap(mascot_mask(image),mx,my,cv2.INTER_NEAREST)
        return rgb,mask
    aa,am=warp(a,pa);bb,bm=warp(b,pb)
    aw,bw=(1-alpha)*am.astype(np.float32),alpha*bm.astype(np.float32)
    color=(aa*aw[...,None]+bb*bw[...,None])/np.maximum((aw+bw)[...,None],1e-9)
    opacity=np.clip((1-alpha)*signed_distance(am)+alpha*signed_distance(bm)+.5,0,1)
    return color,opacity

def clear_background(art):
    mask=mascot_mask(art)
    contours=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)[0]
    hull=cv2.convexHull(max(contours,key=cv2.contourArea))
    clean=np.zeros(mask.shape,np.uint8);cv2.drawContours(clean,[hull],0,255,-1)
    clean=cv2.dilate(clean,np.ones((11,11),np.uint8))
    return cv2.inpaint(art,clean,7,cv2.INPAINT_TELEA)
