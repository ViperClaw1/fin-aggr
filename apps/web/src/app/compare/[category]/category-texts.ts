// Texts per compare category: the page, its metadata and its Open Graph image use the same words.
import { STAGE1_CATEGORIES } from '@fa/contracts';

export type Stage1Category = (typeof STAGE1_CATEGORIES)[number];

export const isStage1 = (c: string): c is Stage1Category =>
  (STAGE1_CATEGORIES as readonly string[]).includes(c);

export const TITLE: Record<Stage1Category, string> = {
  cd: 'Compare CDs',
  savings: 'Compare savings accounts',
  treasury: 'Compare Treasuries',
};

export const TAB: Record<Stage1Category, string> = {
  cd: 'CDs',
  savings: 'Savings',
  treasury: 'Treasuries',
};

export const DESCRIPTION: Record<Stage1Category, string> = {
  cd: 'Certificates of deposit ranked by what you keep after federal, state and city tax.',
  savings: 'Savings accounts ranked by what you keep after federal, state and city tax.',
  treasury: 'Treasury bills and notes ranked by what you keep after tax.',
};
