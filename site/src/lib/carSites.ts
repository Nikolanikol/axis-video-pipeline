// Статья «Где искать машины в Корее» (18.11, владелец: «чтобы албанским друзьям было где посмотреть и как
// поработать; упоминания площадок — лид-магнит»). На трёх языках: Encar ищут Косово и Албания, остальной
// мир — по-английски (docs/projects/site/wordstat.md). Только проверяемое: что за площадка, кто продаёт,
// адрес. KOK пока читает ссылки Encar (и che168, Carsensor) — других площадок не обещаем.
import type {Lang} from './i18n';

export const CAR_SITES_PAGE = '/korean-car-sites/';

type Site = {name: string; url: string; host: string; kok: boolean; what: string; who: string; tip: string};
export type CarSites = {
  seo: {title: string; description: string};
  crumb: string; eyebrow: string; h1: string; lead: string;
  sitesTitle: string; whoLabel: string; tipLabel: string; kokYes: string; kokNo: string;
  sites: Site[];
  howTitle: string; how: string[];
  kokTitle: string; kokText: string; kokCta: string;
  faq: {q: string; a: string}[];
};

const URLS = {
  encar: 'https://www.encar.com', kb: 'https://www.kbchachacha.com', kcar: 'https://www.kcar.com', heydealer: 'https://www.heydealer.com',
};

const RU: CarSites = {
  seo: {
    title: 'Где искать машины в Корее: Encar, KB Chachacha, K Car | KOK',
    description: 'Корейские площадки подержанных машин: Encar, KB Chachacha, K Car, Heydealer и аукционы для дилеров. Кто там продаёт, как смотреть и с чем работать.',
  },
  crumb: 'Где искать машины в Корее',
  eyebrow: 'Корея · площадки',
  h1: 'Где искать машины в Корее: Encar, KB Chachacha, K Car и другие',
  lead: 'Encar — самая известная, но не единственная корейская площадка подержанных машин. Разберём главные: кто на них продаёт, чем они отличаются и с какой удобнее работать, если вы везёте машины клиентам.',
  sitesTitle: 'Главные площадки',
  whoLabel: 'Кто продаёт', tipLabel: 'Совет', kokYes: 'KOK читает ссылки', kokNo: 'KOK пока не читает',
  sites: [
    {name: 'Encar', url: URLS.encar, host: 'encar.com', kok: true,
      what: 'Крупнейшая площадка подержанных машин в Корее — больше всего объявлений и самая подробная история машины.',
      who: 'Дилеры и частники.',
      tip: 'Смотрите историю страховых случаев и лист техосмотра — словарь полей в нашей статье «Encar на русском».'},
    {name: 'KB Chachacha', url: URLS.kb, host: 'kbchachacha.com', kok: false,
      what: 'Площадка подержанных машин финансовой группы KB (KB Capital). Вторая по известности после Encar.',
      who: 'В основном дилеры.',
      tip: 'Полезна, чтобы сравнить цены на ту же модель: выбор другой, чем на Encar.'},
    {name: 'K Car', url: URLS.kcar, host: 'kcar.com', kok: false,
      what: 'Крупная сеть, которая продаёт подержанные машины напрямую: машины принадлежат самой компании (직영), а не частным продавцам.',
      who: 'Сама компания.',
      tip: 'Удобна, когда нужен один ответственный продавец, а не частник или мелкий дилер.'},
    {name: 'Heydealer', url: URLS.heydealer, host: 'heydealer.com', kok: false,
      what: 'Приложение, где владельцы продают машины дилерам: дилеры делают ставки.',
      who: 'Владельцы продают, покупают дилеры.',
      tip: 'Это источник машин для дилеров, а не витрина для покупателя.'},
    {name: 'Аукционы для дилеров', url: '', host: 'Hyundai Glovis, Lotte', kok: false,
      what: 'Оптовые автоаукционы, куда сдают машины лизинговые и прокатные компании и дилеры.',
      who: 'Покупают зарегистрированные дилеры и экспортёры.',
      tip: 'Напрямую туда не попасть — работают через корейского экспортёра.'},
  ],
  howTitle: 'Как работать, если вы везёте машины клиентам',
  how: [
    'Ищите на Encar: там больше всего машин и самая подробная история. Остальные площадки — чтобы сравнить цену.',
    'Одну и ту же машину дилер иногда выставляет на нескольких площадках — сверяйте по госномеру (차량번호).',
    'Цены везде в 만원 — десятках тысяч вон: «2 350만원» — это 23 500 000 вон.',
    'Купить напрямую из-за границы обычно сложно: выкупает, проверяет и оформляет экспорт корейский посредник или экспортёр.',
    'Клиенту показывайте не скриншот на корейском, а готовый пост или КП на его языке.',
  ],
  kokTitle: 'Нашли машину — сделайте пост для клиента',
  kokText: 'Вставьте ссылку Encar в KOK — он заберёт фото и характеристики и соберёт карусель для Instagram, ролик для Reels и КП в PDF с вашим логотипом.',
  kokCta: 'Попробовать бесплатно',
  faq: [
    {q: 'Какая площадка подержанных машин в Корее самая большая?', a: 'Encar: на нём больше всего объявлений от дилеров и частников и самая подробная история машины. KB Chachacha и K Car — следующие по известности.'},
    {q: 'Чем K Car отличается от Encar?', a: 'Encar — площадка объявлений, там продают дилеры и частники. K Car продаёт машины, которые принадлежат самой компании.'},
    {q: 'Можно ли купить машину на корейском аукционе?', a: 'Оптовые аукционы (Hyundai Glovis, Lotte) открыты для зарегистрированных дилеров и экспортёров. Из-за границы покупают через корейского экспортёра.'},
    {q: 'С какими площадками работает KOK?', a: 'KOK собирает рекламу по ссылкам Encar, che168 (Китай) и Carsensor (Япония). Ссылки KB Chachacha, K Car и Heydealer он пока не читает.'},
  ],
};

