#!/usr/bin/env python3
"""Sinh toàn bộ bản đồ (server + client) và kiểm tra: spawn không bị chặn, có đường đi A->B, hộp nằm trong tường bao."""
import json, math, os, collections

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SERVER = ROOT + '/server/src/maps'
CLIENT = ROOT + '/client/assets/maps'

class M:
    def __init__(self, id, name, size, tag, desc, theme, wall_m='wall', wall_c='#6b7076', wall_h=6):
        self.id, self.name, self.size, self.tag, self.desc, self.theme = id, name, size, tag, desc, theme
        self.boxes, self.decor = [], []
        h = size / 2
        t = 1
        for (p, s) in (([0, wall_h / 2, -h - t / 2 + 0.0], [size + 2, wall_h, t]), ([0, wall_h / 2, h + t / 2], [size + 2, wall_h, t]),
                       ([h + t / 2, wall_h / 2, 0], [t, wall_h, size + 2]), ([-h - t / 2, wall_h / 2, 0], [t, wall_h, size + 2])):
            self.box(p, s, wall_m, wall_c)
        self.half = h
    def box(self, p, s, m, c):
        self.boxes.append({"p": [round(v, 3) for v in p], "s": [round(v, 3) for v in s], "c": c, "m": m})
    def box2(self, p, s, m, c):  # đối xứng tâm
        self.box(p, s, m, c); self.box([-p[0], p[1], -p[2]], s, m, c)
    def dec(self, k, p, s, c, m='plaster', r=None, **kw):
        d = {"k": k, "p": [round(v, 3) for v in p], "s": [round(v, 3) for v in s], "c": c, "m": m}
        if r: d["r"] = r
        d.update(kw)
        self.decor.append(d)
    def dec2(self, k, p, s, c, m='plaster', r=None, **kw):
        self.dec(k, p, s, c, m, r, **kw)
        self.dec(k, [-p[0], p[1], -p[2]], s, c, m, ([r[0], r[1] + math.pi, r[2]] if r else None), **kw)
    def spawns(self, zA, xs):
        self.sp = {"A": {"yaw": 0, "points": [[x, zA] for x in xs]}, "B": {"yaw": 3.14159265, "points": [[x, -zA] for x in xs]}}
    def data(self):
        return {"id": self.id, "name": self.name, "tag": self.tag, "desc": self.desc, "size": self.size, "theme": self.theme,
                "spawns": self.sp, "boxes": self.boxes, "decor": self.decor, "sky": self.theme.get('fog', '#9db4c8'), "floorColor": self.theme.get('ground', {}).get('c', '#3b4148')}

def tree(m, x, z, h=3.2, foliage='#4f7a3a', r=1.8):
    m.box([x, h / 2, z], [0.6, h, 0.6], 'wood', '#6b4a2e')
    m.dec('sphere', [x, h + r * 0.6, z], [r], foliage, 'grass')
    m.dec('sphere', [x + 0.5, h + r * 0.2, z + 0.4], [r * 0.7], foliage, 'grass')

def stairs(m, x, z0, dz, n, width, h_step, depth, mat, col, axis='z'):
    """n bậc, bậc i cao (i+1)*h_step, đi từ z0 theo hướng dz (±1)."""
    for i in range(n):
        h = h_step * (i + 1)
        z = z0 + dz * (depth * i + depth / 2)
        if axis == 'z': m.box([x, h / 2, z], [width, h, depth], mat, col)
        else: m.box([z, h / 2, x], [depth, h, width], mat, col)

