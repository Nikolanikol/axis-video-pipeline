// Статья Encar на английском и албанском (18.11, владелец: «албанскую и английскую статью»).
// Почему эти языки: по Google Trends Encar больше всего ищут Косово и Албания, а Грузия, Монголия,
// Азербайджан и остальные — по-английски («encar english», docs/projects/site/wordstat.md, «Мир: Google»).
// Смысл тот же, что у русской (lib/platforms.ts): сначала польза, потом KOK. Курсов валют нет.
// Албанский перед выкладкой вычитывает носитель — план, «Критерии приёмки».
import type {Platform} from './platforms';

const urlsFor = (site: string, card: string, number: string, note1: string, note2: string, title1: string, title2: string) => [
  {title: title1, note: note1, parts: [
    {text: 'https://'}, {text: 'fem.encar.com', label: site}, {text: '/cars/detail/', label: card}, {text: '41630924', label: number, key: true},
  ]},
  {title: title2, note: note2, parts: [
    {text: 'https://'}, {text: 'www.encar.com', label: site}, {text: '/dc/dc_cardetailview.do?carid=', label: card}, {text: '41630924', label: number, key: true},
  ]},
];

export const ENCAR_EN: Platform = {
  id: 'encar',
  page: '/encar/',
  name: 'Encar',
  seo: {
    title: 'Encar in English: how to read a Korean car listing | KOK',
    description: 'Encar listing glossary in English: price in 만원, mileage, accident and insurance history. Paste the link — get a carousel, a video and a quotation.',
  },
  eyebrow: 'Encar · Korea',
  h1: 'Encar in English: how to read a listing',
  lead: 'Encar is the largest used car marketplace in Korea, and the site is in Korean. Here is what the listing fields mean, how not to misread the price by ten thousand times — and how to turn a link into a ready post in a minute.',
  about: [
    'Both dealers and private sellers list cars on Encar. Every car has its own card with its own number — that is how the seller finds it, and how KOK finds it too.',
    'Browser translation helps, but not everywhere: the price in 만원 and the abbreviations in the car history are easy to misread. So below is a glossary of the fields a buyer needs.',
  ],
  urls: urlsFor('Encar site', 'car card', 'car number', 'how the card opens today', 'found in old links and bookmarks', 'New format — phone and desktop', 'Old format'),
  urlTip: 'The car number is the same in both formats. Links with extra text after the number (?pageid=…) work too — KOK understands any format.',
  open: [
    {title: 'Browser translation', text: 'Chrome offers to translate the page. It is enough to get the idea, but check the price and mileage with the glossary below.'},
    {title: 'The glossary on this page', text: 'The key fields of the card — in Korean and in English, with a hint on what to check.'},
    {title: 'Paste the link into KOK', text: 'KOK pulls the photos and specs from the listing and builds a carousel for Instagram, a Reels video and a post caption in your language.'},
  ],
  terms: {
    title: 'Encar listing glossary',
    sub: 'Fields of the car card and history — how they are named on the site and what they mean.',
    rows: [
      {orig: '가격', ru: 'Price', note: 'In 만원 — tens of thousands of won, see below'},
      {orig: '연식', ru: 'Year', note: 'Often year and month: «22/03식» — March 2022'},
      {orig: '주행거리', ru: 'Mileage', note: 'In kilometres, as is'},
      {orig: '연료', ru: 'Fuel', note: '가솔린 — petrol, 디젤 — diesel, 하이브리드 — hybrid, 전기 — electric, LPG — gas'},
      {orig: '변속기', ru: 'Gearbox', note: '오토 — automatic, 수동 — manual'},
      {orig: '색상', ru: 'Colour', note: ''},
      {orig: '배기량', ru: 'Engine size', note: 'In cubic centimetres (cc)'},
      {orig: '차량번호', ru: 'Plate number', note: 'The seller finds the car in his records by it'},
      {orig: '무사고', ru: 'No accidents', note: 'The seller’s words — check the history and the inspection sheet'},
      {orig: '보험이력', ru: 'Insurance history', note: 'How many claims and for what amounts'},
      {orig: '내차피해 / 타차가해', ru: 'Damage to this car / to another car', note: 'The first matters more: this car was repaired'},
      {orig: '소유자변경', ru: 'Owner changes', note: 'How many times the car was resold'},
      {orig: '성능·상태점검기록부', ru: 'Inspection sheet at sale', note: 'Mandatory check: body, repaints, replaced parts'},
      {orig: '침수', ru: 'Flooded', note: 'A flood car — usually a reason to walk away'},
      {orig: '렌트 / 리스', ru: 'Rental / leasing', note: 'Ex-rental or ex-leasing car'},
      {orig: 'X (교환) / W (판금·용접)', ru: 'Marks on the body diagram', note: 'On the inspection sheet: X — part replaced, W — panel beating or welding'},
    ],
  },
  extras: {
    title: 'Options, body and colour',
    sub: 'Options on an Encar card are a list of icons and words. The most common:',
    groups: [
      {title: 'Options', rows: [
        {orig: '선루프 / 파노라마 선루프', ru: 'Sunroof / panoramic roof'},
        {orig: '내비게이션', ru: 'Navigation'},
        {orig: '후방 카메라 / 어라운드뷰', ru: 'Rear camera / 360° view'},
        {orig: '열선시트 / 통풍시트', ru: 'Heated / ventilated seats'},
        {orig: '가죽시트', ru: 'Leather seats'},
        {orig: '스마트키', ru: 'Keyless entry'},
        {orig: '헤드업 디스플레이 (HUD)', ru: 'Head-up display'},
        {orig: '크루즈 컨트롤', ru: 'Cruise control'},
      ]},
      {title: 'Body', rows: [
        {orig: '세단', ru: 'Sedan'}, {orig: 'SUV', ru: 'SUV, crossover'}, {orig: '해치백', ru: 'Hatchback'},
        {orig: '쿠페', ru: 'Coupe'}, {orig: '승합', ru: 'Van'}, {orig: '화물', ru: 'Truck'},
      ]},
      {title: 'Colour', rows: [
        {orig: '흰색', ru: 'White'}, {orig: '진주색', ru: 'Pearl white'}, {orig: '검정색', ru: 'Black'},
        {orig: '회색 / 쥐색', ru: 'Grey / dark grey'}, {orig: '은색', ru: 'Silver'}, {orig: '파란색', ru: 'Blue'}, {orig: '빨간색', ru: 'Red'},
      ]},
    ],
  },
  example: {
    title: 'Reading a listing step by step',
    sub: 'A made-up example — this is how the spec line on a card looks, and what it means.',
    lines: [
      {field: '현대 그랜저 IG', value: 'Make and model', read: 'Hyundai Grandeur, IG generation'},
      {field: '22/03식', value: '연식', read: 'March 2022'},
      {field: '45,000km', value: '주행거리', read: '45,000 km'},
      {field: '가솔린 · 오토', value: '연료 · 변속기', read: 'Petrol, automatic'},
      {field: '2,850만원', value: '가격', read: '28,500,000 won — not 2,850. Then convert at the day’s rate', warn: true},
      {field: '보험이력 2건', value: '보험이력', read: 'Two insurance claims — open them and check which car and what amounts'},
    ],
  },
  numbers: {
    title: 'Price and mileage: where people get it wrong',
    items: [
      {title: 'Price is in 만원', text: '만원 is 10,000 won. «2,350만원» on the card is 23,500,000 won, not 2,350. Multiply by 10,000 and convert at the day’s rate.'},
      {title: 'The price is for the car only', text: 'Shipping, customs and agent fees are not included — they are calculated separately.'},
      {title: 'Mileage is in kilometres', text: '주행거리 is shown as is: «45,000km» means forty-five thousand kilometres.'},
    ],
  },
  checks: {
    title: 'What to check before calling the seller',
    items: [
      'Insurance history (보험이력): how many claims for damage to this car, and the amounts.',
      'Inspection sheet (성능·상태점검기록부): which body parts were repainted or replaced.',
      'No flood mark (침수), and whether it was a rental car (렌트).',
      'How many owners it had (소유자변경).',
      'What the price includes and what is extra: shipping, customs, fees.',
    ],
  },
  faq: [
    {q: 'Is there an English version of Encar?', a: 'The main site is in Korean. Browser translation covers most of the page, but the price in 만원 and the history abbreviations are easy to misread — check them with the glossary on this page.'},
    {q: 'How do I convert an Encar price?', a: 'The price is in 만원 — tens of thousands of won. Multiply the number on the card by 10,000: «2,350만원» is 23,500,000 won. Then convert at the day’s rate.'},
    {q: 'Where is the accident history on Encar?', a: 'In the insurance history (보험이력): number of claims and amounts, separately for damage to this car (내차피해) and to others (타차가해). Repair details are in the inspection sheet (성능·상태점검기록부).'},
    {q: 'Can I buy a car through KOK?', a: 'No. KOK does not sell cars — it is a service for those who sell them: from a listing link it makes an Instagram carousel, a video and a commercial offer.'},
    {q: 'What does KOK do with an Encar link?', a: 'It pulls the photos and specs of the car and builds a post: a carousel, a Reels and TikTok video and a PDF quotation — with your logo and contacts, in Russian, English or Albanian.'},
  ],
};

