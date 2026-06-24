import bwipjs from 'bwip-js';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError';
import {
  allocateNextBarcode,
  assertBarcodeAvailable,
  normalizeBarcodeValue,
} from './barcodeSequenceService';

export const generateBarcode = (value: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid: 'code128',
        text: value,
        scale: 3,
        height: 10,
        includetext: true,
        textxalign: 'center',
      },
      (err, png) => {
        if (err) reject(err);
        else resolve(`data:image/png;base64,${png.toString('base64')}`);
      }
    );
  });
};

export const generateSKU = (categoryCode: string): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${categoryCode}-${timestamp}${random}`;
};

/** @deprecated Use allocateNextBarcode via resolveProductBarcode instead. */
export const generateUniqueBarcode = (): string => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `890${timestamp}${random}`;
};

export async function resolveProductBarcode(
  category: { barcodePrefix?: string; code: string },
  options: {
    overrideBarcode?: string;
    session?: mongoose.ClientSession;
  } = {}
): Promise<string> {
  if (options.overrideBarcode) {
    const normalized = normalizeBarcodeValue(options.overrideBarcode);
    await assertBarcodeAvailable(normalized, options.session);
    return normalized;
  }

  const prefix = category.barcodePrefix || category.code.toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new ApiError(400, 'Category barcode prefix is not configured');
  }

  return allocateNextBarcode(prefix, options.session);
}