# ============================================================================== HỒ GƯƠM – HÀ NỘI (nhỏ)
def hoguom():
    m = M('hoguom', 'Hồ Gươm – Hà Nội', 44, 'Nhỏ', 'Bản đồ nhỏ quanh Hồ Gươm: Tháp Rùa giữa hồ, đền Ngọc Sơn, cây phượng và dãy ghế đá. Giao tranh gần, nhanh.',
          {"kind": "city", "ambient": ["petals"], "ground": {"kind": "tile", "c": "#a39c86"}, "fog": "#bcc9cf", "fogNear": 60, "fogFar": 220,
           "sky": {"top": "#5d86b0", "mid": "#9bb7cc", "horizon": "#d5dde0"}, "wet": 0.45, "sunDir": [-0.45, 0.8, -0.3], "sunColor": "#fff0d8", "sunI": 3.0, "hemi": ["#c4d2e0", "#6c6a5c"]},
          'plaster', '#d9c27a', 5)
    # Hồ nước + đảo + Tháp Rùa
    m.box([0, 0.7, 0], [14, 1.4, 9], 'water', '#4a7f88')
    m.box([0, 1.0, 0], [5, 2.0, 5], 'stone', '#8f9a85')
    m.box([0, 3.1, 0], [3.6, 2.2, 3.6], 'plaster', '#cfc7a8')
    m.box([0, 5.0, 0], [2.8, 1.6, 2.8], 'plaster', '#cfc7a8')
    m.box([0, 6.5, 0], [2.0, 1.4, 2.0], 'plaster', '#cfc7a8')
    m.dec('prism', [0, 7.9, 0], [2.6, 1.0, 2.6], '#6b5a44', 'stone')
    m.dec('cone', [0, 9.2, 0], [0.18, 1.6], '#8a7a55', 'metal', seg=6)
    m.dec('plane', [0, 1.42, 0], [14, 9], '#4a7f88', 'water')
    # Đền Ngọc Sơn (đông) + nhà hàng/trà thất (tây), mỗi bên có cổng
    def pavilion(sg):
        cx = 15 * sg
        c = '#a8452f'
        m.box([cx, 1.6, -3.2], [6.4, 3.2, 0.4], 'plaster', c)
        m.box([cx, 1.6, 3.2], [6.4, 3.2, 0.4], 'plaster', c)
        m.box([cx + 3.0 * sg, 1.6, 0], [0.4, 3.2, 6.4], 'plaster', c)
        m.box([cx - 3.0 * sg, 1.6, -2.0], [0.4, 3.2, 2.4], 'plaster', c)
        m.box([cx - 3.0 * sg, 1.6, 2.0], [0.4, 3.2, 2.4], 'plaster', c)
        m.box([cx, 3.35, 0], [7.2, 0.3, 7.2], 'plaster', '#6b3a2a')
        m.dec('prism', [cx, 4.1, 0], [7.8, 1.5, 7.8], '#7a4a32', 'stone')
    pavilion(1); pavilion(-1)
    # Cây xanh, ghế đá, tường thấp
    for (x, z) in ((-10, 12), (10, -12), (10, 12), (-10, -12), (-17, 6), (17, -6), (0, 17), (0, -17)):
        tree(m, x, z, 3.4, '#c0392b' if (x + z) % 4 == 0 else '#4f7a3a')
    for p, s in (([-6, 0.55, 9], [3.4, 1.1, 0.7]), ([6, 0.55, -9], [3.4, 1.1, 0.7]), ([-13, 0.55, -4], [0.7, 1.1, 3.4]), ([13, 0.55, 4], [0.7, 1.1, 3.4]),
                 ([-4, 0.55, 15], [3.4, 1.1, 0.7]), ([4, 0.55, -15], [3.4, 1.1, 0.7])):
        m.box(p, s, 'stone', '#9a9a8a')
    m.box2([-7, 0.6, 12], [1.2, 1.2, 1.2], 'crate', '#8a7350')
    # Cầu Thê Húc (trang trí, đỏ)
    m.dec('box', [0, 1.55, 11.5], [8, 0.12, 1.6], '#b5392a', 'wood')
    for i in range(5):
        m.dec('box', [-3.5 + i * 1.75, 2.1, 11.5], [0.12, 1.0, 1.6], '#b5392a', 'wood')
    m.spawns(18, [-4, -2, 0, 2, 4])
    return m

