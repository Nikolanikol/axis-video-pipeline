// Словари японских слов Carsensor → английский (и русский — у опций). Сайт только японский,
// а слайды и ролики KOK понимают английские слова словаря Encar («Automatic», «Sedan», «Black»).
// Всё здесь сверено с проходкой 12.10 (25 машин 12 марок). Нового слова нет в словаре — ядро не
// падает: марка/модель берутся из адреса каталога, комплектация — латиницей по слогам (romaji).

// ── Марки: из адреса каталога /catalog/<марка>/<модель>/ (латиница самого Carsensor) ──
// Здесь только те, у кого «как в адресе с заглавной» неверно
export const BRANDS = {
  bmw: 'BMW', 'mercedes-benz': 'Mercedes-Benz', 'mercedes_amg': 'Mercedes-AMG', amg: 'AMG', vw: 'Volkswagen',
  volkswagen: 'Volkswagen', mini: 'MINI', ds: 'DS', byd: 'BYD', gmc: 'GMC', mg: 'MG', ram: 'RAM',
  'alfa_romeo': 'Alfa Romeo', 'alfaromeo': 'Alfa Romeo', 'aston_martin': 'Aston Martin', 'astonmartin': 'Aston Martin',
  'land_rover': 'Land Rover', 'landrover': 'Land Rover', 'rolls-royce': 'Rolls-Royce', 'rollsroyce': 'Rolls-Royce',
  'bmw_alpina': 'BMW Alpina', mitsuoka: 'Mitsuoka', lexus: 'Lexus',
};

// ── Модели: слаг каталога → название. Слаг бывает с маркой впереди («lexus_ux»), с опечаткой
// («cayene»), сокращением («c_class_wgn»). Сюда — то, что правилом не исправить ──
export const MODELS = {
  cayene: 'Cayenne', c_class_wgn: 'C-Class Wagon', e_class_wgn: 'E-Class Wagon', c_class: 'C-Class',
  e_class: 'E-Class', s_class: 'S-Class', a_class: 'A-Class', b_class: 'B-Class', g_class: 'G-Class',
  delica_d_5: 'Delica D:5', delica_d_2: 'Delica D:2', mira_e_s: 'Mira e:S', mazda_3_fastback: 'MAZDA3 Fastback',
  mazda_3_sedan: 'MAZDA3 Sedan', mazda_2: 'MAZDA2', mazda_6_wagon: 'MAZDA6 Wagon', mazda_6_sedan: 'MAZDA6 Sedan',
  move_canbus: 'Move Canbus', dayz_roox: 'Dayz Roox', cx_5: 'CX-5', cx_3: 'CX-3', cx_8: 'CX-8', cx_30: 'CX-30',
  cx_60: 'CX-60', mx_5: 'MX-5', 'c-hr': 'C-HR', c_hr: 'C-HR', rav4: 'RAV4', 'n-box': 'N-BOX', n_box: 'N-BOX',
  n_wgn: 'N-WGN', n_one: 'N-ONE', n_van: 'N-VAN', 'cr-v': 'CR-V', cr_v: 'CR-V', 'hr-v': 'HR-V', 'zr-v': 'ZR-V',
  'wr-v': 'WR-V', gt_r: 'GT-R', x_trail: 'X-Trail', 'x-trail': 'X-Trail', e_power: 'e-POWER',
  golf_variant: 'Golf Variant', every_wagon: 'Every Wagon', impreza_g4: 'Impreza G4', outlander_phev: 'Outlander PHEV',
};
// Слова слага, которые пишутся заглавными целиком
const UPPER = new Set(['phev', 'amg', 'gt', 'gti', 'gts', 'rs', 'gr', 'suv', 'hv', 'ev', 'tdi', 'tsi', 'lx', 'gx', 'nx', 'rx', 'ux', 'lc', 'ls', 'is', 'es', 'rc', 'gs', 'lm', 'ct', 'sti', 'brz', 'gr86', 'id']);
const WORDS = { wgn: 'Wagon', van: 'Van', cpe: 'Coupe', conv: 'Convertible', sb: 'Sportback' };

