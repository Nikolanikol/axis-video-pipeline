// Слот шапки приложения для экрана, которому на телефоне нужна своя строка вместо логотипа
// (мобильная палитра ролика, docs/palette-mobile.md, раздел 3: «одна шапка, а не KOK + строка машины»).
// Экран кладёт сюда содержимое и свои пункты меню; бургер с общим меню (разделы, кабинет, курсы)
// остаётся за Shell. Ушли с экрана — слот освобождается, остальные страницы видят обычную шапку.
import React, {createContext, useContext, useLayoutEffect, useMemo, useState} from 'react';

export type HeaderMenuItem = {label: string; onClick: () => void};
export type HeaderSlot = {content: React.ReactNode; menu?: HeaderMenuItem[]} | null;

const Ctx = createContext<{slot: HeaderSlot; setSlot: (slot: HeaderSlot) => void}>({slot: null, setSlot: () => {}});

export const HeaderSlotProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [slot, setSlot] = useState<HeaderSlot>(null);
  const value = useMemo(() => ({slot, setSlot}), [slot]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** Текущий слот — читает Shell */
export const useHeaderSlotValue = () => useContext(Ctx).slot;

/**
 * Занять слот, пока экран смонтирован. deps — от чего зависит содержимое (статус, название):
 * без них слот обновлялся бы на каждый рендер экрана. useLayoutEffect — без мигания логотипа
 */
export const useHeaderSlot = (slot: HeaderSlot, deps: React.DependencyList) => {
  const {setSlot} = useContext(Ctx);
  useLayoutEffect(() => { setSlot(slot); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => () => setSlot(null), [setSlot]);
};
