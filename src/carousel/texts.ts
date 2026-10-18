// Тексты карусели, разложенные по слайдам: какой вариант фразы взять, что подставить из данных
// машины и что клиент переписал сам.
//
// Одна функция на всех: вёрстка (Carousel.tsx, deck/Deck.tsx) рисует по ней слайды, сервер
// получает тот же результат через calculateMetadata (Root.tsx) — и отдаёт интерфейсу, где под
// слайдом поле «Редактировать текст». Считай тексты только здесь: если вёрстка выберет фразу
// сама, в окне правки окажется не то, что на картинке.
//
// Поля слайда — то, что клиент может переписать: рубрика, заголовок, текст, подпись. Значки
// преимуществ, опции и цифры — данные, их не правят.
import type {CarouselCar, CarouselProps, CarouselTexts} from '../shared/types';
import {themeOf} from '../shared/model';
import {carouselFormat, carouselSlides} from './formats';
import {carouselLang, carouselText, type CarouselText} from './i18n';
import {carFacts, choose, factOf, fill} from './i18n/copy';
import {isDesign} from '../shared/design.js';

/** Подписи полей в окне правки — в том порядке, в каком они стоят на слайде */
export const TEXT_FIELDS: {key: string; label: string}[] = [
  {key: 'section', label: 'Рубрика'},
  {key: 'tagline', label: 'Надпись под названием'},
  {key: 'title', label: 'Заголовок'},
  {key: 'label', label: 'Подпись над ценой'},
  {key: 'text', label: 'Текст'},
  {key: 'strap', label: 'Подпись внизу'},
  {key: 'note', label: 'Пояснение'},
  {key: 'swipe', label: 'Призыв листать'},
];
// Где {слово} рисуется акцентом: только заголовки новых форматов (Headline в deck/Kit.tsx).
// В «Классике» скобки вышли бы на слайд как есть — там подсказку про акцент не показываем
export const accentField = (format: string | undefined, field: string) =>
  field === 'title' && carouselFormat(format).id !== 'classic';
// Длина поля: самый длинный текст варианта — ~110 знаков; втрое больше уже не помещается ни в
// одну вёрстку, а сервер не должен хранить в carousel.json что угодно
export const TEXT_MAX = 300;

// Пресеты оформления (src/design) рисуют не всё: заголовок у них — короткая рубрика, текстов под
// ним нет. В окно правки — только то, что пресет показывает, иначе правка «ничего не меняла бы».
// Слайда нет в списке — у него в пресете только данные (обложка: марка, модель, год)
const DESIGN_FIELDS: Record<string, string[]> = {
  history: ['title'], price: ['label', 'title'], cta: ['title', 'text'], why: ['section'],
  exterior: ['section'], interior: ['section'], details: ['section'], engine: ['section'], safety: ['section'],
  rear: ['section'], gallery: ['section'], technology: ['section'], specs: ['section'],
};
// У цены в «Классике» подпись — label, в новых форматах — title: пресет берёт что есть, одно
const designKeep = (slide: string, f: Record<string, string>) => {
  const keys = DESIGN_FIELDS[slide] ?? [];
  const price = slide === 'price' ? ('label' in f ? ['label'] : ['title']) : keys;
  return Object.fromEntries(Object.entries(f).filter(([k]) => price.includes(k)));
};

/** Русское число со словом: 1 опция, 2 опции, 5 опций */
const plural = (n: number, one: string, few: string, many: string) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
};

/** Подстановки %…% из данных машины */
const carVars = (car: CarouselCar, tx: CarouselText, brandName: string): Record<string, string> => {
  const ru = tx.lang === 'ru';
  const opts = car.options?.total ?? 0;
  const seats = car.seats ?? 0;
  return {
    model: [car.brand, car.model].filter(Boolean).join(' '),
    brand: brandName,
    engine: tx.liters(car.displacementCc),
    mileage: tx.km(car.mileageKm),
    year: car.year ? String(car.year) : '',
    options: ru ? `${opts} ${plural(opts, 'опция', 'опции', 'опций')}` : `${opts} features`,
    seats: ru ? `${seats} ${plural(seats, 'место', 'места', 'мест')}` : `${seats} seats`,
  };
};

