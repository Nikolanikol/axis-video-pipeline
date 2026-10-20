// Семейства каруселей из пакета KOK_handoff_v1 (согласованы владельцем 19.10: шесть визуальных
// семейств, у каждого своя вёрстка шести слайдов 4:5, своя палитра и пара шрифтов). Подключаем по
// одному, после проверки глазами: готовы все шесть (20–21.10).
//
// Семейство — выбор у конкретной карусели (как preferred_style в пакете), а не у бренда: бренд
// задаёт ролики и прежние карусели, семейство — только эту карусель. Логотип и контакты — бренда.
// Палитра пакета — три цвета (фон, текст, акцент); недостающие роли темы выведены из них.
// Формат — только «Разворот» 4:5: 1:1 и 9:16 в пакете отключены до адаптации макетов.

/** @typedef {{id: string, title: string, note: string, ready: boolean, colors: {bg: string, text: string, accent: string, light: string},
 *   fonts: {head: string, body: string, url: string}, fields: Record<string, string[]>}} Family */

/** @type {Family[]} */
export const FAMILIES = [
  {
    id: 'type_drive', title: 'Type Drive', ready: true,
    note: 'Узкий крупный шрифт, вино на графите и креме',
    // light — кремовый фон экстерьера, фактов и контактов (на доске — тот же цвет, что текст)
    colors: {bg: '#191B1C', text: '#F3EEE3', accent: '#7B243D', light: '#F3EEE3'},
    fonts: {head: 'Oswald, sans-serif', body: 'Manrope, sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&display=swap'},
    fields: {exterior: ['section', 'text'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
  {
    id: 'cobalt_shift', title: 'Cobalt Shift', ready: true,
    note: 'Фото первым, синие плашки и крупные цифры',
    // light — светлый фон слайдов экстерьера, салона, цены и контактов (на доске — белые слайды)
    colors: {bg: '#111925', text: '#EDF2F4', accent: '#2455DE', light: '#F4F7FB'},
    fonts: {head: 'Oswald, sans-serif', body: '"Golos Text", sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@500;600;700&display=swap'},
    // Какие тексты слайда вёрстка показывает — только их можно править под слайдом
    fields: {exterior: ['section'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
  // ready: false — вёрстка написана, но не проверена рендером: в выборе не видна, сервер её отклоняет
  {
    id: 'pulse_grid', title: 'Pulse Grid', ready: true,
    note: 'Наклонные курсивные заголовки, вино на креме',
    colors: {bg: '#F6F2E8', text: '#111315', accent: '#81243C', light: '#F6F2E8'},
    fonts: {head: '"Exo 2", sans-serif', body: '"Golos Text", sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,800;1,800&family=Golos+Text:wght@500;600;700&display=swap'},
    fields: {exterior: ['section'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
  {
    id: 'wide_form', title: 'Wide Form', ready: true,
    note: 'Широкие буквы, оранжевый на графите, плавные изгибы',
    colors: {bg: '#1A1D1C', text: '#F5EDDF', accent: '#DD8852', light: '#F5EDDF'},
    fonts: {head: 'Unbounded, sans-serif', body: 'Manrope, sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@800&family=Manrope:wght@500;600;700&display=swap'},
    fields: {exterior: ['section'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
  {
    id: 'urban_olive', title: 'Urban Olive', ready: true,
    note: 'Цифры столбцом и контур, лайм на тёмно-зелёном',
    colors: {bg: '#1B2822', text: '#EEEBDD', accent: '#C3CE78', light: '#EEEBDD'},
    fonts: {head: 'Oswald, sans-serif', body: 'Manrope, sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700&display=swap'},
    fields: {exterior: ['section'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
  {
    id: 'contour_plum', title: 'Contour Plum', ready: true,
    note: 'Контурный номер и скруглённые ленты, лаванда на сливе',
    colors: {bg: '#342434', text: '#F2EDF0', accent: '#B6A4C8', light: '#F2EDF0'},
    fonts: {head: 'Rubik, sans-serif', body: 'Manrope, sans-serif',
      url: 'https://fonts.googleapis.com/css2?family=Rubik:wght@800&family=Manrope:wght@500;600;700&display=swap'},
    fields: {exterior: ['section'], interior: ['section'], price: ['label', 'title'], cta: ['title', 'text']},
  },
];

export const familyById = (id) => FAMILIES.find((f) => f.id === id && f.ready) ?? null;
export const isFamily = (id) => Boolean(familyById(id));
/** Формат карусели, в котором живут семейства */
export const FAMILY_FORMAT = 'spread';
