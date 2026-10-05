// Форматы карусели: config/carousel-formats.json — размер кадра и список слайдов.
// Общий для композиции (размер, число кадров) и интерфейса (выбор формата).
import formats from '../../config/carousel-formats.json';

export type CarouselFormat = {id: string; title: string; note: string; width: number; height: number; slides: string[]};
export const CAROUSEL_FORMATS = formats as CarouselFormat[];
export const DEFAULT_CAROUSEL_FORMAT = 'classic';

export const carouselFormat = (id?: string): CarouselFormat =>
  CAROUSEL_FORMATS.find((f) => f.id === id) ?? CAROUSEL_FORMATS.find((f) => f.id === DEFAULT_CAROUSEL_FORMAT)!;

/**
 * Слайды формата с учётом истории: на проде её выключают (страховые случаи с датацентра
 * не приходят), и тогда слайдов на один меньше — нумерация считается от этого списка.
 * skip — слайды, которым нечем заполниться (у лота аукциона нет цены, истории и опций).
 */
export const carouselSlides = (id?: string, includeHistory = true, skip: string[] = []) =>
  carouselFormat(id).slides.filter((s) => (includeHistory || s !== 'history') && !skip.includes(s));
