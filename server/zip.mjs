// ZIP-архив в памяти — для «Скачать все» у карусели одним файлом.
//
// Без библиотеки: файлы кладём как есть (метод «stored», без сжатия). Слайды — PNG, они уже
// сжаты, и deflate выиграл бы проценты ценой времени сервера. Контрольная сумма — zlib.crc32
// (есть в Node с 22.2). Архив до 4 ГБ и до 65 535 файлов — формат без ZIP64; у карусели это
// 6–12 картинок по 1–3 МБ, с огромным запасом.
import zlib from 'node:zlib';

// Дата и время в формате DOS: архиваторы показывают их как время файла
const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/**
 * Собрать архив: files — [{name, data: Buffer}]. Имена — в UTF-8 (флаг 0x0800): кириллица
 * в названии машины иначе превратилась бы в кракозябры у распаковщика Windows.
 */
export const makeZip = (files, now = new Date()) => {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const {name, data} of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);   // подпись локального заголовка
    header.writeUInt16LE(20, 4);           // нужная версия
    header.writeUInt16LE(0x0800, 6);       // имена в UTF-8
    header.writeUInt16LE(0, 8);            // без сжатия
    header.writeUInt16LE(dosTime(now), 10);
    header.writeUInt16LE(dosDate(now), 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); // сжатый размер = исходный
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    locals.push(header, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);    // подпись записи оглавления
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(dosTime(now), 12);
    entry.writeUInt16LE(dosDate(now), 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);       // где лежит локальный заголовок
    central.push(entry, nameBuf);
    offset += header.length + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);        // конец оглавления
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
};
