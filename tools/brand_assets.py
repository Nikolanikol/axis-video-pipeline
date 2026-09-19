# Собирает ассеты AXIS из папки брендбука в public/brand/.
# python3 tools/brand_assets.py [папка_брендбука]   (по умолчанию — родительская папка проекта)
# Нужны: Pillow и Google Chrome (путь можно задать в CHROME_PATH).
import base64, io, os, re, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(ROOT)
OUT = os.path.join(ROOT, 'public', 'brand')
CHROME = os.environ.get('CHROME_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
RENDER = 2000  # SVG брендбука: viewBox 1500, width/height 2000

LOGOS = {  # имя -> (номер файла, перекрасить чёрное в белое)
    'sign': (4, False),              # только знак
    'logo-stacked': (3, False),      # знак + AXIS + KOREA EXPORT AUTO, для тёмного фона
    'logo-horizontal': (5, True),    # горизонтальный, текст перекрашен в белый
}
ICONS = {'icon-handshake': 13, 'icon-chat': 14, 'icon-phone': 15, 'icon-car-check': 16}


def svg_path(n):
    return os.path.join(SRC, f'Axis лого актуальные - {n}.svg')


def strip_bg(svg):
    # Подложка в экспорте — два прямоугольника на весь холст
    return re.sub(r'<rect x="-150" width="1800"[^>]*/>', '', svg)


def render_png(svg):
    with tempfile.TemporaryDirectory() as tmp:
        open(os.path.join(tmp, 'a.svg'), 'w').write(svg)
        open(os.path.join(tmp, 'a.html'), 'w').write(
            f'<html style="background:transparent"><body style="margin:0;background:transparent">'
            f'<img src="a.svg" width={RENDER} height={RENDER} style="display:block"></body></html>')
        png = os.path.join(tmp, 'a.png')
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--default-background-color=00000000', f'--window-size={RENDER},{RENDER}',
                        f'--screenshot={png}', 'file://' + os.path.join(tmp, 'a.html')],
                       check=True, capture_output=True)
        return Image.open(png).convert('RGBA')


def alpha_bbox(img, pad):
    x0, y0, x1, y1 = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    return max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)


def main():
    os.makedirs(OUT, exist_ok=True)
    k = 1500 / RENDER
    for name, (n, to_white) in LOGOS.items():
        svg = strip_bg(open(svg_path(n)).read())
        if to_white:
            svg = svg.replace('fill="#000000"', 'fill="#ffffff"')
        x0, y0, x1, y1 = alpha_bbox(render_png(svg), 6)
        vb = f'{x0 * k:.2f} {y0 * k:.2f} {(x1 - x0) * k:.2f} {(y1 - y0) * k:.2f}'
        svg = re.sub(r'viewBox="[^"]*"', f'viewBox="{vb}"', svg, count=1)
        svg = re.sub(r'width="2000"', f'width="{(x1 - x0) * k:.2f}"', svg, count=1)
        svg = re.sub(r'height="2000"', f'height="{(y1 - y0) * k:.2f}"', svg, count=1)
        open(os.path.join(OUT, name + '.svg'), 'w').write(svg)
        print(f'{name}.svg  {x1 - x0}x{y1 - y0}')

    for name, n in ICONS.items():
        img = render_png(strip_bg(open(svg_path(n)).read()))
        img = img.crop(alpha_bbox(img, 4))
        img.thumbnail((512, 512), Image.LANCZOS)
        img.save(os.path.join(OUT, name + '.png'), optimize=True)
        print(f'{name}.png  {img.width}x{img.height}')

    # Текстура шлифованной меди — растр внутри варианта №7
    m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', open(svg_path(7)).read())
    tex = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert('RGB')
    tex.thumbnail((1080, 1080), Image.LANCZOS)
    tex.save(os.path.join(OUT, 'brushed-copper.jpg'), quality=88)
    print(f'brushed-copper.jpg  {tex.width}x{tex.height}')


if __name__ == '__main__':
    main()