# ============================================================================== THÁP EIFFEL – PARIS (vừa)
def paris():
    m = M('paris', 'Tháp Eiffel – Paris', 56, 'Vừa', 'Quảng trường dưới chân tháp Eiffel: bốn chân tháp khổng lồ, đài phun nước, hàng rào cây và các quán cà phê. Nhiều góc bắn quanh chân tháp.',
          {"kind": "city", "ambient": ["mist"], "ground": {"kind": "tile", "c": "#b4ad9a"}, "fog": "#b9c3cc", "fogNear": 70, "fogFar": 260,
           "sky": {"top": "#5f86b5", "mid": "#9db8cf", "horizon": "#dde2e4"}, "wet": 0.55, "sunDir": [-0.35, 0.82, -0.35], "sunColor": "#fff3e0", "sunI": 3.1, "hemi": ["#c6d3e0", "#6e6b60"]},
          'plaster', '#d8cfb8', 6)
    iron = '#5c4a3a'
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box([sx * 6, 3.0, sz * 6], [2.4, 6.0, 2.4], 'metal', iron)
            m.dec('cyl', [sx * 5.2, 14, sz * 5.2], [0.9, 1.7, 16, 4], iron, 'metal', r=[0, math.pi / 4, 0])
    m.dec('box', [0, 20, 0], [13, 1.0, 13], iron, 'metal')
    for sx in (-1, 1):
        m.dec('box', [sx * 6, 3.6, 0], [0.5, 1.0, 12], iron, 'metal'); m.dec('box', [0, 3.6, sx * 6], [12, 1.0, 0.5], iron, 'metal')
    m.dec('cyl', [0, 31, 0], [0.7, 3.4, 22, 4], iron, 'metal', r=[0, math.pi / 4, 0])
    m.dec('box', [0, 42.5, 0], [4, 0.6, 4], iron, 'metal')
    m.dec('cone', [0, 52, 0], [0.5, 18], iron, 'metal', seg=4)
    # Đài phun nước (hai bên), tường quanh thấp
    for sg in (1, -1):
        cx, cz = 0, 17 * sg
        m.box([cx, 0.5, cz - 3.2], [6.4, 1.0, 0.6], 'stone', '#b9b3a2')
        m.box([cx, 0.5, cz + 3.2], [6.4, 1.0, 0.6], 'stone', '#b9b3a2')
        m.box([cx - 3.2, 0.5, cz], [0.6, 1.0, 5.8], 'stone', '#b9b3a2')
        m.box([cx + 3.2, 0.5, cz], [0.6, 1.0, 5.8], 'stone', '#b9b3a2')
        m.dec('plane', [cx, 0.9, cz], [5.8, 5.8], '#4f8aa0', 'water')
        m.dec('cyl', [cx, 1.6, cz], [0.3, 0.5, 1.4, 12], '#b9b3a2', 'stone')
    # Hàng rào cây, quán cà phê
    for p, s in (([-12, 0.7, 6], [8, 1.4, 1.2]), ([12, 0.7, -6], [8, 1.4, 1.2]), ([-12, 0.7, -9], [8, 1.4, 1.2]), ([12, 0.7, 9], [8, 1.4, 1.2])):
        m.box(p, s, 'grass', '#4a7a3a')
    for p in ((-21, 1.7, 8), (21, 1.7, -8), (-21, 1.7, -10), (21, 1.7, 10)):
        m.box(p, [4.4, 3.4, 3.4], 'plaster', '#e0d3b0'); m.dec('box', [p[0], 3.6, p[2]], [5, 0.25, 4], '#a33a2a', 'wood')
    for x, z in ((-16, 22), (16, -22), (-16, -22), (16, 22), (-8, 12), (8, -12)):
        m.box([x, 0.6, z], [1.2, 1.2, 1.2], 'crate', '#8a7350')
    # Dãy nhà Haussmann trên tường bao (mái mansard)
    for sg in (1, -1):
        m.dec('prism', [0, 7.2, sg * 28.4], [58, 2.4, 1.6], '#4a5560', 'stone')
        m.dec('prism', [sg * 28.4, 7.2, 0], [1.6, 2.4, 58], '#4a5560', 'stone', r=[0, math.pi / 2, 0])
    m.spawns(24, [-8, -4, 0, 4, 8])
    return m

