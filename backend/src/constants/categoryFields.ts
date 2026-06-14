import { FieldType } from '../models/CategoryField';

/** Chain category code — uses length/roll weight, not naka */
export const CHAIN_CATEGORY_CODE = 'CHN';

/** Naka (hook) count: 1, 2, or rarely 3 — required for AD, GD, marble, metal, and future non-chain items */
export const NAKA_FIELD = {
  name: 'Naka (Hook)',
  key: 'naka',
  fieldType: FieldType.DROPDOWN,
  options: ['1', '2', '3'] as string[],
  required: true,
  placeholder: 'Number of hooks (1, 2, or 3)',
};

export const categoryUsesNaka = (categoryCode: string): boolean =>
  categoryCode.toUpperCase() !== CHAIN_CATEGORY_CODE;
