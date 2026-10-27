"""Run in a dedicated background Blender: blender -b --factory-startup --python this.py -- --input model.glb --output public/assets/cast/camel --parts parts.json
Parts JSON optional: {"parts":[{"name":"body","objects":["Body"],"pivot":[0.5,0.5]}]}.
Without authored parts, exports one body layer and marks it unarticulated.
"""
import argparse, json, math, sys
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description='Render orthographic alpha silhouettes from a GLB in a dedicated Blender process.')
    parser.add_argument('--input',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--parts',type=Path)
    parser.add_argument('--size',type=int,default=2048)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    import bpy
    from mathutils import Vector
    if not args.input.is_file(): raise FileNotFoundError(args.input)
    args.output.mkdir(parents=True,exist_ok=True)
    if (args.output/'manifest.json').exists(): raise RuntimeError('Output exists; choose a new review folder to preserve earlier renders.')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(args.input.resolve()))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    if not meshes: raise RuntimeError('No mesh geometry imported')
    material=bpy.data.materials.new('Soot silhouette');material.use_nodes=True
    nodes=material.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');emission=nodes.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(0.0075,0.0056,0.0040,1);material.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
    for obj in meshes:
        obj.data.materials.clear();obj.data.materials.append(material)
        if len(obj.data.polygons)>20000:
            modifier=obj.modifiers.new('Silhouette decimation','DECIMATE');modifier.ratio=20000/len(obj.data.polygons)
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)*0.5
    camera_data=bpy.data.cameras.new('Side orthographic');camera=bpy.data.objects.new('Side orthographic',camera_data);bpy.context.collection.objects.link(camera)
    # X/Z side profile; all parts share one framing so pivots stay registered.
    camera.location=(center.x,center.y-10,center.z);camera.rotation_euler=(Vector(center)-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=max(high.x-low.x,high.z-low.z)*1.12
    scene=bpy.context.scene;scene.camera=camera;scene.render.engine='BLENDER_EEVEE';scene.render.film_transparent=True;scene.render.resolution_x=args.size;scene.render.resolution_y=args.size;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
    parts=json.loads(args.parts.read_text())['parts'] if args.parts else [{'name':'body','objects':[o.name for o in meshes],'pivot':[0.5,0.5]}]
    manifest={'source':args.input.name,'size':args.size,'articulated':bool(args.parts),'parts':[],'camera':'X/Z orthographic side; authored GLB must face sideways'}
    names={o.name for o in meshes}
    for part in parts:
        if not part['objects'] or not set(part['objects'])<=names: raise RuntimeError('Unknown/empty authored part: '+part['name'])
        if not part['name'].replace('_','').replace('-','').isalnum(): raise RuntimeError('Invalid part name')
        for obj in meshes: obj.hide_render=obj.name not in part['objects']
        filename=part['name']+'.png';scene.render.filepath=str((args.output/filename).resolve());bpy.ops.render.render(write_still=True)
        manifest['parts'].append({'name':part['name'],'image':filename,'pivot':part['pivot']})
    for obj in meshes: obj.hide_render=False
    bpy.ops.wm.save_as_mainfile(filepath=str((args.output/'source.blend').resolve()))
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__': main()
