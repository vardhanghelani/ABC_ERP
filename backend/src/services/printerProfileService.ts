import type { PrinterProfileId } from '../models/PrintJob';

export interface PrinterProfileConfig {
  id: PrinterProfileId;
  name: string;
  manufacturer: string;
  defaultDpi: number;
  /** ZPL ^MU command — dots per mm */
  dotsPerMm: number;
  zplHomeOffset: { x: number; y: number };
  tsplGapMm: number;
  tsplDirection: 0 | 1;
  mediaType: 'direct' | 'transfer';
  notes: string;
}

export const PRINTER_PROFILES: Record<PrinterProfileId, PrinterProfileConfig> = {
  zebra: {
    id: 'zebra',
    name: 'Zebra (Generic)',
    manufacturer: 'Zebra Technologies',
    defaultDpi: 203,
    dotsPerMm: 8,
    zplHomeOffset: { x: 0, y: 0 },
    tsplGapMm: 2,
    tsplDirection: 1,
    mediaType: 'direct',
    notes: 'ZPL II — ZD/GK/GT series. Use 203 DPI unless printer is 300 DPI.',
  },
  tsc: {
    id: 'tsc',
    name: 'TSC',
    manufacturer: 'TSC Auto ID',
    defaultDpi: 203,
    dotsPerMm: 8,
    zplHomeOffset: { x: 2, y: 2 },
    tsplGapMm: 2,
    tsplDirection: 1,
    mediaType: 'direct',
    notes: 'TSPL/TSPL2 — TE/TDP/DA series. Primary output format: TSPL.',
  },
  tvs: {
    id: 'tvs',
    name: 'TVS-E',
    manufacturer: 'TVS Electronics',
    defaultDpi: 203,
    dotsPerMm: 8,
    zplHomeOffset: { x: 3, y: 3 },
    tsplGapMm: 3,
    tsplDirection: 1,
    mediaType: 'direct',
    notes: 'TSPL-compatible LP/RP series. Validate with calibration label before bulk print.',
  },
  generic: {
    id: 'generic',
    name: 'Generic Thermal',
    manufacturer: 'Generic',
    defaultDpi: 203,
    dotsPerMm: 8,
    zplHomeOffset: { x: 0, y: 0 },
    tsplGapMm: 2,
    tsplDirection: 1,
    mediaType: 'direct',
    notes: 'Fallback profile — run calibration and scan verification before production use.',
  },
};

export function getPrinterProfile(id: PrinterProfileId): PrinterProfileConfig {
  return PRINTER_PROFILES[id] ?? PRINTER_PROFILES.generic;
}

export function listPrinterProfiles(): PrinterProfileConfig[] {
  return Object.values(PRINTER_PROFILES);
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}
