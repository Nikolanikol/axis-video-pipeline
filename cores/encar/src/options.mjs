// Опции Encar для карточки запасного маршрута (encar-api.com) — копия словарей шлюза kmotors.
//
// Зачем копия, а не названия encar-api (nameEn). Русский словарь слайдов (src/carousel/i18n/ru-values.json)
// сведён из тех же словарей kmotors по английскому слову: «Sunroof» → «Люк». У encar-api свои английские
// названия («Anti-lock brakes (ABS)» вместо «Anti-lock braking system (ABS)») — русская карусель через
// запасной маршрут вышла бы с английскими опциями. Поэтому слово — по коду, как у шлюза.
//
// Источник: ~/Desktop/recup/KMotors-1 — OPTION_EN в src/components/Catalog/CarDetail/OptionsRow/data.ts,
// RANK / SAFETY_CODES / COMFORT_CODES в src/lib/vehicleCard.ts (снято 15.11.2026). Меняются там —
// перенеси сюда, иначе карточки двух маршрутов разойдутся.

/** Код опции Encar → английское название, как у шлюза */
export const OPTION_EN = Object.freeze({
  "010": "Sunroof",
  "029": "HID headlights",
  "075": "LED headlights",
  "059": "Power tailgate",
  "080": "Ghost door closing",
  "024": "Power-folding mirrors",
  "017": "Alloy wheels",
  "062": "Roof rails",
  "082": "Heated steering wheel",
  "083": "Power-adjustable steering wheel",
  "084": "Paddle shifters",
  "031": "Steering wheel controls",
  "030": "Auto-dimming mirror (ECM)",
  "074": "Hi-Pass toll system",
  "006": "Power door locks",
  "008": "Power steering",
  "007": "Power windows",
  "026": "Driver airbag",
  "027": "Passenger airbag",
  "020": "Side airbags",
  "056": "Curtain airbags",
  "001": "Anti-lock braking system (ABS)",
  "019": "Traction control (TCS)",
  "055": "Electronic stability control (ESC)",
  "033": "Tire pressure monitoring (TPMS)",
  "088": "Lane departure warning (LDWS)",
  "002": "Electronically controlled suspension (ECS)",
  "085": "Front parking sensors",
  "032": "Rear parking sensors",
  "086": "Blind spot monitoring",
  "058": "Rear-view camera",
  "087": "360° around-view camera",
  "068": "Cruise control",
  "079": "Adaptive cruise control",
  "095": "Head-up display (HUD)",
  "094": "Electronic parking brake (EPB)",
  "023": "Automatic climate control",
  "057": "Smart key",
  "015": "Keyless entry",
  "081": "Rain sensor",
  "097": "Automatic headlights",
  "092": "Rear seat sunshade",
  "093": "Rear window sunshade",
  "005": "Navigation",
  "004": "Front AV monitor",
  "054": "Rear AV monitor",
  "096": "Bluetooth",
  "003": "CD player",
  "072": "USB port",
  "071": "AUX port",
  "014": "Leather seats",
  "021": "Power driver seat",
  "035": "Power passenger seat",
  "089": "Power rear seats",
  "022": "Heated front seats",
  "063": "Heated rear seats",
  "051": "Driver seat memory",
  "078": "Passenger seat memory",
  "034": "Ventilated driver seat",
  "077": "Ventilated passenger seat",
  "090": "Ventilated rear seats",
  "091": "Massage seat"
});

// Порядок значимости — редакторский (шлюз): редкое и дорогое первым, то, что есть у всех, — в хвост.
// Слайды берут первые несколько опций, поэтому порядок обязан совпадать со шлюзом
export const RANK = ['091', '095', '087', '079', '086', '088', '010', '090', '077', '034', '089', '092', '093', '080', '051', '078', '063', '082', '059', '014', '023', '022', '021', '035', '057', '058', '085', '032', '005', '096', '075', '029', '068', '094', '097', '081', '083', '084', '030', '024', '033', '055', '062', '017', '074', '020', '056', '026', '027', '001', '019', '002', '031', '015', '006', '007', '008', '054', '004', '003', '071', '072'];

// Деление по слайдам (шлюз): «Technology» — безопасность и электроника, «Comfort» — салон
export const SAFETY_CODES = new Set(['001', '002', '019', '020', '026', '027', '029', '032', '033', '055', '056', '058', '068', '075', '079', '081', '085', '086', '087', '088', '094', '095', '097', '003', '004', '005', '031', '054', '071', '072', '074', '084', '096']);
export const COMFORT_CODES = new Set(['006', '007', '010', '014', '015', '021', '022', '023', '024', '030', '034', '035', '051', '057', '059', '063', '077', '078', '080', '082', '083', '089', '090', '091', '092', '093']);
