# Собирает ассеты AXIS из папки брендбука в public/brand/.
# python3 tools/brand_assets.py [папка_брендбука]   (по умолчанию — родительская папка проекта)
# Нужны: Pillow и Google Chrome. Chrome ищется сам — macOS, Windows, Linux (PATH);
# нестандартную сборку можно указать в CHROME_PATH.
import base64, io, os, pathlib, re, shutil, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(ROOT)
OUT = os.path.join(ROOT, 'public', 'brand')
RENDER = 2000  # SVG брендбука: viewBox 1500, width/height 2000

# Где искать Chrome, если не задан CHROME_PATH
CHROME_CANDIDATES = {
    'darwin': [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        os.path.expanduser('~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ],
    'win32': [
        os.path.join(os.environ.get('PROGRAMFILES', r'C:\Program Files'),
                     r'Google\Chrome\Application\chrome.exe'),
        os.path.join(os.environ.get('PROGRAMFILES(X86)', r'C:\Program Files (x86)'),
                     r'Google\Chrome\Application\chrome.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', ''),
                     r'Google\Chrome\Application\chrome.exe'),
    ],
}
# Linux и всё остальное — только из PATH
CHROME_IN_PATH = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']


def find_chrome():
    custom = os.environ.get('CHROME_PATH')
    if custom:
        if not os.path.exists(custom):
            sys.exit(f'CHROME_PATH указывает в пустоту: {custom}')
        return custom
    for path in CHROME_CANDIDATES.get(sys.platform, []):
        if os.path.exists(path):
            return path
    for name in CHROME_IN_PATH:
        found = shutil.which(name)
        if found:
            return found
    sys.exit('Chrome не найден. Установите Google Chrome или укажите путь в CHROME_PATH.')


CHROME = find_chrome()

LOGOS = {  # имя -> (номер файла, перекрасить чёрное в белое)
    'sign': (4, False),              # только знак
    'logo-stacked': (3, False),      # знак + AXIS + KOREA EXPORT AUTO, для тёмного фона
    'logo-horizontal': (5, True),    # горизонтальный, текст перекрашен в белый
}
ICONS = {'icon-handshake': 13, 'icon-chat': 14, 'icon-phone': 15, 'icon-car-check': 16}


def svg_path(n):
    return os.path.join(SRC, f'Axis лого актуальные - {n}.svg')


def read_svg(n):
    path = svg_path(n)
    if not os.path.exists(path):
        sys.exit(f'Нет файла: {path}')
    # encoding обязателен: без него Windows читает в кодировке локали (cp1251)
    return open(path, encoding='utf-8').read()


def strip_bg(svg):
    # Подложка в экспорте — два прямоугольника на весь холст
    return re.sub(r'<rect x="-150" width="1800"[^>]*/>', '', svg)


def render_png(svg):
    with tempfile.TemporaryDirectory() as tmp:
        html = os.path.join(tmp, 'a.html')
        open(os.path.join(tmp, 'a.svg'), 'w', encoding='utf-8').write(svg)
        open(html, 'w', encoding='utf-8').write(
            f'<html style="background:transparent"><body style="margin:0;background:transparent">'
            f'<img src="a.svg" width={RENDER} height={RENDER} style="display:block"></body></html>')
        png = os.path.join(tmp, 'a.png')
        # as_uri(), а не 'file://' + путь: на Windows иначе выходит file://C:\... и Chrome
        # принимает C: за имя хоста
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--default-background-color=00000000', f'--window-size={RENDER},{RENDER}',
                        f'--user-data-dir={os.path.join(tmp, "profile")}',
                        f'--screenshot={png}', pathlib.Path(html).as_uri()],
                       check=True, capture_output=True)
        return Image.open(png).convert('RGBA')


def alpha_bbox(img, pad):
    x0, y0, x1, y1 = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    return max(0, x0 - pad), max(0, y0 - pad), min(img.width, x1 + pad), min(img.height, y1 + pad)


def main():
    os.makedirs(OUT, exist_ok=True)
    k = 1500 / RENDER
    for name, (n, to_white) in LOGOS.items():
        svg = strip_bg(read_svg(n))
        if to_white:
            svg = svg.replace('fill="#000000"', 'fill="#ffffff"')
        x0, y0, x1, y1 = alpha_bbox(render_png(svg), 6)
        vb = f'{x0 * k:.2f} {y0 * k:.2f} {(x1 - x0) * k:.2f} {(y1 - y0) * k:.2f}'
        svg = re.sub(r'viewBox="[^"]*"', f'viewBox="{vb}"', svg, count=1)
        svg = re.sub(r'width="2000"', f'width="{(x1 - x0) * k:.2f}"', svg, count=1)
        svg = re.sub(r'height="2000"', f'height="{(y1 - y0) * k:.2f}"', svg, count=1)
        open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8').write(svg)
        print(f'{name}.svg  {x1 - x0}x{y1 - y0}')

    for name, n in ICONS.items():
        img = render_png(strip_bg(read_svg(n)))
        img = img.crop(alpha_bbox(img, 4))
        img.thumbnail((512, 512), Image.LANCZOS)
        img.save(os.path.join(OUT, name + '.png'), optimize=True)
        print(f'{name}.png  {img.width}x{img.height}')

    # Текстура шлифованной меди — растр внутри варианта №7
    m = re.search(r'data:image/jpeg;base64,([A-Za-z0-9+/=]+)', read_svg(7))
    if not m:
        sys.exit(f'В {svg_path(7)} нет растра меди (data:image/jpeg;base64,...)')
    tex = Image.open(io.BytesIO(base64.b64decode(m.group(1)))).convert('RGB')
    tex.thumbnail((1080, 1080), Image.LANCZOS)
    tex.save(os.path.join(OUT, 'brushed-copper.jpg'), quality=88)
    print(f'brushed-copper.jpg  {tex.width}x{tex.height}')


if __name__ == '__main__':
    main()