# ============================================================================== COLOSSEUM – ROME (vừa-lớn)
def rome():
    m = M('rome', 'Đấu trường Colosseum – Rome', 70, 'Lớn', 'Đấu trường La Mã với các cổng vòm: đánh trong đấu trường hoặc vòng quanh vòm ngoài. Có tàn tích cột và khải hoàn môn ở hai đầu.',
          {"kind": "city", "ambient": ["sand"], "ground": {"kind": "stone", "c": "#bda983"}, "fog": "#d8cfb4", "fogNear": 80, "fogFar": 280,
           "sky": {"top": "#4d7fb5", "mid": "#9ec0d8", "horizon": "#ecdfc2"}, "wet": 0.15, "sunDir": [-0.4, 0.75, -0.35], "sunColor": "#fff0cf", "sunI": 3.4, "hemi": ["#cdd6dc", "#76694f"]},
          'stone', '#c9b690', 7)
    stone = '#cdbb92'
    def ring_side_x(zc, nArch):  # cạnh dọc trục x tại z=zc
        L = 44.0; aw = 3.8; pier = (L - nArch * aw) / (nArch + 1)
        x = -L / 2
        for i in range(nArch + 1):
            m.box([x + pier / 2, 4.0, zc], [pier, 8, 3.0], 'stone', stone)
            x += pier
            if i < nArch:
                m.box([x + aw / 2, 6.1, zc], [aw, 3.8, 3.0], 'stone', stone)   # đà trên cổng vòm (cao 4.2 -> 8)
                x += aw
    def ring_side_z(xc, nArch):
        L = 32.0 - 6.0; aw = 3.8; pier = (L - nArch * aw) / (nArch + 1)
        z = -L / 2
        for i in range(nArch + 1):
            m.box([xc, 4.0, z + pier / 2], [3.0, 8, pier], 'stone', stone)
            z += pier
            if i < nArch:
                m.box([xc, 6.1, z + aw / 2], [3.0, 3.8, aw], 'stone', stone)
                z += aw
    ring_side_x(14.5, 6); ring_side_x(-14.5, 6)
    # Hai đầu: đủ 4 cổng vòm
    for xc in (-20.5, 20.5):
        L = 26.0; nA = 3; aw = 3.8; pier = (L - nA * aw) / (nA + 1)
        z = -L / 2
        for i in range(nA + 1):
            m.box([xc, 4.0, z + pier / 2], [3.0, 8, pier], 'stone', stone)
            z += pier
            if i < nA:
                m.box([xc, 6.1, z + aw / 2], [3.0, 3.8, aw], 'stone', stone); z += aw
        # cổng vòm có góc: bịt 4 góc bằng khối vuông
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box([sx * 20.5, 4.0, sz * 14.5], [3.0, 8, 3.0], 'stone', stone)
    # Tường thấp làm chỗ nấp trong đấu trường
    for p, sz in (([-12, 0.6, 7], [4, 1.2, 0.8]), ([12, 0.6, -7], [4, 1.2, 0.8]), ([-12, 0.6, -7], [0.8, 1.2, 4]), ([12, 0.6, 7], [0.8, 1.2, 4])):
        m.box(p, sz, 'stone', '#b5a47e')
    m.dec('plane', [0, 0.03, 0], [34, 20], '#d4b87a', 'sand')
    # Cột tàn tích + bục trung tâm
    for sx in (-1, 1):
        for sz in (-1, 1):
            m.box([sx * 6, 2.2, sz * 4], [1.3, 4.4, 1.3], 'stone', '#d0c3a3')
            m.dec('cyl', [sx * 6, 4.6, sz * 4], [0.8, 0.8, 0.4, 12], '#d0c3a3', 'stone')
    m.box([0, 0.7, 0], [5, 1.4, 5], 'stone', '#b8a67e')
    # Khải hoàn môn ở hai đầu (hai trụ + đà)
    for sg in (-1, 1):
        for sx in (-1, 1):
            m.box([sx * 4.2, 3.5, sg * 27], [2.6, 7, 3.2], 'stone', '#d7c9a5')
        m.box([0, 7.8, sg * 27], [11, 1.6, 3.2], 'stone', '#d7c9a5')
        m.dec('box', [0, 9.1, sg * 27], [11.6, 1.0, 3.6], '#c9b88f', 'stone')
    # Cột đổ và cột đứng trong sân hai bên
    for p, h in (((-14, 22), 4.5), ((14, -22), 4.5), ((-22, 24), 3.0), ((22, -24), 3.0), ((-9, 24), 5.2), ((9, -24), 5.2), ((-27, 10), 4.0), ((27, -10), 4.0)):
        m.box([p[0], h / 2, p[1]], [1.2, h, 1.2], 'stone', '#d0c3a3')
    for p in ((-14, 0.6, 20), (14, 0.6, -20), (3, 0.6, 22), (-3, 0.6, -22)):
        m.box(p, [2.4, 1.2, 1.2], 'stone', '#b5a47e')
    m.box2([-24, 0.6, 3], [1.2, 1.2, 1.2], 'crate', '#8a7350')
    m.spawns(31, [-8, -4, 0, 4, 8])
    return m

