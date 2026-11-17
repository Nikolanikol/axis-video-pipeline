// Вход с витрины axis-beauty.com (17.11): кнопки «Войти» и «Попробовать» ведут на настоящие адреса
// /login и /register (старые ссылки — #/login, #/register). Разбираем их ДО первой отрисовки — это
// первый импорт в main.tsx: иначе роутер принял бы «login» за раздел кабинета и вошедшему показал бы
// «Такой страницы нет» (так и было 17.11 у владельца, вошедшего в кабинет).
//
// Адрес сразу становится «/» (с прежними ?параметрами — их ещё заберут i18n и source.ts):
// вошедший попадает на главную кабинета, гость — на витрину, где Landing откроет нужное окно.
// Обновление страницы окно второй раз не откроет.
export type EntryIntent = 'login' | 'register';

let intent: EntryIntent | null = null;
try {
  const {pathname, search, hash} = window.location;
  const m = /^\/(login|register)\/?$/.exec(pathname) ?? /^#\/(login|register)\b/.exec(hash);
  if (m) {
    intent = m[1] as EntryIntent;
    window.history.replaceState(window.history.state, '', `/${search}`);
  }
} catch { /* странный адрес — просто без окна */ }

/** Какое окно открыть гостю на витрине; отдаётся один раз */
export const takeEntryIntent = (): EntryIntent | null => {
  const v = intent;
  intent = null;
  return v;
};
