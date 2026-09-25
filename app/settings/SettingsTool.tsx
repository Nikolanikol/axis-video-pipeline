// Раздел «Настройки»: профиль, бренд, рынки. Справа — живое превью последнего открытого лота.
import React, {useEffect, useState} from 'react';
import {getFormat} from '../../src/shared/model';
import {marketFromProfile} from '../../src/shared/profile';
import type {Market} from '../../src/shared/types';
import {lotTitle} from '../ads/LotTool';
import {api, LotEntry, MarketEntry} from '../api';
import {useConfig} from '../config';
import {Player} from '@remotion/player';
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
  if (lot === null) return <div className="empty">Превью появится, когда будет хотя бы один лот</div>;
  const format = getFormat(lot.format);
  return (
    <>
      <div className="format-bar">
        <span className="muted">Превью: <a href={href('ads', 'lot')}>{lotTitle(lot)}</a> · {format.title} · рынок «{market.id}»</span>
      </div>
      <Preview input={{lot: {...lot, market: market.id}, market: market as Market, theme: brand}} format={format} />
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
    <main className="grid grid-settings">
      <section className="panel editor">
        <ProfileForm profile={profile} saved={savedProfile} onChange={setProfile} onSaved={profileSaved} onError={report} />
      </section>
      <section className="panel preview"><PreviewPanel lot={lot} market={{...market, id: profile.id}} /></section>
    </main>
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
    <main className="grid grid-settings">
      <section className="panel editor">
        <BrandForm theme={brand} saved={config.brand} pairs={config.fonts}
          onChange={setBrand} onSaved={brandSaved} onError={report} />
      </section>
      <section className="panel preview">
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
      </section>
    </main>
  );
};