/** Название модели по слагу каталога; марку в начале слага («lexus_ux») убираем. */
export function modelFromSlug(slug, brandSlug) {
  const s = String(slug ?? '').toLowerCase();
  if (!s) return null;
  if (MODELS[s]) return MODELS[s];
  const b = String(brandSlug ?? '').toLowerCase().replace(/-/g, '_');
  const rest = b && s.startsWith(`${b}_`) ? s.slice(b.length + 1) : s;
  if (MODELS[rest]) return MODELS[rest];
  return rest.split(/[_]+/).filter(Boolean).map(w => {
    if (WORDS[w]) return WORDS[w];
    // Короткое или с цифрой («ux», «g4», «x5», «d») — индекс модели, заглавными
    if (UPPER.has(w) || w.length <= 2 || /\d/.test(w)) return w.toUpperCase();
    return w[0].toUpperCase() + w.slice(1);
  }).join(' ');
}

export function brandFromSlug(slug) {
  const s = String(slug ?? '').toLowerCase();
  if (!s) return null;
  return BRANDS[s] ?? s.split(/[-_]+/).map(w => w[0].toUpperCase() + w.slice(1)).join(s.includes('-') ? '-' : ' ');
}

// ── Слова комплектаций (катакана → английский). Комплектация на Carsensor — смесь латиницы и
// катаканы: «2.5 ハイブリッド Z レザーパッケージ», «320d xドライブ エディション ジョイプラス».
// Длинные слова раньше коротких не нужны: разбор берёт самое длинное совпадение сам ──
export const KANA_WORDS = {
  'ハイブリッド': 'Hybrid', 'プラグインハイブリッド': 'Plug-in Hybrid', 'ディーゼル': 'Diesel', 'ターボ': 'Turbo',
  'ディーゼルターボ': 'Diesel Turbo', 'ツインターボ': 'Twin Turbo', 'ガソリン': 'Gasoline',
  'レザー': 'Leather', 'パッケージ': 'Package', 'レザーパッケージ': 'Leather Package', 'パック': 'Pack',
  'エディション': 'Edition', 'リミテッド': 'Limited', 'プレミアム': 'Premium', 'ラグジュアリー': 'Luxury',
  'スポーツ': 'Sport', 'スポーティ': 'Sporty', 'ツーリング': 'Touring', 'エレガント': 'Elegant', 'エレガンス': 'Elegance',
  'アドバンス': 'Advance', 'アドバンスト': 'Advanced', 'アバンギャルド': 'Avantgarde', 'エクスクルーシブ': 'Exclusive',
  'ブラック': 'Black', 'ホワイト': 'White', 'シルバー': 'Silver', 'レッド': 'Red', 'ブルー': 'Blue', 'グレー': 'Gray',
  'セレクション': 'Selection', 'セレクト': 'Select', 'スペシャル': 'Special', 'スマート': 'Smart', 'スタイル': 'Style',
  'カスタム': 'Custom', 'ハイウェイスター': 'Highway Star', 'ハイウエイスター': 'Highway Star', 'ライダー': 'Rider',
  'アイサイト': 'EyeSight', 'センシング': 'Sensing', 'ホンダセンシング': 'Honda Sensing', 'セーフティ': 'Safety',
  'ドライブ': 'Drive', 'プラス': 'Plus', 'ジョイ': 'Joy', 'ナビ': 'Navi', 'ナビパッケージ': 'Navi Package',
  'ロイヤル': 'Royal', 'ローデスト': 'Roadest', 'ハイルーフ': 'High Roof', 'ルーフ': 'Roof', 'ターボ車': 'Turbo',
  'メイクアップ': 'Make Up', 'アップグレード': 'Upgrade', 'ベーシック': 'Basic', 'スタンダード': 'Standard',
  'プラチナ': 'Platinum', 'プラチナム': 'Platinum', 'ゴールド': 'Gold', 'クラシック': 'Classic', 'モダン': 'Modern',
  'ティプトロニック': 'Tiptronic', 'モーション': 'Motion', 'クワトロ': 'quattro', 'エクスドライブ': 'xDrive',
  'ファストバック': 'Fastback', 'セダン': 'Sedan', 'ワゴン': 'Wagon', 'クーペ': 'Coupe', 'カブリオレ': 'Cabriolet',
  'カブリオ': 'Cabrio', 'コンバーチブル': 'Convertible', 'ロードスター': 'Roadster', 'スポーツバック': 'Sportback',
  'ツアラー': 'Tourer', 'グランツアラー': 'Gran Tourer', 'グランクーペ': 'Gran Coupe', 'ヴァリアント': 'Variant',
  'アヴァント': 'Avant', 'アバント': 'Avant', 'オールロード': 'Allroad', 'クロス': 'Cross', 'カントリー': 'Country',
  'アーバン': 'Urban', 'アクティブ': 'Active', 'ダイナミック': 'Dynamic', 'インテリジェント': 'Intelligent',
  'コンフォート': 'Comfort', 'デザイン': 'Design', 'ライン': 'Line', 'ラインナップ': 'Lineup', 'モデル': 'Model',
  'マイスター': 'Meister', 'マスター': 'Master', 'ブラックエディション': 'Black Edition', 'ブラックパール': 'Black Pearl',
  'アルティメット': 'Ultimate', 'エクシード': 'Exceed', 'エグゼクティブ': 'Executive', 'ファースト': 'First',
  'トレイル': 'Trail', 'アウトドア': 'Outdoor', 'オフロード': 'Off-road', 'アドベンチャー': 'Adventure',
  'ワイド': 'Wide', 'ロング': 'Long', 'ショート': 'Short', 'ハイ': 'High', 'ロー': 'Low', 'ミドル': 'Middle',
  'パワー': 'Power', 'ストリート': 'Street', 'グランド': 'Grand', 'グラン': 'Gran', 'ネオ': 'Neo', 'ニュー': 'New',
  'ヴィンテージ': 'Vintage', 'オリジナル': 'Original', 'シグネチャー': 'Signature', 'マット': 'Matte',
  'ボディ': 'Body', 'キット': 'Kit', 'エアロ': 'Aero', 'モデリスタ': 'Modellista', 'ヴォクシー': 'Voxy',
  'サイドリフトアップシート': 'Side Lift-up Seat', 'リフトアップシート': 'Lift-up Seat', 'リフトアップ': 'Lift-up',
  'サイド': 'Side', 'シート': 'Seat', 'ウェルキャブ': 'Welcab', '車いす': 'Wheelchair', 'スロープ': 'Slope',
  '4モーション': '4Motion', 'ジーエス': 'GS', 'ジーティー': 'GT', 'アール': 'R', 'エス': 'S', 'エックス': 'X', 'ジー': 'G',
  '後期': 'Facelift', '前期': 'Early', '特別仕様車': 'Special Edition', '車': '', '仕様': '', '付': '', '4WD': '4WD', '2WD': '2WD',
};

