"""Restore local opaque material in the oblique ends during the loop join."""
import cv2
import numpy as np
from scipy import ndimage as ndi

def restore_side_material(rgba):
    result=rgba.copy()
    yy,xx=np.mgrid[-3:4,-3:4]
    disk=xx**2+yy**2<=9
    for x0 in (0,86):
        tip=result[:,x0:x0+86]
        rgb=tip[:,:,:3].astype(float)
        alpha=tip[:,:,3]/255.
        solid=alpha>.50
        # Contour matching can fold a bank back through its own tip at the
        # middle of the join. Seal narrow splits only, retaining open curls.
        closed=ndi.binary_closing(solid,structure=disk)
        holes=ndi.binary_fill_holes(closed|solid)&~solid
        if x0==0:
            # The interpolation can open the pale incision completely. Recover
            # the cap from its two surviving banks in a fingertip-sized patch.
            y,x=np.indices(solid.shape)
            end=solid&(x<68)&(y>38)
            if end.any():
                bottom=y[end].max()
                cx=np.median(x[end&(y>=bottom-3)])
                region=(x-cx)**2+(y-(bottom-6))**2<19**2
                py,px=np.where(solid&region)
                hull=cv2.convexHull(np.int32(np.stack([px,py],axis=1)))
                cap=np.zeros(solid.shape,np.uint8)
                cv2.fillConvexPoly(cap,hull,255,cv2.LINE_AA)
                repaired=ndi.binary_dilation((cap>128)&~solid)
                holes|=(cap>128)&~solid
                alpha=np.maximum(alpha,(cap/255.)*repaired)
        alpha=np.maximum(alpha,holes)
        # During the same join the inverse colour warp can land on the pale
        # original glass. Extend genuine local skin into these small regions.
        known=(rgb[:,:,0]<85)&(rgb[:,:,2]-rgb[:,:,0]>110)&(alpha>.85)&~holes
        if not known.any():continue
        density=ndi.gaussian_filter(known.astype(float),4.)
        _,near=ndi.distance_transform_edt(~known,return_indices=True)
        fill=np.stack([ndi.gaussian_filter(rgb[:,:,k]*known,4.)/np.maximum(density,.0001) for k in range(3)],axis=2)
        fill=np.where((density>.006)[:,:,None],fill,rgb[tuple(near)])
        w=np.maximum(np.clip((rgb[:,:,0]-65)/45,0,1),holes)
        tip[:,:,:3]=np.uint8(np.clip(rgb*(1-w[:,:,None])+fill*w[:,:,None],0,255))
        tip[:,:,3]=np.uint8(alpha*255+.5)
    return result
