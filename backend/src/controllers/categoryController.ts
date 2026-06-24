import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Category, CategoryField, FieldType, Product } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logAudit } from '../middleware/auditLog';
import { paramId } from '../utils/params';
import { AuditAction } from '../models/AuditLog';
import { nameToFieldKey } from '../utils/fieldKey';
import {
  deriveBarcodePrefixFromCode,
  ensureUniqueBarcodePrefix,
} from '../services/categoryBarcodeService';

const BARCODE_PREFIX_PATTERN = /^[A-Z]{3}$/;

const resolveCategoryBarcodePrefix = async (
  code: string,
  requested?: string,
  excludeCategoryId?: mongoose.Types.ObjectId
): Promise<string> => {
  const desired = (requested || deriveBarcodePrefixFromCode(code)).toUpperCase().slice(0, 3);
  if (!BARCODE_PREFIX_PATTERN.test(desired)) {
    throw new ApiError(400, 'Barcode prefix must be exactly 3 uppercase letters');
  }
  return ensureUniqueBarcodePrefix(desired, excludeCategoryId);
};

export const inlineFieldSchema = z.object({
  name: z.string().min(1),
  fieldType: z.enum([FieldType.TEXT, FieldType.INTEGER, FieldType.DECIMAL, FieldType.NUMBER]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(10),
  barcodePrefix: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'Barcode prefix must be exactly 3 letters')
    .optional(),
  description: z.string().optional(),
  sortOrder: z.number().optional(),
  fields: z.array(inlineFieldSchema).optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean().optional(),
  barcodePrefix: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'Barcode prefix must be exactly 3 letters')
    .optional(),
});

export const fieldSchema = z.object({
  name: z.string().min(1),
  key: z.string().min(1).optional(),
  fieldType: z.enum([FieldType.TEXT, FieldType.INTEGER, FieldType.DECIMAL, FieldType.NUMBER]),
  required: z.boolean().optional(),
  sortOrder: z.number().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
});

export const updateFieldSchema = z.object({
  name: z.string().min(1).optional(),
  fieldType: z.enum([FieldType.TEXT, FieldType.INTEGER, FieldType.DECIMAL, FieldType.NUMBER]).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().optional(),
  placeholder: z.string().optional(),
  isActive: z.boolean().optional(),
});

const buildFieldPayload = (
  input: z.infer<typeof inlineFieldSchema>,
  categoryId: mongoose.Types.ObjectId,
  sortOrder: number
) => {
  const key = nameToFieldKey(input.name);
  if (!key) throw new ApiError(400, `Invalid field name: ${input.name}`);
  return {
    category: categoryId,
    name: input.name.trim(),
    key,
    fieldType: input.fieldType === FieldType.NUMBER ? FieldType.INTEGER : input.fieldType,
    options: [],
    required: input.required ?? false,
    sortOrder,
    placeholder: input.placeholder,
  };
};

export const getCategories = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { search, active } = req.query;
  const filter: Record<string, unknown> = {};
  if (search) filter.$text = { $search: search as string };
  if (active !== undefined) filter.isActive = active === 'true';

  const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
  ApiResponse.success(res, categories);
});

export const getCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  const fields = await CategoryField.find({ category: category._id, isActive: true }).sort({ sortOrder: 1 });
  ApiResponse.success(res, { ...category.toObject(), fields });
});

export const createCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const existing = await Category.findOne({ code: req.body.code.toUpperCase() });
  if (existing) throw new ApiError(409, 'Category code already exists');

  const { fields: inlineFields, ...categoryData } = req.body;
  const code = req.body.code.toUpperCase();
  const barcodePrefix = await resolveCategoryBarcodePrefix(code, req.body.barcodePrefix);

  const category = await Category.create({
    ...categoryData,
    code,
    barcodePrefix,
    createdBy: req.user!._id,
  });

  let sortOrder = 0;

  if (inlineFields?.length) {
    for (const fieldInput of inlineFields) {
      const payload = buildFieldPayload(fieldInput, category._id, sortOrder++);
      const dup = await CategoryField.findOne({ category: category._id, key: payload.key });
      if (dup) throw new ApiError(409, `Field "${payload.name}" already exists (key: ${payload.key})`);
      await CategoryField.create(payload);
    }
  }

  const createdFields = await CategoryField.find({ category: category._id, isActive: true }).sort({ sortOrder: 1 });

  await logAudit(req, AuditAction.CREATE, 'Category', category._id.toString());
  ApiResponse.success(res, { ...category.toObject(), fields: createdFields }, 'Category created', 201);
});