# ============================================================================== KIM TỰ THÁP GIZA – AI CẬP (lớn)
def giza():
    m = M('giza', 'Kim tự tháp Giza – Ai Cập', 90, 'Rất lớn', 'Sa mạc Giza: kim tự tháp bậc thang trèo được lên đỉnh, tượng Nhân sư giữa bản đồ, tháp obelisk, tàn tích cột và rừng cọ. Tầm bắn xa, hợp bắn tỉa.',
          {"kind": "desert", "ambient": ["sand"], "ground": {"kind": "sand", "c": "#d6b878"}, "fog": "#e7d3a3", "fogNear": 90, "fogFar": 330,
           "sky": {"top": "#3f78c2", "mid": "#8fbbe6", "horizon": "#f0dfb8"}, "wet": 0.0, "sunDir": [-0.35, 0.72, -0.5], "sunColor": "#ffe9c0", "sunI": 3.7, "hemi": ["#cfdcea", "#8a7448"]},
          'stone', '#bfa06a', 8)
    sandstone = '#c9a766'
    def pyramid(cx, cz, base, n, shrink):
        for i in range(n):
            s = base - 2 * shrink * i
            if s < 1.0: break
            m.box([cx, 0.2 + 0.4 * i, cz], [s, 0.4, s], 'stone', sandstone)
    pyramid(-22, -14, 20, 12, 0.8); pyramid(22, 14, 20, 12, 0.8)
    pyramid(26, -24, 12, 8, 0.7); pyramid(-26, 24, 12, 8, 0.7)
    # Nhân sư
    m.box([0, 1.2, 0], [4.2, 2.4, 9], 'stone', '#c7a46a')
    m.box([0, 3.9, -3.4], [2.6, 3.0, 2.6], 'stone', '#c7a46a')
    m.box([-1.4, 0.4, -6.8], [1.0, 0.8, 4.4], 'stone', '#c7a46a'); m.box([1.4, 0.4, -6.8], [1.0, 0.8, 4.4], 'stone', '#c7a46a')
    m.dec('prism', [0, 5.7, -3.4], [3.2, 0.9, 3.0], '#2f6aa8', 'plaster')
    m.dec('box', [0, 3.4, -4.8], [0.5, 0.7, 0.4], '#b89258', 'stone')
    # Obelisk
    for sg in (-1, 1):
        m.box([sg * 10, 4.5, sg * -4], [1.4, 9, 1.4], 'stone', '#d8c08a')
        m.dec('cone', [sg * 10, 9.6, sg * -4], [1.0, 1.4], '#e0cc60', 'metal', seg=4, r=[0, math.pi / 4, 0])
    # Hàng cột đền
    for i in range(5):
        for sg in (-1, 1):
            m.box([-10 + i * 5, 2.5, sg * 22], [1.2, 5, 1.2], 'stone', '#d4bd88')
    m.box([0, 5.4, 22], [22, 0.8, 1.8], 'stone', '#d4bd88'); m.box([0, 5.4, -22], [22, 0.8, 1.8], 'stone', '#d4bd88')
    # Rừng cọ và lều chợ
    for x, z in ((-8, 14), (8, -14), (-34, 8), (34, -8), (-16, 34), (16, -34), (14, 24), (-14, -24)):
        m.box([x, 2.2, z], [0.55, 4.4, 0.55], 'wood', '#7a5a34')
        for a in range(6):
            ang = a * math.pi / 3
            m.dec('box', [x + math.cos(ang) * 1.5, 4.7, z + math.sin(ang) * 1.5], [2.8, 0.1, 0.7], '#4d7a34', 'grass', r=[0, -ang, 0.35])
    for p in ((-12, 1.3, 32), (12, 1.3, -32), (-34, 1.3, -14), (34, 1.3, 14)):
        m.box(p, [6, 2.6, 4], 'wood', '#a8825a'); m.dec('box', [p[0], 2.8, p[2]], [6.8, 0.2, 4.8], '#c64d3c', 'plaster')
    for p in ((-4, 0.6, 12), (4, 0.6, -12), (-30, 0.6, 0), (30, 0.6, 0), (0, 0.6, 30), (0, 0.6, -30)):
        m.box(p, [1.4, 1.2, 1.4], 'crate', '#8a7350')
    m.spawns(41, [-8, -4, 0, 4, 8])
    return m

