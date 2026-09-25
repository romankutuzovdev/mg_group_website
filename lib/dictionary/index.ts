import { ru } from '@/translations/ru';

export type Dictionary = typeof ru;

export const getDictionary = (): Dictionary => {
  return ru;
};