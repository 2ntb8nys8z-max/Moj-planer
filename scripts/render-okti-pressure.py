import bpy, math, sys, os
from mathutils import Vector
from pathlib import Path
ROOT=Path(os.environ.get('OKTI_PRESSURE_RENDER_DIR','/tmp/okti-pressure-frames'));ROOT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=96
scene.cycles.use_denoising=False; scene.cycles.use_adaptive_sampling=True; scene.cycles.adaptive_threshold=.035
scene.cycles.max_bounces=8; scene.cycles.transmission_bounces=6; scene.cycles.transparent_max_bounces=8
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
world=bpy.data.worlds.new('Soft white studio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.24,.40,.60,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
center=Vector((0,0,1.24));front=Vector((0,-.964,.266)).normalized();up=Vector((0,.266,.964)).normalized();right=Vector((1,0,0))
def pos(u,v,w=0): return center+right*u+up*v+front*w
def emission(name,color,strength=1):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');e=n.new('ShaderNodeEmission');e.inputs['Color'].default_value=(*color,1);e.inputs['Strength'].default_value=strength;m.node_tree.links.new(e.outputs[0],out.inputs['Surface']);return m
white=emission('Clean white background',(.985,.992,1))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,0));bpy.context.object.data.materials.append(white);bpy.context.object.visible_camera=False;bpy.context.object.visible_transmission=False
glass=bpy.data.materials.new('Clear elastic glass membrane');glass.use_nodes=True;n=glass.node_tree.nodes;n.clear();links=glass.node_tree.links
out=n.new('ShaderNodeOutputMaterial');g=n.new('ShaderNodeBsdfAnisotropic');g.inputs['Color'].default_value=(.82,.94,1,1);g.inputs['Roughness'].default_value=.045
tr=n.new('ShaderNodeBsdfTransparent');tr.inputs['Color'].default_value=(.985,.995,1,1)
fresnel=n.new('ShaderNodeFresnel');fresnel.inputs['IOR'].default_value=1.45
mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY_ADD';mult.inputs[1].default_value=.82;mult.inputs[2].default_value=.085;links.new(fresnel.outputs[0],mult.inputs[0])
rim=n.new('ShaderNodeAttribute');rim.attribute_name='rim_load'
edge=n.new('ShaderNodeMath');edge.operation='MULTIPLY';edge.inputs[1].default_value=.18;links.new(rim.outputs['Fac'],edge.inputs[0])
weight=n.new('ShaderNodeMath');weight.operation='ADD';weight.use_clamp=True;links.new(mult.outputs[0],weight.inputs[0]);links.new(edge.outputs[0],weight.inputs[1])
color=n.new('ShaderNodeMixRGB');color.blend_type='MIX';color.inputs[1].default_value=(.82,.94,1,1);color.inputs[2].default_value=(.50,.79,.99,1);links.new(rim.outputs['Fac'],color.inputs[0]);links.new(color.outputs[0],g.inputs['Color'])
polish=n.new('ShaderNodeMath');polish.operation='MULTIPLY_ADD';polish.inputs[1].default_value=-.018;polish.inputs[2].default_value=.045;links.new(rim.outputs['Fac'],polish.inputs[0]);links.new(polish.outputs[0],g.inputs['Roughness'])
mix=n.new('ShaderNodeMixShader');links.new(weight.outputs[0],mix.inputs[0]);links.new(tr.outputs[0],mix.inputs[1]);links.new(g.outputs[0],mix.inputs[2])
optical=n.new('ShaderNodeBsdfGlass');optical.inputs['Color'].default_value=(.78,.94,1,1);optical.inputs['Roughness'].default_value=.025;optical.inputs['IOR'].default_value=1.36
bend=n.new('ShaderNodeMath');bend.operation='MULTIPLY';bend.inputs[1].default_value=.25;links.new(rim.outputs['Fac'],bend.inputs[0])
refraction=n.new('ShaderNodeMixShader');links.new(bend.outputs[0],refraction.inputs[0]);links.new(mix.outputs[0],refraction.inputs[1]);links.new(optical.outputs[0],refraction.inputs[2])
geo=n.new('ShaderNodeNewGeometry');frontOnly=n.new('ShaderNodeMixShader');links.new(geo.outputs['Backfacing'],frontOnly.inputs[0]);links.new(refraction.outputs[0],frontOnly.inputs[1]);links.new(tr.outputs[0],frontOnly.inputs[2]);links.new(frontOnly.outputs[0],out.inputs['Surface'])
bpy.ops.mesh.primitive_uv_sphere_add(segments=128,ring_count=80,radius=1,location=(0,0,0));bubble=bpy.context.object;bubble.name='Continuous deformable bubble';bubble.data.materials.append(glass)
for poly in bubble.data.polygons:poly.use_smooth=True
original=[v.co.copy() for v in bubble.data.vertices]
rim_attr=bubble.data.attributes.new(name='rim_load',type='FLOAT',domain='POINT')
def deform(p):
 for i,(vert,base) in enumerate(zip(bubble.data.vertices,original)):
  u,v,w=base.x,base.y,base.z
  radial=u*u+v*v
  rho=math.sqrt(radial);edge_load=max(0,p)*math.exp(-((rho-.91)/.085)**2);rim_attr.data[i].value=edge_load
  # A circular fingertip indentation on the FRONT, plus a broad, volume-like expansion.
  gate=max(0,min(1,(w-.12)/.65));gate=gate*gate*(3-2*gate)
  w=w*(1-.085*p)-.47*p*math.exp(-radial/.105)*gate
  w+=.12*max(0,p)*math.exp(-((rho-.89)/.13)**2)*math.tanh(base.z/.18)
  u*=1+.095*p+.016*edge_load;v*=1+.045*p+.010*edge_load
  if p<0:
   # On release the membrane stretches upward, with a small lift.
   v=base.y*(1-.19*p)
  vert.co=pos(u,v,w)+up*(.09*max(0,-p))
 bubble.data.update()
# Reflection softboxes make the concave surface legible.
def area(name,location,power,size,size_y,target=center):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='RECTANGLE';data.size=size;data.size_y=size_y
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=location;ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
area('Broad upper left',(-3,-4,5),450,3,.55)
area('Narrow reflection right',(3,-2.7,2.6),180,.3,2.5)
area('Back rim',(1,2,4),500,3,3)
# Dark studio flags stay outside the camera but define glass edges.
flagmat=bpy.data.materials.new('Neutral reflective studio flag');flagmat.diffuse_color=(.1,.16,.2,1)
for x in [-2.6,2.6]:
 bpy.ops.mesh.primitive_plane_add(size=2,location=(x,1,2));ob=bpy.context.object;ob.rotation_euler=(Vector((0,0,1.3))-ob.location).to_track_quat('Z','Y').to_euler();ob.scale=(.7,2,1);ob.data.materials.append(flagmat);ob.visible_camera=False
bpy.ops.object.camera_add(location=center+front*7+right*.7);camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.45;scene.camera=camera
# The same glass and deformation as the approved v3 GIF. Only the membrane is
# exported; the app keeps its live octopus and its existing transmitted shadow.
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
pressures=[-.38+i*.38/8 for i in range(8)]+[i/20 for i in range(21)]
frames=[8,28] if '--test' in args else list(range(len(pressures)))
for frame in frames:
 deform(pressures[frame])
 scene.render.filepath=str(ROOT/f'frame_{frame:03d}.png');bpy.ops.render.render(write_still=True)
 print('FRAME_DONE',frame,flush=True)