# ============================================================================== VẠN LÝ TRƯỜNG THÀNH – TRUNG QUỐC (lớn)
def greatwall():
    m = M('greatwall', 'Vạn Lý Trường Thành – Trung Quốc', 80, 'Lớn', 'Trường Thành cắt ngang bản đồ: ba cổng thành, hai tháp canh, cầu thang lên đường đi trên tường. Phe nào chiếm tường sẽ khống chế tầm nhìn.',
          {"kind": "mountain", "ambient": ["mist"], "ground": {"kind": "grass", "c": "#7a8450"}, "fog": "#b9c4c6", "fogNear": 70, "fogFar": 250,
           "sky": {"top": "#5b8cb8", "mid": "#a6c0cf", "horizon": "#dfe5e3"}, "wet": 0.3, "sunDir": [-0.4, 0.78, -0.3], "sunColor": "#fff1da", "sunI": 3.2, "hemi": ["#c9d6df", "#657048"]},
          'stone', '#8d8d84', 7)
    wall_c = '#8f8f86'
    # Tường thành: dày 6 (z -3..3), cao 5, có 3 cổng xuyên (x=-24, 0, 24) rộng 5, cao 4
    gates = [-24, 0, 24]
    x = -40.0
    for g in gates:
        a, b = x, g - 2.5
        if b > a: m.box([(a + b) / 2, 2.5, 0], [b - a, 5, 6], 'brick', wall_c)
        m.box([g, 4.5, 0], [5, 1.0, 6], 'brick', wall_c)   # đà phía trên cổng
        x = g + 2.5
    m.box([(x + 40) / 2, 2.5, 0], [40 - x, 5, 6], 'brick', wall_c)
    # Lan can (lỗ châu mai) hai mép trên tường: thấp 1.1m, có khe
    for zc in (-2.7, 2.7):
        xx = -40.0
        while xx + 2.4 <= 40:
            seg = 2.4
            if not any(abs((xx + seg / 2) - g) < 3.4 for g in gates):
                m.box([xx + seg / 2, 5.55, zc], [seg, 1.1, 0.6], 'stone', '#a2a094')
            xx += seg + 1.0
    # Tháp canh trên tường
    for sx in (-1, 1):
        m.box([sx * 12, 5.0, 0], [8, 10, 7.6], 'brick', '#8a8a80')
        m.box([sx * 12, 10.3, 0], [9.4, 0.6, 9.0], 'stone', '#6f6a5c')
        m.dec('prism', [sx * 12, 11.7, 0], [10.4, 2.2, 10.0], '#6b3a2c', 'stone', r=[0, math.pi / 2, 0])
        for z in (-3.9, 3.9):
            m.dec('box', [sx * 12, 6.5, z], [1.0, 1.6, 0.2], '#2b2a28', 'metal')
    # Cầu thang lên đường đi trên tường (12 bậc x 0.4 = 4.8m)
    for sx in (-1, 1):
        stairs(m, sx * 18, 14.0, -1, 12, 3.0, 0.4, 0.9, 'stone', '#9c9a8e', 'z')
        stairs(m, -sx * 18, -14.0, 1, 12, 3.0, 0.4, 0.9, 'stone', '#9c9a8e', 'z')
    # Đình + bia đá + tảng đá + cây
    for p in ((-6, 0.6, 20), (6, 0.6, -20), (-30, 0.6, 18), (30, 0.6, -18), (12, 0.6, 26), (-12, 0.6, -26)):
        m.box(p, [2.6, 1.2, 1.6], 'stone', '#9c9a8e')
    for sg in (-1, 1):
        for sx in (-1, 1):
            for sz in (-1, 1):
                m.box([sg * 26 + sx * 2.4, 2.0, sg * 24 + sz * 2.4], [0.7, 4, 0.7], 'wood', '#a63a2b')
        m.box([sg * 26, 4.2, sg * 24], [6.4, 0.4, 6.4], 'wood', '#7a2f26')
        m.dec('prism', [sg * 26, 5.0, sg * 24], [7.6, 1.4, 7.6], '#3e3f42', 'stone')
    for x, z in ((-34, 12), (34, -12), (-20, -30), (20, 30), (0, 22), (0, -22)):
        tree(m, x, z, 4.0, '#3f6a34', 2.0)
    # Núi phía sau (trang trí)
    for x, z, r, h in ((-30, -52, 14, 22), (0, -56, 18, 28), (32, -52, 15, 20), (-30, 52, 14, 22), (0, 56, 18, 28), (32, 52, 15, 20), (-52, 0, 14, 18), (52, 0, 14, 18)):
        m.dec('cone', [x, h / 2, z], [r, h], '#6a7a62', 'grass', seg=7)
    m.spawns(36, [-8, -4, 0, 4, 8])
    return m

