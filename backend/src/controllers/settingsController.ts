import { Response } from 'express';
import { Settings, DEFAULT_SETTINGS } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const getSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.group) filter.group = req.query.group;

  let settings = await Settings.find(filter);
  if (settings.length === 0) {
    await Settings.insertMany(DEFAULT_SETTINGS);
    settings = await Settings.find(filter);
  }

  const settingsMap = settings.reduce(
    (acc, s) => ({ ...acc, [s.key]: s.value }),
    {} as Record<string, unknown>
  );

  ApiResponse.success(res, settingsMap);
});

export const updateSettings = asyncHandler(async (req: AuthRequest, res: Response) => {
  const updates = req.body as Record<string, unknown>;

  for (const [key, value] of Object.entries(updates)) {
    await Settings.findOneAndUpdate({ key }, { value }, { upsert: true });
  }

  ApiResponse.success(res, updates, 'Settings updated');
});

export const getSetting = asyncHandler(async (req: AuthRequest, res: Response) => {
  const setting = await Settings.findOne({ key: req.params.key });
  if (!setting) throw new ApiError(404, 'Setting not found');
  ApiResponse.success(res, setting);
});
