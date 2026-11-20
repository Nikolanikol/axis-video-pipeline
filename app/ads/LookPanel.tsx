// Оформление ролика этого объявления — на экране ролика, рядом с превью (владелец 20.10:
// «чтобы там можно было сразу всё посмотреть и настроить»). Те же поля, что в «Бренде», но
// выбор пишется в объявление (lot.look) и не трогает бренд и другие ролики.
import React from 'react';
import {applyLook, pickLook} from '../../src/design/style/look.js';
import type {Lot, Theme} from '../../src/shared/types';
import type {FontPair, Palette} from '../api';
import {DesignField} from '../DesignField';
import {matchPalette} from '../../src/shared/contrast.js';
import {FineColors, PaletteField, PlateField, StyleField} from '../SettingsForms';
import {useT} from '../i18n';

// embedded — внутри секции «Оформление» палитры: без своей шапки и «Готово»; onClose тогда не нужен
type Props = {lot: Lot; brand: Theme; pairs: FontPair[]; palettes: Palette[]; onChange: (patch: Partial<Lot>) => void; onClose?: () => void; embedded?: boolean; detailsOnly?: boolean};

// Тема ролика объявления: бренд, поверх — своё оформление. Ею же пользуются кнопки движения
export const lotTheme = (brand: Theme, lot: Pick<Lot, 'look'> | null | undefined): Theme => applyLook(brand, lot?.look) as Theme;

export const LookPanel: React.FC<Props> = ({lot, brand, pairs, palettes, onChange, onClose, embedded = false, detailsOnly = false}) => {
  const theme = lotTheme(brand, lot);
  const t = useT();
  // Любая правка — снимок оформления целиком (почему не разница с брендом — src/design/style/look.js)
  const set = (next: Theme) => onChange({look: pickLook(next) as Lot['look']});
  return <div className={embedded ? 'look-panel embedded' : 'look-panel'}>
    {!embedded && <div className="look-head">
      <b>{t('look.title')}</b>
      <button type="button" className="btn primary" onClick={onClose}>{t('pay.done')}</button>
    </div>}
    <p className="note">
      {t(lot.look ? 'look.own' : 'look.brand')}
      {lot.look && <> <button type="button" className="motion-reset" onClick={() => onChange({look: undefined})}>{t('look.reset')}</button></>}
    </p>
    <DesignField theme={theme} onChange={set} motion={false} presets={!detailsOnly}
      note={t('look.designNote')} />
    {/* Шрифтов здесь нет (владелец 20.10: «не так важны»): пара приходит с пресетом, выбрать свою —
        в «Настройки → Бренд» для всей компании */}
    <h2>{t('look.style')}</h2>
    <StyleField theme={theme} onChange={set} />
    {/* Подложка логотипа — своя у ролика (снимок lot.look), по умолчанию как в бренде */}
    <h2>{t('look.plate')}</h2>
    <PlateField theme={theme} onChange={set} />
    <h2>{t('land.demo.palette')}</h2>
    <PaletteField theme={theme} palettes={palettes} onChange={set} />
    <FineColors theme={theme} custom={!matchPalette(theme, palettes)} onChange={set} />
  </div>;
};
