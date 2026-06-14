import { Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/tokens';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { paramId } from '../utils/params';
import { UserRole, ROLE_PERMISSIONS } from '../utils/permissions';
import { assertCanAssignRole, resolveAssignableRole } from '../utils/roleGuards';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

export const login = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password +refreshToken');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account is deactivated');
  }

  const payload = { id: user._id.toString(), role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save();

  await logAudit(req, AuditAction.LOGIN, 'User', user._id.toString(), undefined, 'User logged in');

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
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    },
    accessToken,
  }, 'Login successful');
});

export const register = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, email, password, phone, role } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, 'Email already registered');

  const user = await User.create({
    name,
    email,
    password,
    phone,
    role: resolveAssignableRole(req.user!.role, role),
    createdBy: req.user?._id,
  });

  await logAudit(req, AuditAction.CREATE, 'User', user._id.toString());

  ApiResponse.success(res, { id: user._id, name: user.name, email: user.email, role: user.role }, 'User created', 201);
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
