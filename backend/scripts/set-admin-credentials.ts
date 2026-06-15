/**
 * Create or update the super-admin login ID + password in MongoDB.
 *
 * Usage (PowerShell, from backend folder):
 *   $env:CONFIRM_SET_ADMIN="1"
 *   $env:ADMIN_LOGIN_ID="abcadmin"
 *   $env:ADMIN_PASSWORD="YourSecurePassword123"
 *   $env:ADMIN_NAME="Your Name"
 *   $env:MONGODB_URI="mongodb+srv://..."
 *   npm run set-admin
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/database';
import { User } from '../src/models/User';
import { UserRole } from '../src/utils/permissions';
import { sanitizeLoginId } from '../src/services/userMigrationService';

const run = async () => {
  if (process.env.CONFIRM_SET_ADMIN !== '1') {
    console.error('Refusing to run without CONFIRM_SET_ADMIN=1');
    process.exit(1);
  }

  const loginId = sanitizeLoginId(process.env.ADMIN_LOGIN_ID || 'admin');
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!password) {
    console.error('Set ADMIN_PASSWORD (min 6 characters).');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('ADMIN_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ loginId }).select('+password');
  if (existing) {
    existing.name = name;
    existing.password = password;
    existing.role = UserRole.SUPER_ADMIN;
    existing.isActive = true;
    await existing.save();
    console.log(`Super admin updated — login ID: ${loginId}`);
  } else {
    await User.create({
      name,
      loginId,
      password,
      role: UserRole.SUPER_ADMIN,
    });
    console.log(`Super admin created — login ID: ${loginId}`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