const EN: CarSites = {
  seo: {
    title: 'Where to find used cars in Korea: Encar, KB Chachacha, K Car | KOK',
    description: 'Korean used car sites: Encar, KB Chachacha, K Car, Heydealer and dealer auctions. Who sells there, how to browse and which one to work with.',
  },
  crumb: 'Used car sites in Korea',
  eyebrow: 'Korea · car sites',
  h1: 'Where to find used cars in Korea: Encar, KB Chachacha, K Car and more',
  lead: 'Encar is the best-known Korean used car site, but not the only one. Here are the main ones: who sells there, how they differ and which is easier to work with if you export cars to clients.',
  sitesTitle: 'The main sites',
  whoLabel: 'Who sells', tipLabel: 'Tip', kokYes: 'KOK reads links', kokNo: 'KOK does not read links yet',
  sites: [
    {name: 'Encar', url: URLS.encar, host: 'encar.com', kok: true,
      what: 'The largest used car marketplace in Korea — the most listings and the most detailed car history.',
      who: 'Dealers and private sellers.',
      tip: 'Check the insurance history and the inspection sheet — see the glossary in our article «Encar in English».'},
    {name: 'KB Chachacha', url: URLS.kb, host: 'kbchachacha.com', kok: false,
      what: 'The used car platform of KB Financial Group (KB Capital). The second best-known after Encar.',
      who: 'Mostly dealers.',
      tip: 'Useful to compare prices for the same model: the stock differs from Encar.'},
    {name: 'K Car', url: URLS.kcar, host: 'kcar.com', kok: false,
      what: 'A large chain that sells used cars directly: the cars belong to the company itself (직영), not to private sellers.',
      who: 'The company itself.',
      tip: 'Handy when you want one accountable seller rather than a private person or a small dealer.'},
    {name: 'Heydealer', url: URLS.heydealer, host: 'heydealer.com', kok: false,
      what: 'An app where owners sell their cars to dealers who bid on them.',
      who: 'Owners sell, dealers buy.',
      tip: 'A source of cars for dealers, not a showroom for buyers.'},
    {name: 'Dealer auctions', url: '', host: 'Hyundai Glovis, Lotte', kok: false,
      what: 'Wholesale car auctions where leasing and rental companies and dealers sell cars.',
      who: 'Registered dealers and exporters buy.',
      tip: 'You cannot join directly from abroad — buy through a Korean exporter.'},
  ],
  howTitle: 'How to work if you ship cars to clients',
  how: [
    'Search on Encar: it has the most cars and the most detailed history. Use the other sites to compare prices.',
    'A dealer sometimes lists the same car on several sites — match it by the plate number (차량번호).',
    'Prices are in 만원 everywhere — tens of thousands of won: «2,350만원» is 23,500,000 won.',
    'Buying directly from abroad is usually hard: a Korean agent or exporter buys, inspects and handles the export.',
    'Show your client a ready post or quotation in their language, not a Korean screenshot.',
  ],
  kokTitle: 'Found a car? Make a post for your client',
  kokText: 'Paste the Encar link into KOK — it pulls the photos and specs and builds an Instagram carousel, a Reels video and a PDF quotation with your logo.',
  kokCta: 'Try it free',
  faq: [
    {q: 'What is the biggest used car site in Korea?', a: 'Encar: it has the most listings from dealers and private sellers and the most detailed car history. KB Chachacha and K Car are the next best-known.'},
    {q: 'How is K Car different from Encar?', a: 'Encar is a listings marketplace where dealers and private sellers sell. K Car sells cars owned by the company itself.'},
    {q: 'Can I buy a car at a Korean auction?', a: 'Wholesale auctions (Hyundai Glovis, Lotte) are open to registered dealers and exporters. From abroad you buy through a Korean exporter.'},
    {q: 'Which sites does KOK work with?', a: 'KOK builds ads from Encar, che168 (China) and Carsensor (Japan) links. It does not read KB Chachacha, K Car or Heydealer links yet.'},
  ],
};

