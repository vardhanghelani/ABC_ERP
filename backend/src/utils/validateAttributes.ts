import { FieldType, ICategoryField } from '../models/CategoryField';
import { ApiError } from './ApiError';
import { sanitizeInteger, sanitizeMoney } from './numbers';

const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === '';

const parseNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
};

export const validateProductAttributes = (
  fields: ICategoryField[],
  attributes: Record<string, unknown> = {}
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = { ...attributes };

  for (const field of fields) {
    const raw = attributes[field.key];

    if (isBlank(raw)) {
      if (field.required) {
        throw new ApiError(400, `${field.name} is required`);
      }
      continue;
    }

    switch (field.fieldType) {
      case FieldType.INTEGER:
      case FieldType.NUMBER: {
        const n = parseNumeric(raw);
        if (n === null || !Number.isFinite(n)) {
          throw new ApiError(400, `${field.name} must be a whole number`);
        }
        normalized[field.key] = sanitizeInteger(n, 0);
        break;
      }
      case FieldType.DECIMAL: {
        const n = parseNumeric(raw);
        if (n === null || !Number.isFinite(n)) {
          throw new ApiError(400, `${field.name} must be a number`);
        }
        normalized[field.key] = sanitizeMoney(n, 0);
        break;
      }
      case FieldType.TEXT:
      case FieldType.COLOR:
      case FieldType.DATE:
      case FieldType.DROPDOWN:
      case FieldType.MULTI_SELECT:
        normalized[field.key] = String(raw).trim();
        break;
      case FieldType.BOOLEAN:
        normalized[field.key] = String(raw).trim();
        break;
      default:
        normalized[field.key] = raw;
    }
  }

  return normalized;
};
