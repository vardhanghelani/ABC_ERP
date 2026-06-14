import { Response } from 'express';
import { z } from 'zod';
import { Expense } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';

export const expenseSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required').max(500),
  amount: z.number().min(0.01, 'Amount must be greater than zero'),
});

export const updateExpenseSchema = expenseSchema.partial();

function displayReason(expense: {
  reason?: string;
  category?: string;
  description?: string;
}): string {
  return expense.reason?.trim() || expense.category?.trim() || expense.description?.trim() || 'Expense';
}

export const getExpenses = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const [expenses, total] = await Promise.all([
    Expense.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Expense.countDocuments(),
  ]);

  const data = expenses.map((expense) => ({
    ...expense,
    reason: displayReason(expense),
  }));

  ApiResponse.paginated(res, data, { page, limit, total });
});

export const createExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const entryNumber = await generateDocumentNumber('EXP', Expense, 'entryNumber');

  const expense = await Expense.create({
    reason: req.body.reason.trim(),
    amount: req.body.amount,
    entryNumber,
    createdBy: req.user!._id,
  });

  const populated = await Expense.findById(expense._id).populate('createdBy', 'name');
  ApiResponse.success(res, populated, 'Expense recorded', 201);
});

export const updateExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = updateExpenseSchema.parse(req.body);
  const updates: Record<string, unknown> = {};
  if (parsed.reason !== undefined) updates.reason = parsed.reason.trim();
  if (parsed.amount !== undefined) updates.amount = parsed.amount;

  const expense = await Expense.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(
    'createdBy',
    'name'
  );
  if (!expense) throw new ApiError(404, 'Expense not found');
  ApiResponse.success(res, expense, 'Expense updated');
});

export const deleteExpense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const expense = await Expense.findByIdAndDelete(req.params.id);
  if (!expense) throw new ApiError(404, 'Expense not found');
  ApiResponse.success(res, null, 'Expense deleted');
});