// Катакана по слогам (Хепбёрн) — для слов, которых нет в словаре: лучше латиница, чем иероглифы
// на слайде. «ー» (долгий звук) выбрасываем: «スーパー» → «Supa», а не «Su-pa-»
const KANA = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o', カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko', サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to', ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no', ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo', ヤ: 'ya', ユ: 'yu', ヨ: 'yo', ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro', ワ: 'wa', ヲ: 'o', ン: 'n',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go', ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo', ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo', パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po', ヴ: 'vu',
  ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o', ャ: 'ya', ュ: 'yu', ョ: 'yo',
};
const DIGRAPH = {
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo', シャ: 'sha', シュ: 'shu', ショ: 'sho', チャ: 'cha', チュ: 'chu', チョ: 'cho', ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo', ミャ: 'mya', ミュ: 'myu', ミョ: 'myo', リャ: 'rya', リュ: 'ryu', リョ: 'ryo', ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  ジャ: 'ja', ジュ: 'ju', ジョ: 'jo', ビャ: 'bya', ビュ: 'byu', ビョ: 'byo', ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo', ティ: 'ti', ディ: 'di', トゥ: 'tu', ドゥ: 'du', ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo', シェ: 'she', ジェ: 'je', チェ: 'che', デュ: 'dyu', テュ: 'tyu',
};
export function romaji(kana) {
  let out = '';
  const s = String(kana);
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (DIGRAPH[two]) { out += DIGRAPH[two]; i++; continue; }
    const ch = s[i];
    if (ch === 'ッ') { const next = DIGRAPH[s.slice(i + 1, i + 3)] ?? KANA[s[i + 1]]; if (next) out += next[0]; continue; }
    if (ch === 'ー' || ch === '・') continue;
    out += KANA[ch] ?? ch;
  }
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