# ============================================================================== CẦU CỔNG VÀNG – SAN FRANCISCO (hẹp & dài)
def bridge():
    m = M('bridge', 'Cầu Cổng Vàng – San Francisco', 80, 'Hẹp & dài', 'Giao tranh dọc mặt cầu Cổng Vàng trong sương mù: hai tháp đỏ khổng lồ, xe cộ và dải phân cách làm chỗ nấp. Bản đồ hẹp, giao tranh tầm trung.',
          {"kind": "bridge", "ambient": ["rain", "mist"], "ground": {"kind": "water", "c": "#3b6b82"}, "fog": "#cfbdb3", "fogNear": 40, "fogFar": 170,
           "sky": {"top": "#7f9db8", "mid": "#c0ccd3", "horizon": "#e6d6cb"}, "wet": 1.0, "sunDir": [-0.3, 0.55, -0.4], "sunColor": "#ffe2c6", "sunI": 2.6, "hemi": ["#cfd6dc", "#6d6258"]},
          'metal', '#a03a2a', 7)
    red = '#b03a24'
    # Lan can hai bên mặt cầu (cao 1.4m, chặn đi và nhảy qua) — mặt cầu rộng 16 (x -8..8)
    m.box([-8.3, 0.7, 0], [0.6, 1.4, 80], 'metal', red); m.box([8.3, 0.7, 0], [0.6, 1.4, 80], 'metal', red)
    # Phần còn lại ngoài lan can: chặn hoàn toàn (nước) để người chơi không rơi ra ngoài
    m.box([-24.4, 1.5, 0], [31.2, 3.0, 80], 'water', '#3b6b82'); m.box([24.4, 1.5, 0], [31.2, 3.0, 80], 'water', '#3b6b82')
    m.dec('plane', [0, 0.02, 0], [17, 80], '#4a4d52', 'tile', tile=4)
    # Vạch kẻ đường
    for z in range(-38, 40, 6):
        m.dec('box', [0, 0.04, z], [0.25, 0.02, 2.6], '#e6d36a', 'plaster')
    # Hai tháp: hai chân + xà ngang
    for tz in (-16, 16):
        for sx in (-1, 1):
            m.box([sx * 7.6, 15, tz], [2.6, 30, 3.0], 'metal', red)
            m.dec('box', [sx * 7.6, 31, tz], [3.0, 2, 3.4], red, 'metal')
        for y in (9, 17, 25, 29.5):
            m.dec('box', [0, y, tz], [13, 1.4 if y < 29 else 1.8, 2.6], red, 'metal')
        m.box([0, 6.0, tz], [10.2, 1.0, 2.2], 'metal', red)  # xà thấp: cao 5.5-6.5 (chui qua dưới, đủ cao 1.8)
    # Cáp chính + cáp treo (trang trí)
    def seg(a, b, r, c):
        m.dec('seg', [0, 0, 0], [r], c, 'metal', a=a, b=b)
    for sx in (-1, 1):
        pts = []
        for i in range(0, 17):
            t = i / 16.0
            z = -40 + 80 * t
            if z < -16: y = 31 - (z + 16) * 0.0 + ((-16 - z) / 24) ** 2 * -17
            elif z > 16: y = 31 - ((z - 16) / 24) ** 2 * 17
            else: y = 8 + (31 - 8) * ((z / 16) ** 2)
            pts.append((sx * 7.6, y, z))
        for a, b in zip(pts, pts[1:]):
            seg(list(a), list(b), 0.22, '#9a3a24')
        for (x, y, z) in pts[1:-1]:
            if abs(z) > 17 or abs(z) < 15 or True:
                m.dec('seg', [0, 0, 0], [0.05], '#9a3a24', 'metal', a=[x, y, z], b=[x, 1.4, z])
    # Xe cộ + dải phân cách + chướng ngại
    for z in (-30, -8, 12, 30):
        m.box([-4.2, 0.7, z], [2.4, 1.4, 5.2], 'container', '#5b6b75'); 
    for z in (-24, -2, 22):
        m.box([4.2, 0.7, z], [2.4, 1.4, 5.2], 'container', '#8a6a3a')
    for z in (-28, 0, 26):
        m.box([0, 0.6, z], [0.8, 1.2, 4.0], 'barrier', '#9a9a95')
    for z in (-12, 8):
        m.box([0, 0.6, z], [0.8, 1.2, 6.0], 'barrier', '#9a9a95')
    m.box([-6.0, 1.0, -20], [2.0, 2.0, 2.0], 'crate', '#8a7350'); m.box([6.0, 1.0, 18], [2.0, 2.0, 2.0], 'crate', '#8a7350')
    m.spawns(36, [-6, -3, 0, 3, 6])
    return m

