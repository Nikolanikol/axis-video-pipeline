// Площадки, с которых KOK берёт объявления (13.10, владелец): клиенту надо явно видеть, что кроме
// Encar работают che168 (Китай) и Carsensor (Япония) — раньше они упоминались только в подсказке поля.
//
// Логотипы — официальные, с сайтов площадок, вырезаны и уменьшены до 72 px по высоте:
// public/sources/{encar,che168,carsensor}.png (Encar — картинка превью encar.com, che168 — логотип
// «二手车之家 · www.che168.com» от владельца, Carsensor — надпись «カーセンサー» из шапки carsensor.net).
// Логотипы сделаны под светлый фон, поэтому каждый лежит на своей светлой плашке: на тёмном
// интерфейсе синее «二手车之家» иначе не читалось бы. Это товарные знаки площадок — используем только
// как «работаем с»; попросят убрать — убираем.
//
// Новый источник (ядро в cores/<id>) — строка в SOURCES и логотип в public/sources/.
import React from 'react';

type Source = {id: string; name: string; country: string; url: string; logo: string; caption?: string};

export const SOURCES: Source[] = [
  {id: 'encar', name: 'Encar', country: 'Корея', url: 'https://www.encar.com', logo: '/sources/encar.png'},
  {id: 'che168', name: 'che168', country: 'Китай', url: 'https://www.che168.com', logo: '/sources/che168.png'},
  // Логотип японский («カーセンサー»), латиницей его не нашли — подпись «Carsensor» ставим сами (владелец 13.10).
  // Ссылка — на каталог подержанных машин, а не на главную: оттуда клиент и берёт объявления
  {id: 'carsensor', name: 'Carsensor', country: 'Япония', url: 'https://www.carsensor.net/usedcar/', logo: '/sources/carsensor.png', caption: 'Carsensor'},
];

/**
 * Строка логотипов-ссылок. Обычная — на витрине под первым экраном, с подписью «Объявления с площадок».
 * compact — мельче, в одну строку: в шапке рабочих экранов (компьютер), под полем ссылки (телефон) и в
 * подвале; Carsensor в ней — в две строки (логотип над подписью), как che168, чтобы три плашки
 * помещались в строку на телефоне (владелец 13.10). countries={false} — без подписей стран: страна
 * остаётся во всплывающей подсказке
 */
export const SourcesStrip: React.FC<{compact?: boolean; title?: string; countries?: boolean; className?: string}> = (
  {compact, title, countries = true, className},
) => (
  <div className={['sources', compact ? 'sources-compact' : '', countries ? '' : 'sources-no-country', className].filter(Boolean).join(' ')}>
    {title !== '' && <span className="sources-title">{title ?? (compact ? 'Площадки:' : 'Объявления с площадок')}</span>}
    <ul className="sources-list">
      {SOURCES.map((s) => (
        <li key={s.id}>
          <a className={`source source-${s.id}`} href={s.url} target="_blank" rel="noreferrer noopener" title={`${s.name} — открыть сайт площадки (${s.country})`}>
            <span className="source-plate">
              <img src={s.logo} alt={s.name} loading="lazy" />
              {s.caption && <span className="source-caption">{s.caption}</span>}
            </span>
            <span className="source-country">{s.country}</span>
          </a>
        </li>
      ))}
    </ul>
  </div>
);