// ── Значения таблицы характеристик → слова словаря слайдов (как у Encar) ──
export const BODY = {
  'セダン': 'Sedan', 'ハッチバック': 'Hatchback', 'クロカン・SUV': 'SUV', 'SUV・クロカン': 'SUV', 'ミニバン': 'MiniVan',
  'ステーションワゴン': 'Wagon', 'クーペ': 'Coupe', 'オープン': 'Convertible', 'コンパクトカー': 'Hatchback',
  '軽自動車': 'Kei Car', 'ピックアップトラック': 'Pickup Truck', 'トラック': 'Truck', 'キャンピングカー': 'Camper',
  'ワンボックス': 'Van', 'バス': 'Bus', '福祉車両': 'Accessible Vehicle',
};
// エンジン種別 (тип двигателя) надёжнее 使用燃料 (сорт топлива: «レギュラー», «ハイオク» — оба бензин)
export const FUEL = {
  'ガソリン': 'Gasoline', 'ディーゼル': 'Diesel', 'ハイブリッド': 'Hybrid', 'プラグインハイブリッド': 'Hybrid',
  '電気': 'Electric', 'EV': 'Electric', '電気自動車（EV）': 'Electric', 'ロータリー': 'Gasoline', 'LPG': 'LPG',
  'クリーンディーゼル': 'Diesel', '水素': 'Hydrogen', '燃料電池': 'Hydrogen',
};
export const FUEL_GRADE = { 'レギュラー': 'Gasoline', 'ハイオク': 'Gasoline', '軽油': 'Diesel', '電気': 'Electric' };

// Цвет: у Carsensor заводское название («プレシャスブラックパール», «ソウルレッドプレミアムメタリック:41V») —
// ищем основной цвет по слову внутри. Порядок важен: «ブラックパール» — чёрный, а не «перламутр»
const COLOR_WORDS = [
  ['ブラック', 'Black'], ['黒', 'Black'], ['ホワイト', 'White'], ['白', 'White'], ['パール', 'White'],
  ['シルバー', 'Silver'], ['銀', 'Silver'], ['グレー', 'Gray'], ['グレイ', 'Gray'], ['ガンメタ', 'Gray'], ['灰', 'Gray'],
  ['レッド', 'Red'], ['赤', 'Red'], ['ワイン', 'Red'], ['ブルー', 'Blue'], ['青', 'Blue'], ['紺', 'Blue'], ['ネイビー', 'Blue'],
  ['グリーン', 'Green'], ['緑', 'Green'], ['ミント', 'Green'], ['カーキ', 'Green'], ['ブラウン', 'Brown'], ['茶', 'Brown'],
  ['ベージュ', 'Beige'], ['イエロー', 'Yellow'], ['黄', 'Yellow'], ['ゴールド', 'Gold'], ['金', 'Gold'], ['オレンジ', 'Orange'],
  ['シトロン', 'Yellow'], ['レモン', 'Yellow'], ['パープル', 'Purple'], ['紫', 'Purple'], ['ピンク', 'Pink'],
];
export function baseColor(ja) {
  const s = String(ja ?? '');
  if (!s) return null;
  // Первое по положению в строке, а не по списку: «パールホワイトIII/ファインミントM» — белый
  let best = null;
  for (const [w, en] of COLOR_WORDS) {
    const i = s.indexOf(w);
    if (i >= 0 && (!best || i < best.i || (i === best.i && w.length > best.len))) best = { i, en, len: w.length };
  }
  // «パール» в начале и за ней цвет («パールホワイト») — берём цвет после неё
  if (best?.en === 'White' && s.startsWith('パール')) {
    const after = baseColor(s.slice(3));
    if (after) return after;
  }
  return best?.en ?? null;
}

