# Готовит фото лота для ролика: уменьшает до ширины 1080 и размывает номера.
# python3 tools/prep_photos.py <папка_лота_в_public> <исходник>:<имя>[:blur=x0,y0,x1,y1[;x0,y0,x1,y1]] ...
# Координаты blur — в пикселях исходника.
# Пример: python3 tools/prep_photos.py lots/audi-a6-2018 ../audi/Unknown.jpeg:front:blur=0,1090,56,1245
import os, sys
from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_W = 1080


def main():
    out = os.path.join(ROOT, 'public', sys.argv[1])
    os.makedirs(out, exist_ok=True)
    for arg in sys.argv[2:]:
        parts = arg.split(':')
        src, name = parts[0], parts[1]
        im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
        for opt in parts[2:]:
            if opt.startswith('blur='):
                for box in opt[5:].split(';'):
                    x0, y0, x1, y1 = map(int, box.split(','))
                    region = im.crop((x0, y0, x1, y1))
                    radius = max(12, (x1 - x0 + y1 - y0) // 10)
                    im.paste(region.filter(ImageFilter.GaussianBlur(radius)), (x0, y0))
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        path = os.path.join(out, name + '.jpg')
        im.save(path, quality=90)
        print(f'{sys.argv[1]}/{name}.jpg  {im.width}x{im.height}')


if __name__ == '__main__':
    main()
