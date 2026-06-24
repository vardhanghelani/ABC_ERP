import { Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { AuditLog, AuditAction } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { logAudit } from '../middleware/auditLog';
import { paramId } from '../utils/params';
import { UserRole, ROLE_PERMISSIONS } from '../utils/permissions';
import { assertCanAssignRole, resolveAssignableRole } from '../utils/roleGuards';
import { sanitizeLoginId } from '../services/userMigrationService';

const loginDebug = process.env.LOGIN_DEBUG === 'true';

function logLoginStep(step: string, startedAt: number, extra?: Record<string, unknown>) {
  if (!loginDebug) return;
  console.info('[login]', step, { ms: Date.now() - startedAt, ...extra });
}

const loginIdSchema = z
  .string()
  .min(3, 'Login ID must be at least 3 characters')
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'Login ID can only contain letters, numbers, and underscore');

export const loginSchema = z.object({
  loginId: loginIdSchema,
  password: z.string().min(6),
});

export const registerSchema = z.object({
  name: z.string().min(2),
  loginId: loginIdSchema,
  email: z.string().email().optional(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export const updateCredentialsSchema = z
  .object({
    loginId: loginIdSchema.optional(),
    currentPassword: z.string().min(6),
    newPassword: z.string().min(6).optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((data) => !data.newPassword || data.newPassword === data.confirmPassword, {
    message: 'New password and confirmation do not match',
    path: ['confirmPassword'],
  });

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const startedAt = Date.now();
  logLoginStep('entry', startedAt, { loginId: (req.body as { loginId?: string })?.loginId });

  const { loginId, password } = req.body as z.infer<typeof loginSchema>;
  const normalizedLoginId = sanitizeLoginId(loginId);
  logLoginStep('validated', startedAt, { normalizedLoginId });

  const user = await User.findOne({ loginId: normalizedLoginId }).select('+password +refreshToken');
  logLoginStep('user_lookup', startedAt, { found: Boolean(user) });

  if (!user || !(await user.comparePassword(password))) {
    logLoginStep('password_compare_failed', startedAt);
    throw new ApiError(401, 'Invalid login ID or password');
  }
  logLoginStep('password_compare_ok', startedAt);

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated');
  }

  const payload = { id: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  logLoginStep('tokens_generated', startedAt);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save();
  logLoginStep('user_saved', startedAt);

  try {
    await AuditLog.create({
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user._id.toString(),
      user: user._id,
      userName: user.name,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      description: 'User logged in',
    });
  } catch (auditErr) {
    if (loginDebug) {
      console.error('[login] audit_log_failed', auditErr);
    }
  }
  logLoginStep('response', startedAt);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  ApiResponse.success(res, {
    user: {
      id: user._id,
      name: user.name,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    },
    accessToken,
  }, 'Login successful');
});

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, loginId, email, password, phone, role } = req.body as z.infer<typeof registerSchema>;
  const normalizedLoginId = sanitizeLoginId(loginId);

  const existing = await User.findOne({ loginId: normalizedLoginId });
  if (existing) throw new ApiError(409, 'Login ID already in use');

  if (email) {
    const emailTaken = await User.findOne({ email });
    if (emailTaken) throw new ApiError(409, 'Email already registered');
  }

  const user = await User.create({
    name,
    loginId: normalizedLoginId,
    email,
    password,
    phone,
    role: resolveAssignableRole(req.user!.role, role),
    createdBy: req.user?._id,
  });

  await logAudit(req, AuditAction.CREATE, 'User', user._id.toString());

  ApiResponse.success(
    res,
    { id: user._id, name: user.name, loginId: user.loginId, email: user.email, role: user.role },
    'User created',
    201
  );
});

export const updateCredentials = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { loginId, currentPassword, newPassword } = req.body as z.infer<typeof updateCredentialsSchema>;

  const user = await User.findById(req.user!._id).select('+password');
  if (!user) throw new ApiError(404, 'User not found');

  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect');
  }

  if (loginId) {
    const normalizedLoginId = sanitizeLoginId(loginId);
    if (normalizedLoginId !== user.loginId) {
      const taken = await User.findOne({ loginId: normalizedLoginId, _id: { $ne: user._id } });
      if (taken) throw new ApiError(409, 'Login ID already in use');
      user.loginId = normalizedLoginId;
    }
  }

  if (newPassword) {
    user.password = newPassword;
  }

  await user.save();
  await logAudit(req, AuditAction.UPDATE, 'User', user._id.toString(), {
    loginId: user.loginId,
    passwordChanged: Boolean(newPassword),
  });

  ApiResponse.success(
    res,
    {
      id: user._id,
      name: user.name,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    },
    'Login credentials updated'
  );
});

export const refreshAccessToken = asyncHandler(async (req: AuthRequest, res: Response) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, 'Refresh token required');

  const decoded = verifyRefreshToken(token);
  const user = await User.findById(decoded.id).select('+refreshToken');

  if (!user || user.refreshToken !== token) {
    throw new ApiError(401, 'Invalid refresh token');
  }

  const payload = { id: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(payload);

  ApiResponse.success(res, { accessToken }, 'Token refreshed');
});

export const logout = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: undefined });
    await logAudit(req, AuditAction.LOGOUT, 'User', req.user._id.toString());
  }

  res.clearCookie('refreshToken');
  ApiResponse.success(res, null, 'Logged out successfully');
});

export const getMe = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  ApiResponse.success(res, {
    id: user._id,
    name: user.name,
    loginId: user.loginId,
    email: user.email,
    role: user.role,
    phone: user.phone,
    permissions: ROLE_PERMISSIONS[user.role],
  });
});

export const getUsers = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users = await User.find().select('-password -refreshToken').sort({ createdAt: -1 });
  ApiResponse.success(res, users);
});

export const updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, phone, role, isActive } = req.body as z.infer<typeof updateUserSchema>;
  const existing = await User.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found');

  if (role !== undefined) {
    assertCanAssignRole(req.user!.role, role);
    if (existing.role === UserRole.SUPER_ADMIN && req.user!.role !== UserRole.SUPER_ADMIN) {
      throw new ApiError(403, 'Only super admin can modify super admin accounts');
    }
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { ...(name !== undefined && { name }), ...(phone !== undefined && { phone }), ...(role !== undefined && { role }), ...(isActive !== undefined && { isActive }) },
    { new: true, runValidators: true }
  ).select('-password -refreshToken');

  if (!user) throw new ApiError(404, 'User not found');
  await logAudit(req, AuditAction.UPDATE, 'User', user._id.toString(), { name, role, isActive });

  ApiResponse.success(res, user, 'User updated');
});

export const deleteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  await logAudit(req, AuditAction.DELETE, 'User', paramId(req.params.id));
  ApiResponse.success(res, null, 'User deleted');
});