// ── Префектуры: город машины → точка отправления в маршруте ролика ──
export const PREFECTURES = {
  北海道: 'Hokkaido', 青森: 'Aomori', 岩手: 'Iwate', 宮城: 'Miyagi', 秋田: 'Akita', 山形: 'Yamagata', 福島: 'Fukushima',
  茨城: 'Ibaraki', 栃木: 'Tochigi', 群馬: 'Gunma', 埼玉: 'Saitama', 千葉: 'Chiba', 東京: 'Tokyo', 神奈川: 'Kanagawa',
  新潟: 'Niigata', 富山: 'Toyama', 石川: 'Ishikawa', 福井: 'Fukui', 山梨: 'Yamanashi', 長野: 'Nagano', 岐阜: 'Gifu',
  静岡: 'Shizuoka', 愛知: 'Aichi', 三重: 'Mie', 滋賀: 'Shiga', 京都: 'Kyoto', 大阪: 'Osaka', 兵庫: 'Hyogo', 奈良: 'Nara',
  和歌山: 'Wakayama', 鳥取: 'Tottori', 島根: 'Shimane', 岡山: 'Okayama', 広島: 'Hiroshima', 山口: 'Yamaguchi',
  徳島: 'Tokushima', 香川: 'Kagawa', 愛媛: 'Ehime', 高知: 'Kochi', 福岡: 'Fukuoka', 佐賀: 'Saga', 長崎: 'Nagasaki',
  熊本: 'Kumamoto', 大分: 'Oita', 宮崎: 'Miyazaki', 鹿児島: 'Kagoshima', 沖縄: 'Okinawa',
};
export function prefectureEn(ja) {
  // «北海道» — целиком (без «道» вышло бы «北海»), остальные — без «都/府/県»
  const s = String(ja ?? '');
  return PREFECTURES[s] ?? PREFECTURES[s.replace(/[都府県]$/, '')] ?? null;
}

// ── Роли фото. У каждого кадра Carsensor есть подпись дилера (data-categoryname) — это его
// собственная разметка, не наша догадка. [ракурс, категория контракта, годится для рекламы] ──
export const PHOTO_ROLES = {
  '左斜前': ['front-34-left', 'exterior', true], '右斜前': ['front-34-right', 'exterior', true], '正面': ['front', 'exterior', true],
  '後': ['rear', 'exterior', true], '左斜後': ['rear-34-left', 'exterior', true], '右斜後': ['rear-34-right', 'exterior', true],
  '左': ['side-left', 'exterior', true], '右': ['side-right', 'exterior', true], 'ルーフ': ['roof', 'exterior', true],
  'ライト・ランプ': ['headlight', 'detail', true], 'タイヤ・ホイール': ['wheel', 'detail', true], 'ミラー': ['mirror', 'detail', true],
  'ドアノブ': ['door-handle', 'detail', false], '排気口': ['exhaust', 'detail', true], 'トランク': ['trunk', 'detail', true],
  'インパネ全体': ['dashboard', 'interior', true], '運転席': ['front-seats', 'interior', true], '助手席': ['passenger-seat', 'interior', true],
  '後部座席': ['rear-seats', 'interior', true], 'シートアレンジ': ['seat-arrangement', 'interior', true], '天井': ['ceiling', 'interior', true],
  'カーナビ': ['screen', 'interior', true], 'スピードメーター': ['meter', 'interior', true], 'ハンドル': ['steering', 'interior', true],
  'シフトレバー': ['gear', 'interior', true], 'エアコン吹き出し': ['vents', 'interior', false], '運転席操作部': ['controls', 'interior', false],
  '窓操作部': ['window-controls', 'interior', false], '後部座席操作部': ['rear-controls', 'interior', false],
  'ドリンクホルダー': ['cup-holder', 'interior', false], 'バックミラー': ['rear-view-mirror', 'interior', false],
  'グローブボックス': ['glovebox', 'interior', false], 'フロアマット': ['floor-mat', 'interior', false], 'アクセルブレーキ': ['pedals', 'interior', false],
  'ETC': ['etc', 'interior', false], 'ドライブレコーダー': ['dashcam', 'interior', false],
  'エンジンルーム': ['engine', 'engine', false], '下': ['underbody', 'underbody', false],
  // Не машина или не для рекламы: баннеры дилера, ключи и коврики, повреждения, витрина магазина,
  // кредит и гарантия. «未設定»/«その他» — дилер подпись не поставил: там и машина, и баннеры
  '付属品': ['accessories', 'detail', false], 'ダメージ・汚れ': ['damage', 'detail', false],
  '販促用画像': ['promo', 'document', false], '店舗': ['shop', 'document', false], 'ローン': ['loan', 'document', false],
  '保証': ['warranty', 'document', false], '未設定': [null, 'unknown', false], 'その他': [null, 'unknown', false],
};

