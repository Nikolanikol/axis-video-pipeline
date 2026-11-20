import React from 'react';
import type {DesignContent} from '../../../design/DesignSlide';
import {Text} from './Text';
// Контакт не переносим и не сокращаем; сайт получает отдельную строку.
export const Contact: React.FC<{
  contact: NonNullable<DesignContent['contact']>;
  w: number;
  color: string;
  max?: number;
  bodyWeight?: number;
  headWeight?: number;
  italic?: boolean;
}> = ({contact: c, w, color, max = 66, bodyWeight = 600, headWeight = 700, italic}) => (
  <div>
    <Text text={c.label} field="label" w={w} h={40} max={28} min={20} color={color} body weight={bodyWeight} nowrap />
    <Text
      text={c.value}
      field="contact"
      w={w}
      h={90}
      max={max}
      min={26}
      color={color}
      weight={headWeight}
      italic={italic}
      nowrap
    />
    {c.secondary && (
      <Text
        text={c.secondary}
        field="contact"
        w={w}
        h={42}
        max={28}
        min={22}
        color={color}
        body
        weight={bodyWeight}
        nowrap
      />
    )}
  </div>
);

export const bottomAreas = (h: number, content: DesignContent, captionH: number) => {
  const noteH = content.lines?.length ? captionH : 0,
    contactH = content.contact ? (content.contact.secondary ? 204 : 164) : 0;
  const noteY = h - 40 - noteH,
    contactY = noteY - (noteH ? 24 : 0) - contactH;
  return {noteY, noteH, contactY, contactH, photoEnd: contactY - 24};
};
