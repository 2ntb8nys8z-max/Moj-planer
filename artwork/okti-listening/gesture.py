"""Separate proposal: approved approach plus a small 3-D listening gesture.

Ray-cast a shallow 3-D capsule for the mantle. The approved artwork is used as
its surface texture, including the microphone bars. Arms, approach, glass and
rest pose come from the approved v5 renderer without changing that file.
"""
import math
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import pose as approved

W, FPS, N = approved.W, approved.FPS, approved.N
OUT = approved.OUT
ORIGINAL_SAMPLE = approved.sample


def gesture(time):
    turn = float(approved.smooth((time-1.20)/.90))
    release = 1-float(approved.smooth((time-3.35)/.65))
    return turn*release


def rotation(amount):
    yaw, pitch, roll = [math.radians(v*amount) for v in (8,-3,-2)]
    cy, sy = math.cos(yaw), math.sin(yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(roll), math.sin(roll)
    ry = np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]],float)
    rx = np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]],float)
    rz = np.array([[cr,-sr,0],[sr,cr,0],[0,0,1]],float)
    return rz@ry@rx


def normalize(v):
    return v/np.maximum(np.linalg.norm(v,axis=-1,keepdims=True),1e-8)


def spatial_mantle(color,alpha,sx,sy,amount):
    if amount < 1e-5:
        return ORIGINAL_SAMPLE(color,alpha,sx,sy)
    r = rotation(amount)
    px, py = sx-272, sy-228
    far, radius, half_straight, depth_ratio = 180.,48.,23.,.72
    ox = r[0,0]*px+r[1,0]*py+r[2,0]*far
    oy = r[0,1]*px+r[1,1]*py+r[2,1]*far
    oz = r[0,2]*px+r[1,2]*py+r[2,2]*far
    dx,dy,dz = -r[2,:]
    depth2 = depth_ratio**2
    nearest = np.full(px.shape,np.inf)

    def intersection(center_y,cylinder):
        nonlocal nearest
        y = oy-center_y
        aa = dx*dx+dz*dz/depth2+(0 if cylinder else dy*dy)
        bb = 2*(ox*dx+oz*dz/depth2+(0 if cylinder else y*dy))
        cc = ox*ox+oz*oz/depth2-radius*radius+(0 if cylinder else y*y)
        disc = bb*bb-4*aa*cc
        t = (-bb-np.sqrt(np.maximum(disc,0)))/(2*aa)
        hit_y = oy+t*dy
        valid = (disc>=0)&(t>0)
        if cylinder:
            valid &= np.abs(hit_y)<=half_straight
        elif center_y>0:
            valid &= hit_y>=half_straight
        else:
            valid &= hit_y<=-half_straight
        nearest = np.minimum(nearest,np.where(valid,t,np.inf))

    intersection(0,True)
    intersection(half_straight,False)
    intersection(-half_straight,False)
    visible = np.isfinite(nearest)
    t = np.where(visible,nearest,far)
    x,y,z = ox+t*dx,oy+t*dy,oz+t*dz
    u,v = np.where(visible,x+272,sx),np.where(visible,y+228,sy)
    coords = [v,u]
    texture = np.stack([ndi.map_coordinates(color[...,k],coords,order=1,
                       mode='nearest') for k in range(3)],axis=-1).astype(float)

    # Surface normals follow the 3-D capsule. The light stays fixed, so the
    # highlight glides and the turning side shades instead of rotating as paint.
    cap_y = np.sign(y)*np.maximum(np.abs(y)-half_straight,0)
    local_normal = normalize(np.stack((x,cap_y,z/depth2),axis=-1))
    world_normal = local_normal@r.T
    light = normalize(np.array([-.48,-.52,.75]))
    half_vector = normalize(light+np.array([0,0,1.]))
    old_diff = np.maximum(local_normal@light,0)
    new_diff = np.maximum(world_normal@light,0)
    diffuse = (.48+.52*new_diff)/(.48+.52*old_diff)
    old_spec = np.maximum(local_normal@half_vector,0)**28
    new_spec = np.maximum(world_normal@half_vector,0)**28
    luminous_bars = approved.smooth((np.min(texture,axis=-1)-195)/50)
    shade = 1+(np.clip(diffuse,.72,1.28)-1)*(1-luminous_bars)*visible
    texture *= shade[...,None]
    texture += (new_spec-old_spec)[...,None]*65*(1-luminous_bars[...,None])*visible[...,None]

    projected_alpha = ndi.map_coordinates(alpha,coords,order=1,mode='constant',cval=0)
    projected_alpha *= visible
    projected_alpha = ndi.gaussian_filter(projected_alpha,.35)
    # Blend silhouette coverage only. There is one surface lookup for the bars,
    # so their movement never crossfades into a second, offset microphone mark.
    baseline_alpha = ndi.map_coordinates(alpha,[sy,sx],order=1,mode='constant',cval=0)
    b = float(approved.smooth(amount))
    opacity = baseline_alpha*(1-b)+projected_alpha*b
    result = np.dstack((np.clip(texture,0,255),np.clip(opacity,0,1)*255)).astype(np.uint8)
    return Image.fromarray(result,'RGBA')


def render(frame,canonical,hc,ha,background,time):
    layer_index = 0
    def sample_layer(color,alpha,sx,sy):
        nonlocal layer_index
        layer_index += 1
        if layer_index == 1:
            return ORIGINAL_SAMPLE(color,alpha,sx,sy)
        return spatial_mantle(color,alpha,sx,sy,gesture(time))
    approved.sample = sample_layer
    try:
        return approved.render_frame(frame,canonical,hc,ha,background,time)
    finally:
        approved.sample = ORIGINAL_SAMPLE


def assets():
    frames = approved.decode_video()
    canonical = np.array(Image.open(approved.ASSETS/'artwork/okti-motion/art.webp')
                         .convert('RGB').resize((W,W),Image.Resampling.LANCZOS))
    mask = approved.silhouette(canonical)
    hc,ha = approved.matte(canonical,mask)
    distance = np.hypot(approved.X-272,approved.Y-np.clip(approved.Y,205,251))
    capsule = 1-approved.smooth((distance-47.5)/2)
    root = ((1-approved.smooth((np.abs(approved.X-272)-17)/8))*
            approved.smooth((approved.Y-272)/8)*(1-approved.smooth((approved.Y-304)/18)))
    ha *= np.maximum(capsule,root)
    return frames,canonical,hc,ha,approved.clear_background(canonical,mask)