// ── Опции: 102 пункта в пяти группах. Простые — словарём; составные («エアバッグ：運転席/助手席/
// サイド/カーテン», «カメラ：フロント/サイド/バック») — по частям, «－» в части значит «нет» ──
export const OPTION_GROUPS = {
  '安全装備': 'safety', '快適装備': 'comfort', 'インテリア': 'interior', 'エクステリア': 'exterior', '福祉車両装備': 'accessibility',
};
// [en, ru]; английский — словами, которые уже знает словарь слайдов KOK, где это возможно
export const OPTIONS = {
  'パワステ': ['Power Steering', 'Усилитель руля'], 'ABS': ['ABS', 'ABS'], 'サポカー': ['Safety Support Car', 'Пакет помощи водителю'],
  '衝突被害軽減ブレーキ': ['Automatic Emergency Braking', 'Автоматическое экстренное торможение'],
  'アダプティブクルーズコントロール': ['Adaptive Cruise Control', 'Адаптивный круиз-контроль'],
  'クルーズコントロール': ['Cruise Control', 'Круиз-контроль'], 'レーンキープアシスト': ['Lane Keeping Assist', 'Удержание в полосе'],
  'パーキングアシスト': ['Parking Assist', 'Помощь при парковке'],
  'アクセル踏み間違い（誤発進）防止装置': ['Pedal Misapplication Prevention', 'Защита от ошибочного нажатия газа'],
  'アクセル踏み間違い(誤発進)防止装置': ['Pedal Misapplication Prevention', 'Защита от ошибочного нажатия газа'],
  '障害物センサー': ['Parking Sensors', 'Парктроники'], '頸部衝撃緩和ヘッドレスト': ['Whiplash Protection Headrests', 'Активные подголовники'],
  '全周囲カメラ': ['360° Camera', 'Камеры кругового обзора'], '横滑り防止装置': ['Stability Control', 'Система стабилизации'],
  'ヒルディセントコントロール': ['Hill Descent Control', 'Помощь при спуске'], 'アイドリングストップ': ['Start/Stop', 'Старт-стоп'],
  '盗難防止装置': ['Immobilizer', 'Иммобилайзер'], 'オートマチックハイビーム': ['Auto High Beam', 'Автоматический дальний свет'],
  '過給器設定モデル': ['Turbocharged', 'Турбонаддув'], 'エアコン・クーラー': ['Air Conditioning', 'Кондиционер'],
  'Wエアコン': ['Rear Air Conditioning', 'Задний кондиционер'], 'ミュージックプレイヤー接続可': ['Music Player Connection', 'Подключение плеера'],
  'ETC': ['ETC Toll Unit', 'Транспондер ETC'], 'エアサスペンション': ['Air Suspension', 'Пневмоподвеска'],
  '1500W給電': ['1500W Power Outlet', 'Розетка 1500 Вт'], 'ドライブレコーダー': ['Dashcam', 'Видеорегистратор'],
  'ディスプレイオーディオ(Apple CarPlay、Android Autoなど)': ['Apple CarPlay / Android Auto', 'Apple CarPlay / Android Auto'],
  '寒冷地仕様': ['Cold Climate Package', 'Пакет для холодного климата'], 'キーレス': ['Keyless Entry', 'Бесключевой доступ'],
  'スマートキー': ['Smart Key', 'Смарт-ключ'], 'パワーウインドウ': ['Power Windows', 'Электростеклоподъёмники'],
  '後席モニター': ['Rear Seat Monitor', 'Монитор для задних пассажиров'], 'ベンチシート': ['Bench Seat', 'Диван спереди'],
  '3列シート': ['Third Row Seats', 'Третий ряд сидений'], 'ウォークスルー': ['Walk-through Cabin', 'Проход между сиденьями'],
  '電動シート': ['Power Seats', 'Электрорегулировка сидений'], 'シートエアコン': ['Ventilated Seats', 'Вентиляция сидений'],
  'シートヒーター': ['Heated Seats', 'Подогрев сидений'], 'フルフラットシート': ['Full-flat Seats', 'Раскладывающиеся в кровать сиденья'],
  'オットマン': ['Ottoman Seats', 'Подставки для ног'], '本革シート': ['Leather Seats', 'Кожаный салон'],
  'フロントフォグランプ': ['Front Fog Lights', 'Противотуманные фары'], 'サンルーフ・ガラスルーフ': ['Sunroof', 'Люк / панорамная крыша'],
  'ルーフレール': ['Roof Rails', 'Рейлинги'], 'フルエアロ': ['Full Aero Kit', 'Аэродинамический обвес'],
  'アルミホイール': ['Alloy Wheels', 'Легкосплавные диски'], 'ローダウン': ['Lowered Suspension', 'Заниженная подвеска'],
  'リフトアップ': ['Lift Kit', 'Лифт-комплект'], '全塗装済': ['Fully Repainted', 'Полностью перекрашена'],
  '後席リフトアップシート': ['Rear Lift-up Seat', 'Подъёмное заднее сиденье'], '助手席リフトアップシート': ['Passenger Lift-up Seat', 'Подъёмное пассажирское сиденье'],
  '後席脱着リフトアップシート': ['Removable Rear Lift-up Seat', 'Съёмное подъёмное заднее сиденье'], '助手席回転シート': ['Swivel Passenger Seat', 'Поворотное пассажирское сиденье'],
  '後席回転スライドシート': ['Swivel Sliding Rear Seat', 'Поворотное сдвижное заднее сиденье'], 'シート電動': ['Power Seat Lift', 'Электропривод сиденья'],
  'スロープ': ['Wheelchair Ramp', 'Пандус'], '電動スロープ': ['Power Wheelchair Ramp', 'Электропандус'], 'リアリフト': ['Rear Lift', 'Задний подъёмник'],
  'サイドステップ': ['Side Step', 'Подножка'], '手すり': ['Grab Handles', 'Поручни'],
  '坂道発進補助装置': ['Hill Start Assist', 'Помощь при старте в гору'], 'クラッチレス': ['Clutchless', 'Без сцепления'],
};
// Составные: «префикс：часть/часть/…». Для каждой части — [en, ru], «－» — части нет
export const COMPOSITE = {
  'エアバッグ': { en: 'Airbags', ru: 'Подушки безопасности', parts: { '運転席': ['driver', 'водителя'], '助手席': ['passenger', 'пассажира'], 'サイド': ['side', 'боковые'], 'カーテン': ['curtain', 'шторки'] } },
  'カメラ': { en: 'Camera', ru: 'Камеры', parts: { 'フロント': ['front', 'передняя'], 'サイド': ['side', 'боковые'], 'バック': ['rear', 'задняя'] } },
  'モニター': { en: 'Monitoring', ru: 'Контроль', parts: { 'ブラインドスポット': ['blind spot', 'слепых зон'], 'リアトラフィック': ['rear cross traffic', 'сзади при выезде'] } },
  'カーナビ': { en: 'Navigation', ru: 'Навигация', parts: { 'HDD': ['HDD', 'HDD'], 'メモリー他': ['', ''], 'メモリー': ['', ''], 'DVD': ['DVD', 'DVD'], 'CD': ['CD', 'CD'] } },
  'TV': { en: 'TV', ru: 'Телевизор', parts: { 'フルセグ': ['digital', 'цифровой'], 'ワンセグ': ['mobile', 'мобильный'], 'アナログ': ['analog', 'аналоговый'] } },
  '映像': { en: 'Video', ru: 'Видео', parts: { 'DVD': ['DVD', 'DVD'], 'ブルーレイ': ['Blu-ray', 'Blu-ray'] } },
  'オーディオ': { en: 'Audio', ru: 'Аудио', parts: { 'CD': ['CD', 'CD'], 'MD': ['MD', 'MD'], 'カセット': ['cassette', 'кассеты'], 'ミュージックサーバー': ['music server', 'музыкальный сервер'] } },
  'ヘッドライト': { en: 'Headlights', ru: 'Фары', parts: { 'LED': ['LED', 'светодиодные'], 'ディスチャージド': ['Xenon', 'ксеноновые'], 'ハロゲン': ['halogen', 'галогеновые'], 'アダプティブ': ['adaptive', 'адаптивные'] } },
  'スライドドア': { en: 'Sliding Doors', ru: 'Сдвижные двери', parts: { '両側(電動)': ['both, power', 'обе, электро'], '両側(片側のみ電動)': ['both, one power', 'обе, одна электро'], '片側(電動)': ['one, power', 'одна, электро'], '両側': ['both', 'обе'], '片側': ['one', 'одна'] } },
};
// Слайды KOK уже знают эти английские слова — светодиодные фары и камеры называем так же
const COMPOSITE_EN = { 'ヘッドライト:LED': 'LED Headlights', 'ヘッドライト:ディスチャージド': 'Xenon Headlights', 'ヘッドライト:LED,アダプティブ': 'Adaptive LED Headlights' };