export const ENCAR_SQ: Platform = {
  id: 'encar',
  page: '/encar/',
  name: 'Encar',
  seo: {
    title: 'Encar në shqip: si të lexoni njoftimin e makinës nga Koreja | KOK',
    description: 'Fjalorth i njoftimit Encar në shqip: çmimi në 만원, kilometrat, historia e aksidenteve. Ngjitni linkun — merrni karusel, video dhe ofertë.',
  },
  eyebrow: 'Encar · Koreja',
  h1: 'Encar në shqip: si të lexoni njoftimin',
  lead: 'Encar është tregu më i madh i makinave të përdorura në Kore, dhe faqja është në koreanisht. Ja çfarë do të thonë fushat e njoftimit, si të mos gaboni çmimin dhjetë mijë herë — dhe si ta ktheni linkun në postim të gatshëm brenda një minute.',
  about: [
    'Në Encar shesin makina edhe tregtarët, edhe privatët. Çdo makinë ka kartelën e vet me numrin e vet — me të e gjen makinën shitësi, me të e gjen edhe KOK.',
    'Përkthimi i shfletuesit ndihmon, por jo kudo: çmimi në 만원 dhe shkurtimet në historinë e makinës lexohen lehtë gabim. Prandaj më poshtë është fjalorthi i fushave që i duhen blerësit.',
  ],
  urls: urlsFor('faqja Encar', 'kartela e makinës', 'numri i makinës', 'kështu hapet kartela sot', 'gjendet në linqe e faqerojtës të vjetra', 'Formati i ri — telefon dhe kompjuter', 'Formati i vjetër'),
  urlTip: 'Numri i makinës është i njëjtë në të dy formatet. Edhe linqet me tekst shtesë pas numrit (?pageid=…) punojnë — KOK e kupton çdo format.',
  open: [
    {title: 'Përkthimi në shfletues', text: 'Chrome ofron ta përkthejë faqen. Mjafton për idenë e përgjithshme, por çmimin dhe kilometrat kontrollojini me fjalorthin më poshtë.'},
    {title: 'Fjalorthi në këtë faqe', text: 'Fushat kryesore të kartelës — në koreanisht dhe në shqip, me këshillë se çfarë të kontrolloni.'},
    {title: 'Linku në KOK', text: 'KOK merr fotot dhe të dhënat nga njoftimi dhe bën karuselin për Instagram, videon për Reels dhe tekstin e postimit në gjuhën tuaj.'},
  ],
  terms: {
    title: 'Fjalorthi i njoftimit Encar',
    sub: 'Fushat e kartelës dhe të historisë së makinës — si quhen në faqe dhe çfarë do të thonë.',
    rows: [
      {orig: '가격', ru: 'Çmimi', note: 'Në 만원 — dhjetëra mijë won, shih më poshtë'},
      {orig: '연식', ru: 'Viti', note: 'Shpesh viti dhe muaji: «22/03식» — mars 2022'},
      {orig: '주행거리', ru: 'Kilometrat', note: 'Në kilometra, ashtu siç janë'},
      {orig: '연료', ru: 'Karburanti', note: '가솔린 — benzinë, 디젤 — naftë, 하이브리드 — hibrid, 전기 — elektrik, LPG — gaz'},
      {orig: '변속기', ru: 'Kambio', note: '오토 — automatike, 수동 — manuale'},
      {orig: '색상', ru: 'Ngjyra', note: ''},
      {orig: '배기량', ru: 'Motori', note: 'Në centimetra kub (cc)'},
      {orig: '차량번호', ru: 'Targa', note: 'Me të shitësi e gjen makinën në dokumentet e tij'},
      {orig: '무사고', ru: 'Pa aksident', note: 'Fjalët e shitësit — kontrollojini me historinë dhe fletën e kontrollit'},
      {orig: '보험이력', ru: 'Historia e sigurimit', note: 'Sa dëme janë paguar dhe për çfarë shumash'},
      {orig: '내차피해 / 타차가해', ru: 'Dëm në këtë makinë / në makinë tjetër', note: 'E para ka më shumë rëndësi: kjo makinë është riparuar'},
      {orig: '소유자변경', ru: 'Ndërrimi i pronarëve', note: 'Sa herë është rishitur makina'},
      {orig: '성능·상태점검기록부', ru: 'Fleta e kontrollit teknik', note: 'Kontroll i detyrueshëm: karroceria, bojatisjet, pjesët e ndërruara'},
      {orig: '침수', ru: 'E përmbytur', note: 'Makinë e përmbytur — zakonisht arsye për ta lënë'},
      {orig: '렌트 / 리스', ru: 'Me qira / lizing', note: 'Ka qenë makinë me qira ose lizing'},
      {orig: 'X (교환) / W (판금·용접)', ru: 'Shenjat në skemën e karrocerisë', note: 'Në fletën e kontrollit: X — pjesa është ndërruar, W — është drejtuar ose saldaluar'},
    ],
  },
  extras: {
    title: 'Opsionet, karroceria dhe ngjyra',
    sub: 'Opsionet në kartelën e Encar janë listë me ikona dhe fjalë. Më të shpeshtat:',
    groups: [
      {title: 'Opsionet', rows: [
        {orig: '선루프 / 파노라마 선루프', ru: 'Tavan xhami / panoramik'},
        {orig: '내비게이션', ru: 'Navigacion'},
        {orig: '후방 카메라 / 어라운드뷰', ru: 'Kamerë mbrapa / pamje 360°'},
        {orig: '열선시트 / 통풍시트', ru: 'Ndenjëse me ngrohje / ventilim'},
        {orig: '가죽시트', ru: 'Ndenjëse lëkure'},
        {orig: '스마트키', ru: 'Hyrje pa çelës'},
        {orig: '헤드업 디스플레이 (HUD)', ru: 'Ekran mbi xhamin e përparmë'},
        {orig: '크루즈 컨트롤', ru: 'Kontroll shpejtësie (cruise)'},
      ]},
      {title: 'Karroceria', rows: [
        {orig: '세단', ru: 'Sedan'}, {orig: 'SUV', ru: 'SUV, crossover'}, {orig: '해치백', ru: 'Hatchback'},
        {orig: '쿠페', ru: 'Kupe'}, {orig: '승합', ru: 'Furgon pasagjerësh'}, {orig: '화물', ru: 'Kamion'},
      ]},
      {title: 'Ngjyra', rows: [
        {orig: '흰색', ru: 'E bardhë'}, {orig: '진주색', ru: 'E bardhë perlë'}, {orig: '검정색', ru: 'E zezë'},
        {orig: '회색 / 쥐색', ru: 'Gri / gri e errët'}, {orig: '은색', ru: 'Argjendi'}, {orig: '파란색', ru: 'Blu'}, {orig: '빨간색', ru: 'E kuqe'},
      ]},
    ],
  },
  example: {
    title: 'E lexojmë njoftimin hap pas hapi',
    sub: 'Shembull i sajuar — kështu duket rreshti i të dhënave në kartelë dhe ja çfarë do të thotë.',
    lines: [
      {field: '현대 그랜저 IG', value: 'Marka dhe modeli', read: 'Hyundai Grandeur, gjenerata IG'},
      {field: '22/03식', value: '연식', read: 'Mars 2022'},
      {field: '45,000km', value: '주행거리', read: '45 000 km'},
      {field: '가솔린 · 오토', value: '연료 · 변속기', read: 'Benzinë, automatike'},
      {field: '2,850만원', value: '가격', read: '28 500 000 won — jo 2 850. Pastaj sipas kursit të ditës', warn: true},
      {field: '보험이력 2건', value: '보험이력', read: 'Dy dëme të sigurimit — hapini dhe shikoni për cilën makinë dhe për çfarë shumash'},
    ],
  },
  numbers: {
    title: 'Çmimi dhe kilometrat: ku gabohet më shpesh',
    items: [
      {title: 'Çmimi është në 만원', text: '만원 janë 10 000 won. «2 350만원» në kartelë janë 23 500 000 won, jo 2 350. Shumëzojeni me 10 000 dhe llogariteni me kursin e ditës.'},
      {title: 'Çmimi është vetëm për makinën', text: 'Transporti, dogana dhe shërbimet e ndërmjetësit nuk përfshihen — llogariten veçmas.'},
      {title: 'Kilometrat janë në km', text: '주행거리 shkruhet ashtu siç është: «45,000km» janë dyzet e pesë mijë kilometra.'},
    ],
  },
  checks: {
    title: 'Çfarë të kontrolloni para se të telefononi shitësin',
    items: [
      'Historinë e sigurimit (보험이력): sa dëme për këtë makinë dhe për çfarë shumash.',
      'Fletën e kontrollit (성능·상태점검기록부): cilat pjesë të karrocerisë janë bojatisur ose ndërruar.',
      'Që të mos ketë shenjë përmbytjeje (침수) dhe nëse ka qenë makinë me qira (렌트).',
      'Sa pronarë ka pasur (소유자변경).',
      'Çfarë përfshin çmimi dhe çfarë paguhet veçmas: transporti, dogana, shërbimet.',
    ],
  },
  faq: [
    {q: 'A ka Encar version në shqip?', a: 'Jo, faqja kryesore është në koreanisht. Shfletuesi e përkthen pjesën më të madhe, por çmimin në 만원 dhe shkurtimet e historisë kontrollojini me fjalorthin në këtë faqe.'},
    {q: 'Si ta përkthej çmimin në Encar?', a: 'Çmimi është në 만원 — dhjetëra mijë won. Shumëzojeni numrin e kartelës me 10 000: «2 350만원» janë 23 500 000 won. Pastaj llogariteni me kursin e ditës.'},
    {q: 'Ku është historia e aksidenteve në Encar?', a: 'Te historia e sigurimit (보험이력): numri i dëmeve dhe shumat, veçmas për dëmin në këtë makinë (내차피해) dhe në të tjera (타차가해). Detajet e riparimit janë në fletën e kontrollit (성능·상태점검기록부).'},
    {q: 'A mund të blej makinë përmes KOK?', a: 'Jo. KOK nuk shet makina — është shërbim për ata që i shesin: nga linku i njoftimit bën karusel për Instagram, video dhe ofertë tregtare.'},
    {q: 'Çfarë bën KOK me linkun e Encar?', a: 'Merr fotot dhe të dhënat e makinës dhe bën postimin: karusel, video për Reels dhe TikTok dhe ofertë në PDF — me logon dhe kontaktet tuaja, në shqip, anglisht ose rusisht.'},
  ],
};
