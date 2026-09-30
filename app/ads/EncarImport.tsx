// Фото объявления Encar для открытого лота: палитра всех снимков, из которой берут те, что
// нравятся больше автоподбора, — отметив и нажав «Подгрузить фотографии» или перетащив
// снимок прямо в галерею лота (LotForm).
//
// Владелец 01.10: лот уже создан вставкой ссылки, здесь только правят его фото — из того же
// объявления. Поэтому «Новый лот по ссылке» убрана (новый лот — это строка сверху), а
// предвыбора нет: рекомендованные снимки и так уже в лоте, повторная загрузка дала бы дубли.
// Данные — через тот же шлюз kmotors, что у каруселей.
import React, {useEffect, useRef, useState} from 'react';
import {Check, Link2, Search} from 'lucide-react';
import {carPhotos, lotFieldsFromCar, lotIsBlank, type CarFields} from '../../src/shared/lotFromCar';
import type {CarouselCar} from '../../src/shared/types';
import {api, LotEntry} from '../api';
import {useConfig} from '../config';
import {encarUrl} from './QuickLot';

/** Тип данных при перетаскивании снимков из палитры в галерею лота: JSON-массив адресов */
export const ENCAR_PHOTO_DRAG = 'application/x-kok-encar-photos';

type Props = {
  lot: LotEntry | null;
  // В текущий лот: поля (только если лот пустой) и фото в конец
  onApply: (fields: Partial<LotEntry>, urls: string[]) => Promise<void>;
  onError: (e: unknown) => void;
};

// Превью в сетке — тот же снимок без параметров: так Encar отдаёт 640×360 (~50 КБ), а с
// «?impolicy=heightRate&rh=1080» — оригинал 2200×1237 (~450 КБ). Проверено замером 29.09:
// сам параметр rh размер не меняет. Два десятка оригиналов грузили бы сетку секундами.
// В лот идёт исходный адрес — полный размер для ролика
const thumb = (url: string) => url.split('?')[0];

