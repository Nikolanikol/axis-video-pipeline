// Отчёт об ошибке в браузере → сервер (server/clientErrors.mjs) → журнал и тревога в «Сбои».
// Сами по себе ошибки в консоли клиента до нас не доходят: узнавали, только когда он напишет.
//
// Что не шлём:
// - ошибки API (ApiError): сервер уже записал свою сторону, а 4xx — это «нет такого объявления»;
// - обрывы сети: клиент без интернета не наша поломка, а отчёт всё равно не дойдёт;
// - шум браузера и расширений (ResizeObserver, «Script error.» чужих скриптов, chrome-extension://).
// Одна и та же ошибка — один раз за открытие страницы, всего не больше 10: зациклившийся экран
// иначе слал бы отчёт на каждый кадр.
import {ApiError} from './api';

const sent = new Set<string>();
const MAX = 10;

const NOISE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Failed to fetch|Load failed|NetworkError|Network request failed/i,
  // Браузер не дал запустить видео или звук — это его политика, а не поломка нашего кода; ролик
  // просто ждёт нажатия ▶. Откуда правило: 12.10 тревогой в «Сбои» пришёл отказ InvalidStateError
  // «Failed to start the audio device» со встроенного браузера Instagram на iPhone (витрина гостя,
  // код отчёта 3d437b7f7c). Источник в плеере закрыт (numberOfSharedAudioTags в app/Preview.tsx),
  // а этот фильтр — на остальные такие же отказы: «play() request was interrupted» и «play() failed
  // because the user didn't interact» (Chrome, автозапуск без нажатия), «not allowed by the user
  // agent» (Safari), занятое звуковое устройство. Каждый такой отказ иначе будил бы тревогу впустую
  /Failed to start the audio device|play\(\) (request was interrupted|failed because the user)|not allowed by the user agent/i,
  // Новая выкладка: старая вкладка просит кусок сборки, которого уже нет. Лечится перезагрузкой
  /dynamically imported module|Importing a module script failed|Loading chunk/i,
];

type Kind = 'boundary' | 'error' | 'rejection';

export const reportError = (kind: Kind, error: unknown, extra: {tool?: string; componentStack?: string} = {}) => {
  try {
    if (error instanceof ApiError) return;
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error) ?? String(error));
    const message = e.message || String(error);
    if (NOISE.some((re) => re.test(message))) return;
    const stack = [e.stack, extra.componentStack].filter(Boolean).join('\n--- компоненты ---\n');
    if (/chrome-extension:|moz-extension:|safari-web-extension:/.test(stack)) return;
    if (sent.size >= MAX || sent.has(message)) return;
    sent.add(message);
    const body = JSON.stringify({kind, name: e.name, message, stack: stack.slice(0, 2000), url: location.href, tool: extra.tool});
    // keepalive — отчёт дойдёт, даже если страница тут же закрывается или перезагружается
    void fetch('/api/client-error', {method: 'POST', headers: {'Content-Type': 'application/json'}, body, keepalive: true}).catch(() => {});
  } catch {
    // Отчёт об ошибке сам ошибкой быть не должен
  }
};

/** Ловушки страницы — один раз при старте (app/main.tsx) */
export const installErrorReports = () => {
  window.addEventListener('error', (ev) => {
    // Не загрузилась картинка или скрипт — это событие без error, не наша поломка кода
    if (ev.error || ev.message) reportError('error', ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => reportError('rejection', ev.reason));
};
