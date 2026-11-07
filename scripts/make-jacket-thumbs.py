# 과잠 선택 카드용 귀여운 일러스트 썸네일 생성: python3 scripts/make-jacket-thumbs.py
# 결과: public/avatar/jacket-*.jpg (192x192). 실물 사진은 쓰지 않고 색·글자·사자 패치로 직접 그린다.
import math, os
from PIL import Image, ImageDraw, ImageFont

S, K = 192, 4
W = S * K
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LION = Image.open(os.path.join(ROOT, 'public/tex/lion-patch.png')).convert('RGBA')

def font(path, size):
    return ImageFont.truetype(path, size)
BLACK_FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
SERIF_I = '/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf'
HANJA = '/System/Library/Fonts/Hiragino Sans GB.ttc'
SANS = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

def hexc(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def shade(c, f): return tuple(max(0, min(255, int(v * f))) for v in c)
def P(x, y): return (x * K, y * K)

def tint_lion(color, width):
    a = LION.split()[3]
    solid = Image.new('RGBA', LION.size, color + (255,)); solid.putalpha(a)
    return solid.resize((width * K, int(width * K * LION.height / LION.width)), Image.LANCZOS)

def thick(d, p0, p1, w, fill):
    d.line([P(*p0), P(*p1)], fill=fill, width=int(w * K))
    r = w * K / 2
    for x, y in (P(*p0), P(*p1)):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

def arc_text(im, word, fnt, color, outline, R, span, cx, cy, sw=2 * K):
    for i, ch in enumerate(word):
        a = -span / 2 + span * (i + 0.5) / len(word)
        tile = Image.new('RGBA', (48 * K, 48 * K), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((24 * K, 24 * K), ch, font=fnt, fill=color + (255,), anchor='mm',
                                  stroke_width=(sw if outline else 0), stroke_fill=(outline or color) + (255,))
        tile = tile.rotate(-math.degrees(a), resample=Image.BICUBIC)
        x, y = cx + math.sin(a) * R, cy - math.cos(a) * R
        im.paste(tile, (int(x - 24 * K), int(y - 24 * K)), tile)

def draw(spec, out):
    body, sleeve, trim, stripe, ink = (hexc(spec[k]) for k in ('body', 'sleeve', 'trim', 'stripe', 'ink'))
    outl = hexc(spec['outline']) if spec.get('outline') else None
    line = shade(body, 0.55) if sum(body) > 120 else (60, 62, 70)  # 외곽선
    im = Image.new('RGB', (W, W), (255, 255, 255)); d = ImageDraw.Draw(im, 'RGBA')
    d.ellipse([*P(36, 168), *P(156, 184)], fill=(0, 0, 0, 26))  # 바닥 그림자
    # 소매 (뒤쪽): 외곽선 → 색 → 소맷단(직사각 리브 + 줄)
    for sx in (-1, 1):
        sh, cu = (96 + sx * 42, 52), (96 + sx * 68, 140)
        ax, ay = cu[0] - sh[0], cu[1] - sh[1]; L = math.hypot(ax, ay); ux, uy = ax / L, ay / L
        nx, ny = -uy, ux
        end = (cu[0] - ux * 9, cu[1] - uy * 9)
        thick(d, sh, end, 25 + 3, line); thick(d, sh, end, 25, sleeve)
        if spec.get('gloss'): thick(d, (sh[0] - sx * 4, sh[1] + 8), (end[0] - sx * 4, end[1] - 14), 4, (255, 255, 255, 60))
        def quad(t0, t1, w):
            pts = []
            for t, sgn in ((t0, 1), (t0, -1), (t1, -1), (t1, 1)):
                pts.append(P(cu[0] + ux * t + nx * w * sgn / 2, cu[1] + uy * t + ny * w * sgn / 2))
            return pts
        d.polygon(quad(-10, 5, 25 + 3), fill=line); d.polygon(quad(-10, 5, 25), fill=trim)
        for t in (-5.5, -1.5):
            d.line([*P(cu[0] + ux * t - nx * 11, cu[1] + uy * t - ny * 11), *P(cu[0] + ux * t + nx * 11, cu[1] + uy * t + ny * 11)], fill=stripe, width=2 * K)
    # 몸판
    d.rounded_rectangle([*P(54, 36), *P(138, 156)], radius=17 * K, fill=body, outline=line, width=3 * K)
    # 칼라(목)·밑단 리브
    d.rounded_rectangle([*P(66, 24), *P(126, 44)], radius=8 * K, fill=trim, outline=line, width=3 * K)
    d.line([P(72, 33), P(120, 33)], fill=stripe, width=2 * K)
    d.line([P(72, 38), P(120, 38)], fill=stripe, width=2 * K)
    d.rounded_rectangle([*P(56, 146), *P(136, 166)], radius=8 * K, fill=trim, outline=line, width=3 * K)
    d.line([P(62, 153), P(130, 153)], fill=stripe, width=2 * K)
    d.line([P(62, 159), P(130, 159)], fill=stripe, width=2 * K)
    # 등판 글자·사자
    cx, cy = 96 * K, 112 * K
    if spec['back'] == 'kanji':
        arc_text(im, spec['line1'], font(HANJA, 14 * K), ink, ink, 74 * K, 1.2, cx, 128 * K, sw=1)
    else:
        arc_text(im, spec['line1'], font(BLACK_FONT, 13 * K), ink, outl, 58 * K, 1.5, cx, 110 * K)
        d.text((cx, 80 * K), spec['line2'], font=font(BLACK_FONT, 12 * K), fill=ink, anchor='mm',
               stroke_width=(2 * K if outl else 0), stroke_fill=outl)
    lion = tint_lion(ink, 36); im.paste(lion, (cx - lion.width // 2, 92 * K), lion)
    for i, ln in enumerate(spec['footer'].split('|')):
        d.text((cx, (134 + i * 6) * K), ln, font=font(SERIF_I, int(spec.get('footer_size', 7) * K)), fill=ink, anchor='mm')
    # 소매 패치
    for sx in (-1, 1):
        if spec.get('sleeve_lion'):
            l = tint_lion(hexc(spec['sleeve_lion']), 15)
            im.paste(l, (int((96 + sx * 55) * K - l.width / 2), int(62 * K)), l)
        if spec.get('badge'):
            bx, by = (96 + sx * 55) * K, 70 * K
            d.ellipse([bx - 8 * K, by - 8 * K, bx + 8 * K, by + 8 * K], fill=trim, outline=ink, width=2 * K)
            d.ellipse([bx - 4 * K, by - 4 * K, bx + 4 * K, by + 4 * K], outline=ink, width=1 * K)
    im.resize((S, S), Image.LANCZOS).save(os.path.join(ROOT, 'public/avatar', out + '.jpg'), quality=90)

SPECS = {
    'jacket-school1': dict(body='#141f3c', sleeve='#f6f4ee', trim='#141f3c', stripe='#f6f4ee', ink='#f6f4ee', back='arch',
                           line1='HANYANG', line2='UNIV.', footer='Since 1939', sleeve_lion='#f6f4ee'),
    'jacket-school2': dict(body='#14141a', sleeve='#14141a', trim='#14141a', stripe='#8d9097', ink='#cfd2d8', back='kanji',
                           line1='漢陽大學校', footer='Since 1939', sleeve_lion='#cfd2d8'),
    'jacket-school3': dict(body='#17171b', sleeve='#0b0b0e', trim='#17171b', stripe='#f6f4ee', ink='#d4a93c', outline='#5b4515',
                           back='arch', line1='HANYANG', line2='UNIV.', footer='Since 1939', gloss=True),
    'jacket-dept-is': dict(body='#14224a', sleeve='#f6f4ee', trim='#14224a', stripe='#f6f4ee', ink='#f6f4ee', back='arch',
                           line1='HANYANG', line2='TECH', footer='Department of|Information Systems', footer_size=4.8, badge=True),
}
for name, spec in SPECS.items():
    spec.setdefault('back', 'arch'); draw(spec, name)
print('ok', sorted(os.listdir(os.path.join(ROOT, 'public/avatar'))))
