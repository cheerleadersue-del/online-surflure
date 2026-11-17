# 정자 바위 곶 에셋 (환경영상 기준). 좌표: 원점 = 섬 중심, 블렌더 x = 게임 X-394, y = -(게임 Z+40), z = 높이
import bpy, bmesh, math, random, sys
from mathutils import Vector, noise
OUT = sys.argv[sys.argv.index('--') + 1]
PREVIEW = sys.argv[sys.argv.index('--') + 2]
random.seed(7)
R = random.random
TOP = 6.0
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def deckH(y):  # 목 위 길 높이 (게임 지형과 같은 식)
    zg = -(y + 40)
    return 1.5 + 2.7 * max(0.0, min(1.0, (-9 - zg) / 11))
V, F, C, SM = [], [], [], []
def ico(sub):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    vs = [v.co.copy() for v in bm.verts]; fs = [[v.index for v in f.verts] for f in bm.faces]; bm.free(); return vs, fs
ICO = {1: ico(1), 2: ico(2), 3: ico(3)}
def lerp3(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
HONEY, GREY, WET = (0.62, 0.45, 0.27), (0.50, 0.45, 0.38), (0.16, 0.13, 0.10)
def boulder(cx, cy, base, rx, ry, h, sub=3, col=None, squash=1.0):
    vs, fs = ICO[sub]; o = len(V)
    tint = col or lerp3(HONEY, GREY, R())
    k = 0.88 + R() * 0.2; seed = Vector((R() * 50, R() * 50, R() * 50)); rot = R() * 6.28
    cr, sr = math.cos(rot), math.sin(rot)
    for v in vs:
        n = 1 + noise.noise(v * 1.7 + seed) * 0.22 + noise.noise(v * 4.0 + seed) * 0.05
        x, y, z = v.x * rx * n, v.y * ry * n, v.z
        z = (abs(z) ** squash) * (1 if z > 0 else -1)   # 위아래를 조금 납작하게 → 기둥 같은 바위
        x, y = x * cr - y * sr, x * sr + y * cr
        wz = base + (z * 0.5 + 0.5) * h * (0.96 + 0.08 * n)
        V.append((cx + x, cy + y, wz))
        shade = 0.72 + 0.28 * (z * 0.5 + 0.5) + noise.noise(v * 6 + seed) * 0.06
        c = tuple(min(1.0, t * k * shade) for t in tint)
        c = lerp3(c, WET, 1 - smooth(0.1, 0.9, wz))         # 물에 젖은 아래쪽 띠
        C.append(c)
    for f in fs: F.append([o + i for i in f]); SM.append(True)
def box(cx, cy, cz, sx, sy, sz, col, rz=0.0, tilt=0.0, jit=0.05):
    o = len(V); cr, sr = math.cos(rz), math.sin(rz); ct, st = math.cos(tilt), math.sin(tilt)
    k = 1 - jit + R() * jit * 2
    for dx in (-1, 1):
        for dy in (-1, 1):
            for dz in (-1, 1):
                x, y, z = dx * sx / 2, dy * sy / 2, dz * sz / 2
                y, z = y * ct - z * st, y * st + z * ct       # 길 방향 기울기
                x, y = x * cr - y * sr, x * sr + y * cr
                V.append((cx + x, cy + y, cz + z)); C.append(tuple(min(1.0, t * k * (0.86 + 0.14 * (dz > 0))) for t in col))
    for f in ([0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]):
        F.append([o + i for i in f]); SM.append(False)
def shrub(cx, cy, cz, s=1.0):
    for _ in range(3):
        g = (0.13 + R() * 0.07, 0.24 + R() * 0.1, 0.05 + R() * 0.04)
        boulder(cx + (R() - .5) * 1.1 * s, cy + (R() - .5) * 1.1 * s, cz - 0.25 * s, (0.5 + R() * 0.4) * s, (0.5 + R() * 0.4) * s, (0.7 + R() * 0.5) * s, sub=1, col=g)

GAP = 0.40                       # 계단이 닿는 쪽(-y)은 비운다
def in_gap(a): return abs(((a + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < GAP
# 1) 섬 둘레의 큰 기둥 바위 (높이 ≈ 정자 마당)
n = 44
for i in range(n):
    a = 2 * math.pi * (i + R() * 0.5) / n
    if in_gap(a): continue
    rr = 11.3 + R() * 1.6
    boulder(math.cos(a) * rr, math.sin(a) * rr, -1.3, 1.25 + R() * 0.8, 1.2 + R() * 0.7, TOP + 0.9 + R() * 1.9, squash=0.62)
# 2) 그 바깥의 중간 바위
n = 40
for i in range(n):
    a = 2 * math.pi * (i + R() * 0.7) / n
    if abs(((a + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < 0.27: continue
    rr = 13.6 + R() * 1.9
    boulder(math.cos(a) * rr, math.sin(a) * rr, -1.2, 1.2 + R() * 0.9, 1.1 + R() * 0.8, 2.8 + R() * 3.0, squash=0.72)
# 3) 물가에 흩어진 둥근 바위 (파도가 부서지는 자리)
for i in range(30):
    a = R() * 2 * math.pi
    if abs(((a + math.pi / 2 + math.pi) % (2 * math.pi)) - math.pi) < 0.5: continue
    rr = 16.2 + R() * 4.2
    boulder(math.cos(a) * rr, math.sin(a) * rr, -0.9, 0.9 + R() * 1.1, 0.8 + R() * 1.0, 1.2 + R() * 1.6, sub=2)
# 4) 목 서쪽을 받치는 바위들 + 덤불
y = -37.0
while y < -15.5:
    h = deckH(y)
    boulder(-3.4 - R() * 0.9, y, -1.0, 1.3 + R() * 0.8, 1.2 + R() * 0.7, h + 1.0 + R() * 0.9, squash=0.8)
    if R() < 0.75: boulder(-5.6 - R() * 1.4, y + R() - .5, -0.9, 1.1 + R() * 0.8, 1.0 + R() * 0.8, 1.3 + R() * (h - 0.6), sub=2)
    if R() < 0.6: shrub(-2.6 - R() * 0.5, y + 0.8, h + 0.3, 0.8)
    y += 1.9 + R() * 0.9
# 계단 양옆 바위
for sx in (-1, 1):
    for yy, hh in ((-19.5, 5.2), (-17.0, 6.0), (-14.6, 6.7)):
        boulder(sx * (3.9 + R() * 0.6), yy, -1.0, 1.6 + R() * 0.5, 1.5 + R() * 0.5, hh + R() * 0.6, squash=0.75)
# 5) 섬 위 가장자리의 덤불
for i in range(26):
    a = R() * 2 * math.pi
    if in_gap(a): continue
    rr = 9.8 + R() * 2.4
    shrub(math.cos(a) * rr, math.sin(a) * rr, TOP + 0.1 + R() * 0.6, 0.8 + R() * 0.5)
# 6) 목 동쪽의 돌 축대 (해변 쪽에서 보이는 면)
STONE = (0.55, 0.52, 0.45)
y = -38.0
while y < -19.6:
    h = deckH(y + 0.6); z = -0.3; row = 0
    while z < h - 0.05:
        bh = min(0.62, h - z + 0.05)
        box(3.05 + R() * 0.06, y + 0.6 + (0.3 if row % 2 else 0), z + bh / 2, 0.75, 1.16, bh, STONE, jit=0.09)
        z += bh; row += 1
    y += 1.2
# 7) 나무 데크길 (판자 + 난간)
WOOD, WOOD2 = (0.42, 0.23, 0.11), (0.27, 0.15, 0.07)
slope = math.atan2(2.7, 11.0)
y = -38.6
while y < -20.0:
    t = slope if -31 < y < -20 else 0.0
    box(0, y, deckH(y) + 0.1, 3.5, 0.44, 0.09, WOOD, tilt=t, jit=0.1)
    y += 0.46
posts = {}
for sx in (-1, 1):
    pts = []
    y = -38.4
    while y <= -20.0:
        z = deckH(y) + 0.1
        box(sx * 1.78, y, z + 0.6, 0.2, 0.2, 1.3, WOOD2)
        pts.append((y, z)); y += 2.3
    for (y0, z0), (y1, z1) in zip(pts, pts[1:]):
        L = math.hypot(y1 - y0, z1 - z0); t = math.atan2(z1 - z0, y1 - y0)
        for hy in (0.62, 1.12): box(sx * 1.78, (y0 + y1) / 2, (z0 + z1) / 2 + hy, 0.1, L, 0.13, WOOD2, tilt=t)
# 8) 얕고 넓은 돌계단 10칸 + 양옆 낮은 돌 턱
STEP = (0.66, 0.63, 0.56)
for i in range(10):
    yc = -20.0 + (i + 0.5) * 0.55; top = 4.2 + (i + 1) * 0.18
    box(0, yc, top - 0.3, 3.7, 0.6, 0.6, STEP, jit=0.04)
    for sx in (-1, 1): box(sx * 2.08, yc, top - 0.05, 0.5, 0.6, 0.9, STONE, jit=0.07)
# 정자 마당 앞 디딤 돌판
box(0, -13.9, TOP - 0.1, 4.6, 1.3, 0.3, STEP, jit=0.03)

me = bpy.data.meshes.new('headland'); me.from_pydata(V, [], F); me.update()
ca = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
for l in me.loops: ca.data[l.index].color = (*C[l.vertex_index], 1.0)
me.color_attributes.active_color = ca
for p, s in zip(me.polygons, SM): p.use_smooth = s
ob = bpy.data.objects.new('headland', me)
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o)
bpy.context.scene.collection.objects.link(ob)
mat = bpy.data.materials.new('vc'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'Col'
nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.9
me.materials.append(mat)
print('verts', len(V), 'faces', len(F), 'tris', sum(len(f) - 2 for f in F))
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_yup=True, export_apply=True)

# ---- 미리보기 렌더 (게임 지형 대역 + 바다 + 정자) : 영상 첫 장면과 비슷한 각도
def grid_mesh(name, fn, x0, x1, y0, y1, step, col):
    nx = int((x1 - x0) / step) + 1; ny = int((y1 - y0) / step) + 1
    vs = [(x0 + i * step, y0 + j * step, fn(x0 + i * step, y0 + j * step)) for j in range(ny) for i in range(nx)]
    fs = [[j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i] for j in range(ny - 1) for i in range(nx - 1)]
    m = bpy.data.meshes.new(name); m.from_pydata(vs, [], fs); m.update()
    for p in m.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, m); bpy.context.scene.collection.objects.link(o)
    mt = bpy.data.materials.new(name); mt.use_nodes = True; mt.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1)
    mt.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.5 if name == 'sea' else 0.95
    m.materials.append(mt); return o
def terr(x, y):
    d = math.hypot(x, y); hi = TOP * smooth(15, 10.5, d)
    hn = deckH(y) * smooth(5.5, 3.0, abs(x)) if y < -14 else 0
    h = max(hi, hn)
    if abs(x) < 3.7 and -20.5 < y < -13: h = h + (4.2 + (TOP - 4.2) * max(0, min(1, (y + 20) / 5.5)) - h) * smooth(3.7, 2.2, abs(x))
    if y < -37: h = max(h, 1.4)
    return h if h > 0.05 else -1.2
grid_mesh('land', terr, -30, 30, -46, 24, 0.6, (0.42, 0.55, 0.28))
grid_mesh('sea', lambda x, y: 0.0, -90, 90, -60, 110, 30, (0.05, 0.42, 0.45))
try:
    bpy.ops.import_scene.gltf(filepath='/tmp/claude-0/east/glb/as_pavilion.glb')
    pav = [o for o in bpy.context.selected_objects if o.type == 'MESH'][0]
    pav.parent = None; pav.rotation_mode = 'XYZ'; pav.rotation_euler = (0, 0, -math.pi / 2); pav.scale = (13, 13, 13); pav.location = (0, -1, TOP + 0.427 * 13 - 0.85)
except Exception as e: print('pavilion import failed', e)
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.2; so = bpy.data.objects.new('sun', sun); so.rotation_euler = (0.9, 0.1, 2.3); bpy.context.scene.collection.objects.link(so)
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.72, 0.95, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 0.55; bpy.context.scene.world = w
sc = bpy.context.scene; sc.view_settings.view_transform = 'Standard'; sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.cycles.device = 'CPU'; sc.render.resolution_x = 960; sc.render.resolution_y = 540
for i, (pos, tgt) in enumerate([((-9, -58, 21), (0, -8, 4)), ((30, -34, 9), (0, -6, 4))]):
    cam = bpy.data.cameras.new('cam'); cam.lens = 30; co = bpy.data.objects.new('cam', cam); bpy.context.scene.collection.objects.link(co)
    co.location = pos; co.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler(); sc.camera = co
    sc.render.filepath = PREVIEW.replace('.png', f'_{i}.png'); bpy.ops.render.render(write_still=True)
