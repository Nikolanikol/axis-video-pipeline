// Звуковые эффекты на появление плашек — реестр config/sfx.json.
//
// Звук ставится не началом, а пиком на событие: у перехода «удар» приходится на 1,09 с после
// начала, у удара на цене — на 0,65 с, и звук, начатый ровно на появлении плашки, опоздал бы
// на секунду. Поэтому начало сдвигается назад на peakSec; если сдвиг уходит за начало ролика —
// лишнее обрезается (trimBefore), пик всё равно попадает в кадр.
//
// Только реклама (решение владельца 27 сентября): в обзорах звучит голос, в каруселях звука нет.
// Выключаются галочкой в лоте (lot.sfx === false); по умолчанию включены.
import React from 'react';
import {Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import registry from '../../config/sfx.json';
import {AUDIO_LATENCY_SEC} from './music';

export type SfxSound = 'transition' | 'tick' | 'price' | 'cta';
export type SfxCue = {sound: SfxSound; frame: number};
type Sound = {file: string; peakSec: number; volume: number};

const PACKS = registry.packs as {id: string; sounds: Record<SfxSound, Sound>}[];
export const sfxPack = (id?: string) => PACKS.find((p) => p.id === id) ?? PACKS.find((p) => p.id === registry.default) ?? PACKS[0];

/** Все звуки ролика: по звуку на событие, пиком на кадр события */
export const SfxTrack: React.FC<{cues: SfxCue[]; pack?: string}> = ({cues, pack}) => {
  const {fps} = useVideoConfig();
  const sounds = sfxPack(pack).sounds;
  return (
    <>
      {cues.map((c, i) => {
        const s = sounds[c.sound];
        if (!s) return null;
        // Плюс задержка кодека AAC — та же поправка, что у музыки: без неё в готовом файле все
        // звуки опаздывали на 20–40 мс (замер 27 сентября: переход 3,02 вместо 3,00 с)
        const lead = Math.round((s.peakSec + AUDIO_LATENCY_SEC) * fps);
        const from = c.frame - lead;
        return (
          <Sequence key={`${c.sound}-${i}`} from={Math.max(0, from)} name={`sfx ${c.sound}`} layout="none">
            <Audio src={staticFile(s.file)} volume={s.volume} trimBefore={from < 0 ? -from : undefined} />
          </Sequence>
        );
      })}
    </>
  );
};