export const updateCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  const { name, description, sortOrder, isActive, barcodePrefix } = req.body;

  if (name !== undefined) category.name = name;
  if (description !== undefined) category.description = description;
  if (sortOrder !== undefined) category.sortOrder = sortOrder;
  if (isActive !== undefined) category.isActive = isActive;

  if (barcodePrefix !== undefined) {
    const normalized = barcodePrefix.toUpperCase();
    if (!BARCODE_PREFIX_PATTERN.test(normalized)) {
      throw new ApiError(400, 'Barcode prefix must be exactly 3 uppercase letters');
    }
    const duplicate = await Category.findOne({
      barcodePrefix: normalized,
      _id: { $ne: category._id },
    });
    if (duplicate) throw new ApiError(409, `Barcode prefix "${normalized}" is already in use`);
    category.barcodePrefix = normalized;
  }

  await category.save();
  await logAudit(req, AuditAction.UPDATE, 'Category', category._id.toString(), req.body);
  ApiResponse.success(res, category, 'Category updated');
});

export const deleteCategory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = await Category.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!category) throw new ApiError(404, 'Category not found');
  await logAudit(req, AuditAction.DELETE, 'Category', paramId(req.params.id));
  ApiResponse.success(res, null, 'Category deactivated');
});

export const getCategoryFields = asyncHandler(async (req: AuthRequest, res: Response) => {
  const fields = await CategoryField.find({ category: req.params.id }).sort({ sortOrder: 1 });
  ApiResponse.success(res, fields);
});

export const getCategoryField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categoryId = paramId(req.params.id);
  const field = await CategoryField.findOne({
    _id: paramId(req.params.fieldId),
    category: categoryId,
    isActive: true,
  });
  if (!field) throw new ApiError(404, 'Field not found');
  ApiResponse.success(res, field);
});

export const createCategoryField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new ApiError(404, 'Category not found');

  const key = req.body.key || nameToFieldKey(req.body.name);
  if (!key) throw new ApiError(400, 'Field name is required');

  const existing = await CategoryField.findOne({ category: category._id, key });
  if (existing) throw new ApiError(409, `Field key "${key}" already exists for this category`);

  const maxSort = await CategoryField.findOne({ category: category._id }).sort({ sortOrder: -1 });
  const sortOrder = req.body.sortOrder ?? (maxSort ? maxSort.sortOrder + 1 : 0);

  const fieldType = req.body.fieldType === FieldType.NUMBER ? FieldType.INTEGER : req.body.fieldType;

  const field = await CategoryField.create({
    ...req.body,
    key,
    fieldType,
    category: category._id,
    sortOrder,
  });
  await logAudit(req, AuditAction.CREATE, 'CategoryField', field._id.toString());
  ApiResponse.success(res, field, 'Field created', 201);
});

export const updateCategoryField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categoryId = paramId(req.params.id);
  const fieldId = paramId(req.params.fieldId);

  const field = await CategoryField.findOne({ _id: fieldId, category: categoryId });
  if (!field) throw new ApiError(404, 'Field not found');

  const { name, fieldType, required, sortOrder, placeholder, options, isActive } = req.body;

  if (name !== undefined) field.name = name.trim();
  if (fieldType !== undefined) {
    field.fieldType = fieldType === FieldType.NUMBER ? FieldType.INTEGER : fieldType;
  }
  if (required !== undefined) field.required = required;
  if (sortOrder !== undefined) field.sortOrder = sortOrder;
  if (placeholder !== undefined) field.placeholder = placeholder;
  if (options !== undefined) field.options = options;
  if (isActive !== undefined) field.isActive = isActive;

  await field.save();
  await logAudit(req, AuditAction.UPDATE, 'CategoryField', field._id.toString(), req.body);
  ApiResponse.success(res, field, 'Field updated');
});

export const deleteCategoryField = asyncHandler(async (req: AuthRequest, res: Response) => {
  const categoryId = paramId(req.params.id);
  const fieldId = paramId(req.params.fieldId);

  const field = await CategoryField.findOne({ _id: fieldId, category: categoryId, isActive: true });
  if (!field) throw new ApiError(404, 'Field not found');

  const productsUsingField = await Product.countDocuments({
    category: categoryId,
    status: 'active',
    [`attributes.${field.key}`]: { $exists: true, $nin: [null, ''] },
  });

  if (productsUsingField > 0) {
    throw new ApiError(
      409,
      `Cannot delete "${field.name}" — ${productsUsingField} product(s) use this field. Deactivate products first or keep the field.`
    );
  }

  field.isActive = false;
  await field.save();
  await logAudit(req, AuditAction.DELETE, 'CategoryField', fieldId);
  ApiResponse.success(res, null, 'Field deleted');
});
