// Общие настройки для всех инструментов: сохранённые (config) и черновики профиля и бренда.
// Черновики сразу видны в превью; на диск — по кнопке «Сохранить».
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {Loading} from './Loading';
import {useSession} from './auth';
import type {Theme} from '../src/shared/types';
import {api, Config, ProfileEntry} from './api';
import {getLang, isLang, setLang, useLang} from './i18n';

type Ctx = {
  config: Config;
  brand: Theme;
  // Профиль клиента: один на инстанс (MVP). Черновик виден в превью, на диск — по «Сохранить»
  profile: ProfileEntry;
  setProfile: (p: ProfileEntry) => void;
  profileSaved: (p: ProfileEntry) => void;
  setBrand: (t: Theme) => void;
  brandSaved: (t: Theme) => void;
  unsaved: boolean;
  report: (e: unknown) => void;
};

const ConfigCtx = createContext<Ctx | null>(null);

export const useConfig = () => {
  const ctx = useContext(ConfigCtx);
  if (!ctx) throw new Error('useConfig вне ConfigProvider');
  return ctx;
};

const byId = <T extends {id: string}>(a: T, b: T) => a.id.localeCompare(b.id);

export const ConfigProvider: React.FC<{report: (e: unknown) => void; children: React.ReactNode}> = ({report, children}) => {
  const [config, setConfig] = useState<Config | null>(null);
  const [brand, setBrandDraft] = useState<Theme | null>(null);
  const [profile, setProfileDraft] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    api.config().then((cfg) => {
      setConfig(cfg); setBrandDraft(cfg.brand);
      setProfileDraft(cfg.profiles.find((p) => p.id === cfg.defaultProfile) ?? cfg.profiles[0] ?? null);
    }).catch(report);
  }, [report]);

  const brandSaved = useCallback((t: Theme) => { setBrandDraft(t); setConfig((c) => c && {...c, brand: t}); }, []);
  const {refresh, enabled: auth, lang: userLang} = useSession();

  // Один переключатель на всё (15.11, владелец: «всё работает от переключателя»): язык интерфейса,
  // язык постов компании (profile.language — слайды и ролики) и язык писем человека (users.lang).
  // При входе — язык с сервера: свой, а у того, кто ещё не выбирал (зарегистрирован до переводов), —
  // язык постов компании. Так существующие клиенты не получат посты на другом языке молча: меняется
  // только интерфейс, под их уже выбранный язык постов. Дальше каждая смена переключателя пишется
  // и в профиль, и человеку.
  const lang = useLang();
  const synced = useRef(false);
  const serverLang = useRef(userLang);
  useEffect(() => {
    if (!config) return;
    const saved = config.profiles.find((p) => p.id === config.defaultProfile) ?? config.profiles[0];
    if (!synced.current) {
      synced.current = true;
      const target = userLang ?? (isLang(saved?.language) ? saved.language : null);
      if (target && target !== getLang()) setLang(target);
      // Ещё не выбирал — запоминаем за ним язык постов: письма пойдут на нём же
      if (auth && !userLang && target) { serverLang.current = target; api.account.setLang(target).catch(report); }
      return;
    }
    if (auth && serverLang.current !== lang) {
      serverLang.current = lang;
      api.account.setLang(lang).catch(report);
    }
    if (saved && saved.language !== lang) {
      const {id, ...rest} = saved;
      api.saveProfile(id, {...rest, language: lang}).then((p) => {
        setConfig((c) => c && {...c, profiles: [...c.profiles.filter((x) => x.id !== p.id), p].sort(byId)});
        // Черновик без правок — сам сохранённый профиль (иначе экран решит, что есть несохранённое);
        // с правками — им же, только с новым языком
        setProfileDraft((d) => (d === saved ? p : d && d.id === p.id ? {...d, language: lang} : d));
      }).catch(report);
    }
  }, [config, lang, auth, userLang, report]);

  const profileSaved = useCallback((p: ProfileEntry) => {
    // Название кабинета в шапке идёт за компанией профиля (сервер, saveProfile) — перечитываем сессию
    refresh();
    setProfileDraft(p);
    setConfig((c) => c && {...c, profiles: [...c.profiles.filter((x) => x.id !== p.id), p].sort(byId)});
  }, [refresh]);

  const value = useMemo<Ctx | null>(() => {
    if (!config || !brand || !profile) return null;
    const savedProfile = config.profiles.find((p) => p.id === profile.id);
    const unsaved = brand !== config.brand || profile !== savedProfile;
    return {config, brand, profile, setProfile: setProfileDraft, profileSaved,
      setBrand: setBrandDraft, brandSaved, unsaved, report};
  }, [config, brand, profile, profileSaved, report]);

  if (!value) return <Loading />;
  return <ConfigCtx.Provider value={value}>{children}</ConfigCtx.Provider>;
};