/** Все тексты карусели по слайдам: тот же вход — тот же результат (зерно, память, правки) */
export const carouselTexts = (props: CarouselProps): CarouselTexts => {
  const car = props.car;
  const tx = carouselText(carouselLang(props.market?.language), car?.origin);
  const copy = tx.copy;
  const seed = props.seed ?? 1;
  const facts = carFacts(car);
  const vars = carVars(car, tx, themeOf(props.theme).name);
  const picked: Record<string, string> = {};
  const layout: Record<string, string> = {};

  // Фраза: вариант с памятью дилера, данные машины подставлены. Каждый факт о машине — один раз
  // на карусель: у Genesis GV70 «53 опции» вышли и на обложке, и в салоне, а «премиум» — трижды
  // (проба 19.10), и довод от повтора превращался в заклинание
  const unused = new Set(facts);
  const say = (items: string[], key: string) => {
    const c = choose(items, seed, key, unused, props.recent);
    picked[key] = c.id;
    const fact = factOf(c.item);
    if (fact) unused.delete(fact as never);
    return fill(c.item, vars);
  };
  // Компоновка и наборы значков: тоже с памятью — два поста подряд не выходят одной раскладкой
  const variant = <T,>(items: T[], key: string, id?: (t: T, i: number) => string) => {
    const c = choose(items, seed, key, facts, props.recent, id);
    picked[key] = c.id;
    return c;
  };
  const set = (key: string, items: unknown[]) => { layout[key] = variant(items, key, (_t, i) => String(i)).id; };

  const h = car.history;
  const classic = carouselFormat(props.format).id === 'classic';
  const design = isDesign(themeOf(props.theme).design);
  const names = carouselSlides(props.format, props.includeHistory !== false, props.skip);
  const slides = names.map((slide) => {
    const f: Record<string, string> = {};
    if (classic) {
      const k = copy.classic;
      if (slide === 'cover') { f.tagline = say(k.tagline, 'c-cover-t'); f.swipe = say(k.swipe, 'c-cover-s'); }
      if (slide === 'history') {
        f.section = tx.s.history;
        if (!h) f.title = say(k.historyNone, 'c-his-t');
        else if (!h.accidentsTotal) { f.title = say(k.historyClean, 'c-his-t'); f.note = say(k.cleanNote, 'c-his-n'); } else f.title = say(k.historyClaims, 'c-his-t');
      }
      if (slide === 'interior') f.section = say(k.interior, 'c-int-k');
      if (slide === 'technology') f.section = say(k.technology, 'c-tech-k');
      if (slide === 'specs') f.section = say(k.specs, 'c-specs-k');
      if (slide === 'price') { f.section = say(k.price, 'c-pr-k'); f.label = say(k.priceLabel, 'c-pr-l'); }
      if (slide === 'cta') { f.title = say(k.ctaTitle, 'c-cta-t'); f.text = say(k.ctaText, 'c-cta-x'); }
    } else {
      if (slide === 'cover') {
        f.section = say(copy.cover.tagline, 'cover-t');
        layout.cover = variant(['side', 'full'], 'cover').item;
        // Подпись внизу есть только у раскладки «сбоку»; у «во весь кадр» там значки
        if (layout.cover === 'side') f.strap = say(copy.cover.strap, 'cover-s');
        else set('coverBenefits', copy.cover.benefits);
      }
      if (slide === 'exterior' || slide === 'interior') {
        const c = copy[slide];
        f.section = say(c.kicker, `${slide}-k`); f.title = say(c.title, `${slide}-t`); f.text = say(c.text, `${slide}-x`);
        layout[slide] = variant(['band', 'tiles'], slide).item;
      }
      if (slide === 'details') { f.section = say(copy.details.kicker, 'det-k'); f.title = say(copy.details.title, 'det-t'); }
      if (slide === 'engine') { const c = copy.engine; f.section = say(c.kicker, 'eng-k'); f.title = say(c.title, 'eng-t'); f.text = say(c.text, 'eng-x'); }
      if (slide === 'safety') { const c = copy.safety; f.section = say(c.kicker, 'saf-k'); f.title = say(c.title, 'saf-t'); f.text = say(c.text, 'saf-x'); }
      if (slide === 'history') {
        const c = !h ? copy.historyNone : h.accidentsTotal ? copy.historyClaims : copy.historyClean;
        f.section = say(c.kicker, 'his-k'); f.title = say(c.title, 'his-t'); f.text = say(c.text, 'his-x');
      }
      if (slide === 'rear') { const c = copy.rear; f.section = say(c.kicker, 'rear-k'); f.title = fill(c.title[0], vars); f.text = say(c.text, 'rear-x'); }
      if (slide === 'gallery') f.section = say(copy.gallery.kicker, 'gal-k');
      if (slide === 'price') { f.section = say(copy.price.kicker, 'pr-k'); f.title = say(copy.price.title, 'pr-t'); }
      if (slide === 'why') { f.section = say(copy.why.kicker, 'why-k'); f.title = say(copy.why.title, 'why-t'); set('whyBenefits', copy.why.benefits); }
      if (slide === 'cta') {
        f.section = say(copy.cta.kicker, 'cta-k'); f.title = say(copy.cta.title, 'cta-t'); f.text = say(copy.cta.text, 'cta-x');
        set('ctaGuarantees', copy.cta.guarantees);
      }
    }
    // Свой текст клиента поверх варианта; пустой — вернуть вариант (как у текстов профиля)
    const own = props.textOverrides?.[slide] ?? {};
    for (const key of Object.keys(f)) {
      const v = own[key];
      if (typeof v === 'string' && v.trim()) f[key] = v.slice(0, TEXT_MAX);
    }
    return {slide, fields: design ? designKeep(slide, f) : f};
  });
  return {slides, layout, picked};
};
