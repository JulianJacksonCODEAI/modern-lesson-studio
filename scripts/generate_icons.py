import zlib
import struct
import math
import os

def create_png(width, height, pixel_func):
    """
    Creates a PNG in pure Python using zlib and struct.
    pixel_func takes (x, y) normalized [0..1] and returns (r, g, b, a) in [0..255]
    """
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        ny = (y + 0.5) / height
        for x in range(width):
            nx = (x + 0.5) / width
            r, g, b, a = pixel_func(nx, ny, x, y)
            raw_data.extend([int(r), int(g), int(b), int(a)])
            
    compressed = zlib.compress(bytes(raw_data), level=9)
    
    def chunk(tag, data):
        length = struct.pack(">I", len(data))
        crc = struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
        return length + tag + data + crc

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    
    png = (
        header +
        chunk(b"IHDR", ihdr) +
        chunk(b"IDAT", compressed) +
        chunk(b"IEND", b"")
    )
    return png

def render_icon(size):
    def pixel(nx, ny, px, py):
        # Center coordinates [-1, 1]
        cx = (nx - 0.5) * 2
        cy = (ny - 0.5) * 2
        
        # Rounded squircle distance
        # pow(|cx|, 4) + pow(|cy|, 4) <= 1
        d = math.pow(abs(cx), 4.2) + math.pow(abs(cy), 4.2)
        
        if d > 1.0:
            # Antialiasing outer boundary
            edge = (d - 1.0) / 0.15
            if edge >= 1.0:
                return (0, 0, 0, 0)
            alpha_bg = max(0.0, 1.0 - edge)
        else:
            alpha_bg = 1.0
            
        # Background gradient: Indigo to Cyan / Violet (#4F46E5 -> #06B6D4)
        grad_t = (nx + ny) / 2.0
        bg_r = int(79 * (1 - grad_t) + 6 * grad_t)
        bg_g = int(70 * (1 - grad_t) + 182 * grad_t)
        bg_b = int(229 * (1 - grad_t) + 212 * grad_t)
        
        # Symbol in center: AI Sparkle (4-point star) + book base
        # Sparkle 1: centered at (cx = 0, cy = -0.15)
        sx = cx
        sy = cy + 0.15
        dist_sparkle = math.sqrt(abs(sx) * abs(sy) + 0.001)
        # 4-pointed star equation: |sx|*|sy| small and sqrt(sx^2 + sy^2) < radius
        rad = math.sqrt(sx*sx + sy*sy)
        
        # Star shape
        in_star = (rad < 0.55) and (dist_sparkle < 0.18)
        
        # Lower book bar: rounded rectangle from cx in [-0.55, 0.55], cy in [0.35, 0.55]
        in_book = False
        if abs(cx) <= 0.5 and 0.25 <= cy <= 0.52:
            # open book curve
            book_curve = 0.08 * math.sin(cx * math.pi)
            if abs(cy - 0.38 - book_curve) < 0.11:
                in_book = True
                
        # Small accent sparkle at top right: (cx = 0.4, cy = -0.45)
        asx = cx - 0.4
        asy = cy + 0.45
        arad = math.sqrt(asx*asx + asy*asy)
        adist = math.sqrt(abs(asx) * abs(asy) + 0.0001)
        in_accent = (arad < 0.22) and (adist < 0.07)

        if in_star or in_book or in_accent:
            # Crisp white foreground
            r, g, b, a = 255, 255, 255, int(255 * alpha_bg)
        else:
            r, g, b, a = bg_r, bg_g, bg_b, int(255 * alpha_bg)
            
        return r, g, b, a

    return create_png(size, size, pixel)

def main():
    os.makedirs("icons", exist_ok=True)
    for size in [16, 48, 128]:
        png_data = render_icon(size)
        path = os.path.join("icons", f"icon-{size}.png")
        with open(path, "wb") as f:
            f.write(png_data)
        print(f"Generated {path} ({size}x{size}, {len(png_data)} bytes)")

if __name__ == "__main__":
    main()