// Основной путь — вставка ссылки в QuickLink (сама всё выбирает), а здесь человек сам
// добирает фото — под «Изменить вручную»
export const EncarImport: React.FC<Props> = ({lot, onApply, onError}) => {
  const {profile} = useConfig();
  const [link, setLink] = useState('');
  const [car, setCar] = useState<CarouselCar | null>(null);
  // Выбранные фото — массив, а не множество: порядок нажатий и есть порядок в лоте
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'lookup' | 'apply'>('');
  const input = useRef<HTMLInputElement>(null);

  // Ссылка лота подставляется в поле сама (владелец 01.10: «чтобы не копировать и не
  // вставлять по несколько раз»). Только подставляется: поиск человек запускает кнопкой —
  // он может прийти сюда править тексты, и незваная сетка фото ему ни к чему.
  // Сменили лот — найденная для прежнего машина закрывается: иначе «Подтянуть в этот лот»
  // записало бы чужие фото
  const saved = lot ? encarUrl(lot) : null;
  useEffect(() => { setLink(saved ?? ''); }, [lot?.id, saved]);
  useEffect(() => { setCar(null); setPicked([]); }, [lot?.id]);

  const photos = car ? carPhotos(car) : [];
  // Уже в лоте (lot.sources ведёт сервер при загрузке): такие снимки помечены и не
  // выбираются — второй раз загрузился бы дубль. Удалили фото из лота — снимок снова свободен.
  // У лотов, собранных до 01.10, записи нет — там пометок не будет
  const inLot = new Set(Object.values(lot?.sources ?? {}));
  const loaded = (url: string) => inLot.has(thumb(url));
  const free = photos.filter((p) => !loaded(p.url));
  const recommended = free.filter((p) => p.recommended).map((p) => p.url);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    // Кнопка не гаснет при пустом поле, как и «Найти» сверху, — ставим курсор в поле
    if (!link.trim()) { input.current?.focus(); return; }
    setBusy('lookup');
    try {
      const found = await api.lookupCar(link);
      setCar(found);
      setPicked([]);
    } catch (err) { onError(err); } finally { setBusy(''); }
  };

  const toggle = (url: string) => setPicked((list) => (list.includes(url) ? list.filter((u) => u !== url) : [...list, url]));
  const loadedCount = photos.length - free.length;

  // Поля лота + курс на сегодня. Цена — в вонах, как на Encar; курс берём свежий, а не
  // из ответа шлюза: у шлюза курс банка на момент запроса машины, у нас — общий на сутки,
  // один для всех лотов. Цена в долларах сбрасывается: иначе она «главнее ₩» и старая
  // перекрыла бы новую
  const fields = async (): Promise<Partial<LotEntry>> => {
    const {hookTagline, ...base}: CarFields = lotFieldsFromCar(car!, profile.language);
    const rate = await api.usdKrw().catch(() => null);
    // Подзаголовок — в тексты лота (они поверх текстов профиля). Сказать нечего — не трогаем:
    // пустой подзаголовок стёр бы фразу, которую человек мог вписать сам
    const texts = hookTagline ? {texts: {...lot?.texts, hookTagline}} : {};
    return {...base, ...texts, carPriceUsd: null, krwPerUsd: rate?.krwPerUsd ?? lot?.krwPerUsd ?? null};
  };
  const note = (current?: string) => (current?.trim() ? undefined : `Encar ${car!.id}`);

  // Пустой лот («+ Новый лот») заполняем из объявления целиком; в заполненном поля не
  // трогаем вовсе — сюда приходят за фото. Раньше здесь был вопрос «заменить данные?»,
  // и неверный ответ стирал правки, сделанные руками
  const blank = !!lot && lotIsBlank(lot);
  const apply = async () => {
    if (!lot) return;
    setBusy('apply');
    try {
      const n = note(lot.note);
      await onApply(blank ? {...(await fields()), ...(n ? {note: n} : {})} : {}, picked);
      setPicked([]);
    } catch (err) { onError(err); } finally { setBusy(''); }
  };

  // Перетаскивание в галерею: тянут один снимок, а если он среди отмеченных — всю отметку
  // разом. Адреса полного размера едут в dataTransfer, загрузку делает галерея (LotForm)
  const dragged = useRef<string[]>([]);
  const dragStart = (e: React.DragEvent, url: string) => {
    dragged.current = picked.includes(url) ? picked : [url];
    e.dataTransfer.setData(ENCAR_PHOTO_DRAG, JSON.stringify(dragged.current));
    e.dataTransfer.effectAllowed = 'copy';
  };
  // Бросили в галерею — снимаем отметки с уехавших, чтобы кнопка не загрузила их второй раз
  const dragEnd = (e: React.DragEvent) => {
    if (e.dataTransfer.dropEffect !== 'none') setPicked((list) => list.filter((u) => !dragged.current.includes(u)));
  };

  // Ссылку не стираем: это ссылка машины лота, она ещё пригодится («подтянуть ещё фото»)
  const reset = () => { setCar(null); setPicked([]); };

  return (
    <section className="encar">
      <form className="link-bar encar-bar" onSubmit={lookup}>
        <Link2 className="link-bar-icon" size={20} aria-hidden />
        <input ref={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Ссылка на объявление Encar"
          aria-label="Ссылка на объявление Encar" disabled={!!busy} />
        <button className="btn primary link-go" disabled={!!busy}>
          <Search size={17} aria-hidden />{busy === 'lookup' ? 'Ищу…' : 'Подтянуть из Encar'}
        </button>
        {car && <button type="button" className="btn ghost" onClick={reset} disabled={!!busy}>Закрыть</button>}
      </form>

      {car && (
        <div className="encar-found">
          <div className="encar-head">
            <b>{[car.brand, car.model, car.grade].filter(Boolean).join(' ')}</b>
            <span className="muted">
              {[car.year, car.mileageKm !== null ? `${car.mileageKm.toLocaleString('ru-RU')} км` : '',
                car.price ? `₩${car.price.krw.toLocaleString('ru-RU')}` : 'без цены'].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="encar-tools">
            <span className="muted">Фото: выбрано {picked.length} из {photos.length}{loadedCount > 0 && `, уже загружено ${loadedCount}`} · нажмите, чтобы отметить, или перетащите в галерею ниже</span>
            <button type="button" className="link" onClick={() => setPicked(recommended)}>рекомендованные</button>
            <button type="button" className="link" onClick={() => setPicked(free.map((p) => p.url))}>все</button>
            <button type="button" className="link" onClick={() => setPicked([])}>ни одного</button>
          </div>
          <div className="encar-photos">
            {photos.map((p) => {
              const n = picked.indexOf(p.url);
              if (loaded(p.url)) return (
                <div key={p.url} className="encar-photo loaded" title="Это фото уже загружено">
                  <img src={thumb(p.url)} alt={p.label} loading="lazy" draggable={false} />
                  <span className="encar-label">{p.label}</span>
                  <span className="encar-in-lot"><Check size={13} aria-hidden />загружено</span>
                </div>
              );
              return (
                <button type="button" key={p.url} className={n >= 0 ? 'encar-photo on' : 'encar-photo'} onClick={() => toggle(p.url)}
                  title={n >= 0 ? 'Убрать' : 'Добавить'}>
                  {/* Тянется картинка, а не кнопка: Firefox кнопки не перетаскивает */}
                  <img src={thumb(p.url)} alt={p.label} loading="lazy" draggable
                    onDragStart={(e) => dragStart(e, p.url)} onDragEnd={dragEnd} />
                  <span className="encar-label">{p.label}</span>
                  {n >= 0 && <span className="encar-num">{n + 1}</span>}
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            {lot && (
              <button className="btn primary encar-load" onClick={apply} disabled={!!busy || (!blank && !picked.length)}>
                {busy === 'apply' ? 'Загружаю…'
                  : blank ? (picked.length ? `Заполнить из Encar и подгрузить фотографии (${picked.length})` : 'Заполнить из Encar')
                  : `Подгрузить фотографии${picked.length ? ` (${picked.length})` : ''}`}
              </button>
            )}
            <span className="hint">Фото добавятся в конец галереи. Они копируются к нам: ролик не сломается, если объявление на Encar снимут. Бесплатно — кредиты только за сборку ролика.</span>
          </div>
        </div>
      )}
    </section>
  );
};
