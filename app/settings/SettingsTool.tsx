// Раздел «Настройки»: профиль и бренд. Справа — живое превью последнего открытого лота.
import React, {useEffect, useState} from 'react';
import {getFormat} from '../../src/shared/model';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {lotTitle} from '../ads/LotTool';
import {api, LotEntry, MarketEntry} from '../api';
import {useConfig} from '../config';
import {Player} from '@remotion/player';
import {Eye, SlidersHorizontal} from 'lucide-react';
import {MobileTabs, useIsPhone} from '../MobileTabs';
import {BrandPreview} from '../../src/brand/BrandPreview';
import {Preview} from '../Preview';
import {href, lastLot} from '../router';
import {BrandForm, ProfileForm} from '../SettingsForms';

const usePreviewLot = () => {
  const {report} = useConfig();
  const [lot, setLot] = useState<LotEntry | null | undefined>(undefined);
  useEffect(() => {
    api.lots().then((list) => setLot(list.find((l) => l.id === lastLot.get()) ?? list[0] ?? null)).catch(report);
  }, [report]);
  return lot;
};

const PreviewPanel: React.FC<{lot: LotEntry | null | undefined; market: MarketEntry}> = ({lot, market}) => {
  const {brand} = useConfig();
  if (lot === undefined) return <div className="empty">Загрузка превью…</div>;
  if (lot === null) return <div className="empty">Превью появится, когда будет хотя бы одно объявление</div>;
  const format = getFormat(lot.format);
  return (
    <>
      <div className="format-bar">
        <span className="muted">Превью: <a href={href('ads', 'lot')}>{lotTitle(lot)}</a> · {format.title}</span>
      </div>
      <Preview input={{lot: {...lot, market: market.id}, market: market as Market, theme: brand}} format={format} />
    </>
  );
};

// Раскладка настроек: на компьютере форма слева и превью справа; на телефоне — два раздела
// с панелью внизу («Настройки» и «Превью»), как у остальных инструментов. Превью на телефоне
// монтируется, только когда открыто: плеер в скрытом разделе рисовал бы кадры впустую.
// Правки формы видны в превью сразу — оно читает те же несохранённые значения
const SettingsLayout: React.FC<{editor: React.ReactNode; preview: React.ReactNode}> = ({editor, preview}) => {
  const phone = useIsPhone();
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  return (
    <>
      <main className="grid grid-settings" data-stab={tab}>
        <section className="panel editor">{editor}</section>
        <section className="panel preview">{phone && tab !== 'preview' ? null : preview}</section>
      </main>
      <MobileTabs value={tab} onChange={setTab} tabs={[
        {id: 'edit', label: 'Настройки', icon: <SlidersHorizontal size={20} />},
        {id: 'preview', label: 'Превью', icon: <Eye size={20} />},
      ]} />
    </>
  );
};

export const ProfileTool: React.FC = () => {
  const {config, profile, setProfile, profileSaved, report} = useConfig();
  const lot = usePreviewLot();
  // Превью считается из профиля клиентски — через тот же мост, что стадия 4 включит в рендере.
  // Так правки профиля видны сразу, ещё до того как их начнёт читать сам ролик.
  const savedProfile = config.profiles.find((p) => p.id === profile.id);
  const market = marketFromProfile(profile, config.copy) as Market;
  return (
    <SettingsLayout
      editor={<ProfileForm profile={profile} saved={savedProfile} onChange={setProfile} onSaved={profileSaved} onError={report} />}
      preview={<PreviewPanel lot={lot} market={{...market, id: profile.id}} />} />
  );
};

export const BrandTool: React.FC = () => {
  const {config, profile, brand, setBrand, brandSaved, report} = useConfig();
  const lot = usePreviewLot();
  // Превью рекламы берёт данные из профиля — через тот же мост, что и рендер
  const market = {...(marketFromProfile(profile, config.copy) as Market), id: profile.id};
  // Образец по умолчанию: на нём все настройки видны разом, а в ролике акцент мелькает
  // на второй секунде, плашка на седьмой — подбирать цвета по нему мучительно
  const [mode, setMode] = useState<'sampler' | 'ad'>('sampler');
  return (
    <SettingsLayout
      editor={
        <BrandForm theme={brand} saved={config.brand} pairs={config.fonts} palettes={config.palettes ?? []}
          onChange={setBrand} onSaved={brandSaved} onError={report} />
      }
      preview={<>
        <div className="format-bar">
          <div className="btn-row">
            <button className={`btn ${mode === 'sampler' ? 'primary' : 'ghost'}`} onClick={() => setMode('sampler')}>
              Образец
            </button>
            <button className={`btn ${mode === 'ad' ? 'primary' : 'ghost'}`} onClick={() => setMode('ad')}>
              Ролик
            </button>
          </div>
        </div>
        {mode === 'sampler'
          ? (
            <div className="player-wrap">
              <div className="player-box">
                {/* Один кадр без анимации: управление и повтор тут не нужны */}
                <Player
                  component={BrandPreview}
                  inputProps={{theme: brand}}
                  durationInFrames={1}
                  fps={1}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  style={{width: '100%', height: '100%'}}
                />
              </div>
            </div>
          )
          : <PreviewPanel lot={lot} market={market} />}
      </>} />
  );
};
