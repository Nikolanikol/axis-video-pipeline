// Общие настройки для всех инструментов: сохранённые (config) и черновики рынков и бренда.
// Черновики сразу видны в превью; на диск — по кнопке «Сохранить».
import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import type {Theme} from '../src/shared/types';
import {api, Config, MarketEntry, ProfileEntry} from './api';

type Ctx = {
  config: Config;
  markets: MarketEntry[];
  brand: Theme;
  // Профиль клиента: один на инстанс (MVP). Черновик виден в превью, на диск — по «Сохранить»
  profile: ProfileEntry;
  setProfile: (p: ProfileEntry) => void;
  profileSaved: (p: ProfileEntry) => void;
  setMarket: (m: MarketEntry) => void;
  marketSaved: (m: MarketEntry) => void;
  setBrand: (t: Theme) => void;
  brandSaved: (t: Theme) => void;
  savedMarket: (id: string) => MarketEntry | undefined;
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
  const [markets, setMarkets] = useState<MarketEntry[]>([]);
  const [brand, setBrandDraft] = useState<Theme | null>(null);
  const [profile, setProfileDraft] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    api.config().then((cfg) => {
      setConfig(cfg); setMarkets(cfg.markets); setBrandDraft(cfg.brand);
      setProfileDraft(cfg.profiles.find((p) => p.id === cfg.defaultProfile) ?? cfg.profiles[0] ?? null);
    }).catch(report);
  }, [report]);

  const setMarket = useCallback((m: MarketEntry) => setMarkets((ms) => ms.map((x) => (x.id === m.id ? m : x))), []);
  const marketSaved = useCallback((m: MarketEntry) => {
    setMarkets((ms) => [...ms.filter((x) => x.id !== m.id), m].sort(byId));
    setConfig((c) => c && {...c, markets: [...c.markets.filter((x) => x.id !== m.id), m].sort(byId)});
  }, []);
  const brandSaved = useCallback((t: Theme) => { setBrandDraft(t); setConfig((c) => c && {...c, brand: t}); }, []);
  const profileSaved = useCallback((p: ProfileEntry) => {
    setProfileDraft(p);
    setConfig((c) => c && {...c, profiles: [...c.profiles.filter((x) => x.id !== p.id), p].sort(byId)});
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!config || !brand || !profile) return null;
    const savedMarket = (id: string) => config.markets.find((m) => m.id === id);
    const savedProfile = config.profiles.find((p) => p.id === profile.id);
    const unsaved = brand !== config.brand || profile !== savedProfile || markets.some((m) => m !== savedMarket(m.id));
    return {config, markets, brand, profile, setProfile: setProfileDraft, profileSaved,
      setMarket, marketSaved, setBrand: setBrandDraft, brandSaved, savedMarket, unsaved, report};
  }, [config, markets, brand, profile, setMarket, marketSaved, brandSaved, profileSaved, report]);

  if (!value) return <div className="boot">Загрузка…</div>;
  return <ConfigCtx.Provider value={value}>{children}</ConfigCtx.Provider>;
};
