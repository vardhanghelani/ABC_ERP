import { User } from '../models/User';

export function sanitizeLoginId(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return cleaned.slice(0, 32) || 'user';
}

/** Backfill loginId for users created before login-ID auth (e.g. from email prefix). */
export async function ensureUserLoginIds(): Promise<void> {
  const users = await User.find({
    $or: [{ loginId: { $exists: false } }, { loginId: null }, { loginId: '' }],
  });

  for (const user of users) {
    const fromEmail = user.email?.split('@')[0] ?? user.name ?? 'user';
    let base = sanitizeLoginId(fromEmail);
    let loginId = base;
    let suffix = 1;

    while (await User.findOne({ loginId, _id: { $ne: user._id } })) {
      loginId = sanitizeLoginId(`${base}${suffix}`);
      suffix += 1;
    }

    user.loginId = loginId;
    await user.save();
  }
}
