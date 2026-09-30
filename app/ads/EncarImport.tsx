// Лот по ссылке Encar: вставил ссылку — подтянулись марка, модель, характеристики, цена
// и фото объявления; фото выбираешь сам, какие и в каком порядке пойдут в ролик.
//
// Две кнопки на выбор (решение владельца 29.09, потом лишнюю уберём): «Новый лот по ссылке»
// и «Подтянуть в этот лот». Данные — через тот же шлюз kmotors, что у каруселей.
import React, {useState} from 'react';
import {carPhotos, lotFieldsFromCar, lotIsBlank, type CarFields} from '../../src/shared/lotFromCar';
import type {CarouselCar} from '../../src/shared/types';
import {api, LotEntry} from '../api';
import {useConfig} from '../config';

type Props = {
  lot: LotEntry | null;
  // Новый лот: поля и фото в порядке выбора. Возвращает, когда всё готово
  onCreate: (fields: Partial<LotEntry>, urls: string[]) => Promise<unknown>;
  // В текущий: поля (уже решено, перетирать ли) и фото в конец
  onApply: (fields: Partial<LotEntry>, urls: string[]) => Promise<void>;
  onError: (e: unknown) => void;
};

// Превью в сетке — тот же снимок без параметров: так Encar отдаёт 640×360 (~50 КБ), а с
// «?impolicy=heightRate&rh=1080» — оригинал 2200×1237 (~450 КБ). Проверено замером 29.09:
// сам параметр rh размер не меняет. Два десятка оригиналов грузили бы сетку секундами.
// В лот идёт исходный адрес — полный размер для ролика
const thumb = (url: string) => url.split('?')[0];

export const EncarImport: React.FC<Props> = ({lot, onCreate, onApply, onError}) => {
  const {profile} = useConfig();
  const [link, setLink] = useState('');
  const [car, setCar] = useState<CarouselCar | null>(null);
  // Выбранные фото — массив, а не множество: порядок нажатий и есть порядок в лоте
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<'' | 'lookup' | 'create' | 'apply'>('');

  const photos = car ? carPhotos(car) : [];
  const recommended = photos.filter((p) => p.recommended).map((p) => p.url);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('lookup');
    try {
      const found = await api.lookupCar(link);
      setCar(found);
      setPicked(carPhotos(found).filter((p) => p.recommended).map((p) => p.url));
    } catch (err) { onError(err); } finally { setBusy(''); }
  };

  const toggle = (url: string) => setPicked((list) => (list.includes(url) ? list.filter((u) => u !== url) : [...list, url]));

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

  const create = async () => {
    setBusy('create');
    try {
      await onCreate({...(await fields()), note: note()}, picked);
      reset();
    } catch (err) { onError(err); } finally { setBusy(''); }
  };

  const apply = async () => {
    if (!lot) return;
    // Лот уже заполнен — спрашиваем. Нет — только фото, поля не трогаем
    const overwrite = lotIsBlank(lot) || window.confirm(
      'В лоте уже есть данные. Заменить марку, модель, характеристики и цену данными из Encar?\n\n«Отмена» — оставить поля как есть и добавить только фото.');
    setBusy('apply');
    try {
      const n = note(lot.note);
      await onApply(overwrite ? {...(await fields()), ...(n ? {note: n} : {})} : {}, picked);
      reset();
    } catch (err) { onError(err); } finally { setBusy(''); }
  };

  const reset = () => { setCar(null); setPicked([]); setLink(''); };

  return (
    <section className="encar">
      <form className="encar-bar" onSubmit={lookup}>
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Ссылка на объявление Encar" disabled={!!busy} />
        <button className="btn" disabled={!link.trim() || !!busy}>{busy === 'lookup' ? 'Ищу…' : 'Подтянуть из Encar'}</button>
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
            <span className="muted">Фото: выбрано {picked.length} из {photos.length} · порядок — как нажимали</span>
            <button type="button" className="link" onClick={() => setPicked(recommended)}>рекомендованные</button>
            <button type="button" className="link" onClick={() => setPicked(photos.map((p) => p.url))}>все</button>
            <button type="button" className="link" onClick={() => setPicked([])}>ни одного</button>
          </div>
          <div className="encar-photos">
            {photos.map((p) => {
              const n = picked.indexOf(p.url);
              return (
                <button type="button" key={p.url} className={n >= 0 ? 'encar-photo on' : 'encar-photo'} onClick={() => toggle(p.url)}
                  title={n >= 0 ? 'Убрать' : 'Добавить'}>
                  <img src={thumb(p.url)} alt={p.label} loading="lazy" />
                  <span className="encar-label">{p.label}</span>
                  {n >= 0 && <span className="encar-num">{n + 1}</span>}
                </button>
              );
            })}
          </div>
          <div className="btn-row">
            <button className="btn primary" onClick={create} disabled={!!busy}>
              {busy === 'create' ? 'Создаю лот…' : 'Новый лот по ссылке'}
            </button>
            {lot && (
              <button className="btn" onClick={apply} disabled={!!busy}>
                {busy === 'apply' ? 'Подтягиваю…' : 'Подтянуть в этот лот'}
              </button>
            )}
            <span className="hint">Фото копируются к нам: ролик не сломается, если объявление снимут. Бесплатно — кредиты только за сборку ролика.</span>
          </div>
        </div>
      )}
    </section>
  );
};