/** Название опции на английском и русском; null — не знаем (тогда ядро отдаёт японское как есть). */
// Ключи — в NFKC: на странице скобки и двоеточия бывают и полноширинные «（）：», и обычные
const OPTIONS_N = Object.fromEntries(Object.entries(OPTIONS).map(([k, v]) => [k.normalize('NFKC'), v]));
export function translateOption(ja) {
  const s = String(ja ?? '').normalize('NFKC').trim();
  if (OPTIONS_N[s]) return { en: OPTIONS_N[s][0], ru: OPTIONS_N[s][1] };
  const m = s.match(/^([^:]+):(.+)$/);
  if (!m) return null;
  const head = m[1].trim(), c = COMPOSITE[head];
  if (!c) return null;
  const raw = m[2].split(/[\/、,]/).map(x => x.trim()).filter(x => x && !/^[－-]+$/.test(x));
  if (!raw.length) return null;   // все части «－» — опции нет
  const key = `${head}:${raw.join(',')}`;
  // Контроль слепых зон / движения сзади — по-русски составным «Контроль (…)» не скажешь
  if (head === 'モニター') {
    const bs = raw.includes('ブラインドスポット'), rt = raw.includes('リアトラフィック');
    return bs && rt ? { en: 'Blind Spot & Rear Cross Traffic Monitor', ru: 'Контроль слепых зон и движения сзади' }
      : bs ? { en: 'Blind Spot Monitor', ru: 'Контроль слепых зон' } : { en: 'Rear Cross Traffic Alert', ru: 'Контроль движения сзади' };
  }
  if (COMPOSITE_EN[key]) return { en: COMPOSITE_EN[key], ru: `${c.ru}: ${raw.map(p => c.parts[p]?.[1] ?? p).filter(Boolean).join(', ')}` };
  const en = raw.map(p => c.parts[p]?.[0] ?? p).filter(Boolean), ru = raw.map(p => c.parts[p]?.[1] ?? p).filter(Boolean);
  return { en: en.length ? `${c.en} (${en.join(', ')})` : c.en, ru: ru.length ? `${c.ru} (${ru.join(', ')})` : c.ru };
}