const SQ: CarSites = {
  seo: {
    title: 'Ku të gjeni makina në Kore: Encar, KB Chachacha, K Car | KOK',
    description: 'Faqet koreane të makinave të përdorura: Encar, KB Chachacha, K Car, Heydealer dhe ankandet për tregtarë. Kush shet, si të kërkoni dhe me cilën të punoni.',
  },
  crumb: 'Faqet e makinave në Kore',
  eyebrow: 'Koreja · faqet',
  h1: 'Ku të gjeni makina në Kore: Encar, KB Chachacha, K Car dhe të tjera',
  lead: 'Encar është faqja koreane më e njohur e makinave të përdorura, por jo e vetmja. Ja kryesoret: kush shet atje, si ndryshojnë dhe me cilën punohet më lehtë nëse u sillni makina klientëve.',
  sitesTitle: 'Faqet kryesore',
  whoLabel: 'Kush shet', tipLabel: 'Këshillë', kokYes: 'KOK i lexon linqet', kokNo: 'KOK ende nuk i lexon',
  sites: [
    {name: 'Encar', url: URLS.encar, host: 'encar.com', kok: true,
      what: 'Tregu më i madh i makinave të përdorura në Kore — më shumë njoftime dhe historia më e detajuar e makinës.',
      who: 'Tregtarë dhe privatë.',
      tip: 'Shikoni historinë e sigurimit dhe fletën e kontrollit — fjalorthi është në artikullin tonë «Encar në shqip».'},
    {name: 'KB Chachacha', url: URLS.kb, host: 'kbchachacha.com', kok: false,
      what: 'Platforma e makinave të përdorura e grupit financiar KB (KB Capital). E dyta më e njohur pas Encar.',
      who: 'Kryesisht tregtarë.',
      tip: 'E dobishme për të krahasuar çmimet e të njëjtit model: zgjedhja ndryshon nga Encar.'},
    {name: 'K Car', url: URLS.kcar, host: 'kcar.com', kok: false,
      what: 'Rrjet i madh që shet makina të përdorura drejtpërdrejt: makinat janë të vetë kompanisë (직영), jo të privatëve.',
      who: 'Vetë kompania.',
      tip: 'E përshtatshme kur doni një shitës përgjegjës, jo privat apo tregtar të vogël.'},
    {name: 'Heydealer', url: URLS.heydealer, host: 'heydealer.com', kok: false,
      what: 'Aplikacion ku pronarët ua shesin makinat tregtarëve, që bëjnë oferta.',
      who: 'Pronarët shesin, tregtarët blejnë.',
      tip: 'Burim makinash për tregtarët, jo vitrinë për blerësin.'},
    {name: 'Ankandet për tregtarë', url: '', host: 'Hyundai Glovis, Lotte', kok: false,
      what: 'Ankande me shumicë ku kompanitë e lizingut, të qirasë dhe tregtarët shesin makina.',
      who: 'Blejnë tregtarë dhe eksportues të regjistruar.',
      tip: 'Nga jashtë nuk hyhet drejtpërdrejt — blihet përmes eksportuesit korean.'},
  ],
  howTitle: 'Si të punoni nëse u sillni makina klientëve',
  how: [
    'Kërkoni në Encar: ka më shumë makina dhe historinë më të detajuar. Faqet e tjera — për të krahasuar çmimin.',
    'Tregtari ndonjëherë e vendos të njëjtën makinë në disa faqe — krahasojeni me targën (차량번호).',
    'Çmimet kudo janë në 만원 — dhjetëra mijë won: «2 350만원» janë 23 500 000 won.',
    'Blerja direkt nga jashtë zakonisht është e vështirë: e blen, e kontrollon dhe e eksporton ndërmjetësi ose eksportuesi korean.',
    'Klientit tregojini postim ose ofertë të gatshme në gjuhën e tij, jo pamje ekrani në koreanisht.',
  ],
  kokTitle: 'E gjetët makinën? Bëni postimin për klientin',
  kokText: 'Ngjitni linkun e Encar në KOK — merr fotot dhe të dhënat dhe bën karusel për Instagram, video për Reels dhe ofertë në PDF me logon tuaj.',
  kokCta: 'Provoni falas',
  faq: [
    {q: 'Cila është faqja më e madhe e makinave të përdorura në Kore?', a: 'Encar: ka më shumë njoftime nga tregtarë dhe privatë dhe historinë më të detajuar të makinës. KB Chachacha dhe K Car vijnë pas saj.'},
    {q: 'Si ndryshon K Car nga Encar?', a: 'Encar është treg njoftimesh ku shesin tregtarë dhe privatë. K Car shet makina që janë të vetë kompanisë.'},
    {q: 'A mund të blej makinë në ankand korean?', a: 'Ankandet me shumicë (Hyundai Glovis, Lotte) janë të hapura për tregtarë dhe eksportues të regjistruar. Nga jashtë blihet përmes eksportuesit korean.'},
    {q: 'Me cilat faqe punon KOK?', a: 'KOK bën reklama nga linqet e Encar, che168 (Kinë) dhe Carsensor (Japoni). Linqet e KB Chachacha, K Car dhe Heydealer ende nuk i lexon.'},
  ],
};

export const CAR_SITES: Record<Lang, CarSites> = {ru: RU, en: EN, sq: SQ};
