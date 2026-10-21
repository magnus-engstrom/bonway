"""Läser alla tools/tiles/t*.png och skriver public/data/tiles.json.

Varje tile blir en lista med rader där '.' är öppen yta (vit pixel) och '#' är vägg (svart pixel).
Kör: npm run build-tiles
"""
import glob, json, os, re, struct, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_OPEN = 20  # högst så många öppna pixlar av 25


def read_png(path):
    data = open(path, 'rb').read()
    i, idat = 8, b''
    while i < len(data):
        length = struct.unpack('>I', data[i:i + 4])[0]
        kind, chunk = data[i + 4:i + 8], data[i + 8:i + 8 + length]
        if kind == b'IHDR':
            w, h, depth, color = struct.unpack('>IIBB', chunk[:10])
        elif kind == b'IDAT':
            idat += chunk
        i += 12 + length
    if depth != 8 or color not in (0, 2, 4, 6):
        raise ValueError(f'{path}: stöds inte (bitdjup {depth}, färgtyp {color})')
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[color]
    raw, stride, prev, k, rows = zlib.decompress(idat), w * bpp, bytearray(w * bpp), 0, []
    for _ in range(h):
        f = raw[k]
        line = bytearray(raw[k + 1:k + 1 + stride])
        k += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        # Ljusstyrkan avgör: ljus pixel = öppen, mörk = vägg
        rows.append(''.join('.' if sum(line[x * bpp:x * bpp + min(bpp, 3)]) / min(bpp, 3) > 128 else '#' for x in range(w)))
        prev = line
    return rows


files = sorted(glob.glob(os.path.join(HERE, 'tiles', 't*.png')), key=lambda p: int(re.findall(r'\d+', os.path.basename(p))[0]))
tiles = [{'name': os.path.splitext(os.path.basename(p))[0], 'rows': read_png(p)} for p in files]
# Tiles som är helt eller nästan helt öppna ger stora tomma ytor där linjerna bara glider rakt igenom
skipped = [t['name'] for t in tiles if ''.join(t['rows']).count('.') > MAX_OPEN]
tiles = [t for t in tiles if t['name'] not in skipped]
with open(os.path.join(HERE, '..', 'public', 'data', 'tiles.json'), 'w') as out:
    json.dump(tiles, out, indent=1)
print(f'{len(tiles)} tiles -> tiles.json (hoppade över {len(skipped)} för öppna: {", ".join(skipped)})')
