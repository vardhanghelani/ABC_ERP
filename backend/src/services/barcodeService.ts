import bwipjs from 'bwip-js';

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

export const generateUniqueBarcode = (): string => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `890${timestamp}${random}`;
};

export const generateSKU = (categoryCode: string): string => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${categoryCode}-${timestamp}${random}`;
};