# ============================================================================== kiểm tra + ghi file
def validate(m):
    d = m.data(); boxes = d['boxes']; half = m.size / 2
    def inter(a, b):
        return all(abs(a['p'][i] - b['p'][i]) < (a['s'][i] + b['s'][i]) / 2 - 1e-6 for i in range(3))
    bad = 0
    for team in 'AB':
        for (x, z) in d['spawns'][team]['points']:
            pb = {'p': [x, 0.9, z], 's': [0.8, 1.8, 0.8]}
            for b in boxes:
                if inter(pb, b): print('  SPAWN CHẶN', m.id, team, x, z, b['m']); bad += 1
    # lưới 0.5m: ô đi được ở mặt đất (khối cao >0.45 và thấp hơn 1.8 chặn)
    N = int(m.size * 2); R = 0.4
    obs = [(b['p'][0] - b['s'][0] / 2 - R, b['p'][0] + b['s'][0] / 2 + R, b['p'][2] - b['s'][2] / 2 - R, b['p'][2] + b['s'][2] / 2 + R)
           for b in boxes if b['p'][1] + b['s'][1] / 2 > 0.45 and b['p'][1] - b['s'][1] / 2 < 1.8]
    def blocked(x, z):
        for (x0, x1, z0, z1) in obs:
            if x0 < x < x1 and z0 < z < z1: return True
        return False
    def cell(x, z): return (int(round((x + half) * 2)), int(round((z + half) * 2)))
    start = cell(*d['spawns']['A']['points'][len(d['spawns']['A']['points']) // 2]); goal = cell(*d['spawns']['B']['points'][len(d['spawns']['B']['points']) // 2])
    seen = {start}; q = collections.deque([start])
    while q:
        c = q.popleft()
        for dd in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (c[0] + dd[0], c[1] + dd[1])
            if n in seen or not (0 <= n[0] <= N and 0 <= n[1] <= N): continue
            if blocked(n[0] / 2 - half, n[1] / 2 - half): continue
            seen.add(n); q.append(n)
    ok = goal in seen
    out = [b for b in boxes[4:] if abs(b['p'][0]) + b['s'][0] / 2 > half + 0.01 or abs(b['p'][2]) + b['s'][2] / 2 > half + 0.01]
    for b in out: print('   ngoài biên:', b)
    print('  %-10s %3d hộp, %3d decor, đường A->B: %s, spawn chặn: %d, ngoài biên: %d' % (m.id, len(boxes), len(m.decor), 'CÓ' if ok else 'KHÔNG', bad, len(out)))
    return ok and bad == 0 and not out

def main():
    os.makedirs(SERVER, exist_ok=True); os.makedirs(CLIENT, exist_ok=True)
    ok = True
    for fn in (hoguom, paris, rome, giza, greatwall, bridge):
        m = fn()
        ok &= validate(m)
        for d in (SERVER, CLIENT):
            json.dump(m.data(), open(d + '/' + m.id + '.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    # kho hàng: bản gốc từ server, đồng bộ sang client
    w = json.load(open(SERVER + '/warehouse.json'))
    w['tag'] = 'Vừa'

    w['theme'] = {"kind": "warehouse", "wet": 0.6}
    Y, K = '#d4b42a', '#1b1b1b'
    dec = []
    def D(k, p, sz, c, m='plaster', r=None, **kw):
        d = {"k": k, "p": [round(v, 3) for v in p], "s": [round(v, 3) for v in sz], "c": c, "m": m}
        if r: d["r"] = r
        d.update(kw); dec.append(d)
    # dải vàng quanh tường trong
    for z in (-29.98, 29.98): D('box', [0, 1.0, z], [59.6, 0.3, 0.04], Y)
    for x in (-29.98, 29.98): D('box', [x, 1.0, 0], [0.04, 0.3, 59.6], Y)
    # đường ống và giá đỡ dọc tường
    for z in (-29.55, 29.55):
        for y, r in ((4.6, 0.14), (5.15, 0.1)):
            D('cyl', [0, y, z], [r, r, 58.6, 10], '#6a7078', 'metal', r=[0, 0, 1.5708])
        for x in range(-27, 28, 6): D('box', [x, 4.85, z], [0.2, 0.9, 0.12], '#4a4f56', 'metal')
    for x in (-29.55, 29.55):
        for y, r in ((4.6, 0.14), (5.15, 0.1)):
            D('cyl', [x, y, 0], [r, r, 58.6, 10], '#6a7078', 'metal', r=[1.5708, 0, 0])
        for z in range(-27, 28, 6): D('box', [x, 4.85, z], [0.12, 0.9, 0.2], '#4a4f56', 'metal')
    # vạch sơn trên sàn: làn đi, vạch dừng gần điểm xuất phát
    for x in (-9, 9): D('plane', [x, 0.02, 0], [0.25, 46], Y)
    for z in (-21, 21): D('plane', [0, 0.02, z], [22, 0.25], Y)
    for sg in (-1, 1):
        for i in range(8): D('plane', [-9.0 + i * 2.6 + 1.3, 0.021, sg * 24.5], [1.1, 0.35], '#e9e9e4')
    # sọc nguy hiểm dưới mép bệ bốc dỡ
    for sg in (-1, 1):
        for i in range(10): D('box', [-4.5 + i, 0.2, sg * 3.03], [1.0, 0.36, 0.06], Y if i % 2 == 0 else K)
    # viền sàn thao tác
    for sg in (-1, 1):
        for dx in (-1.0, 1.0): D('box', [-22 * sg + dx, 3.205, -1.6 * sg], [0.14, 0.02, 28.8], Y)
    w['decor'] = dec
    for d in (SERVER, CLIENT):
        json.dump(w, open(d + '/warehouse.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    for p in (ROOT + '/server/src/map.json', ROOT + '/client/assets/map.json'):
        json.dump(w, open(p, 'w'), ensure_ascii=False, indent=1)
    print('TẤT CẢ HỢP LỆ' if ok else 'CÓ LỖI')

main()
