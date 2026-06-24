import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { User } from '../models/User';
import { Category } from '../models/Category';
import { CategoryField, FieldType } from '../models/CategoryField';
import { Settings, DEFAULT_SETTINGS } from '../models/Settings';
import { UserRole } from '../utils/permissions';

const seed = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run seed in production. Aborting.');
    process.exit(1);
  }

  await connectDB();

  // Settings
  for (const setting of DEFAULT_SETTINGS) {
    await Settings.findOneAndUpdate({ key: setting.key }, setting, { upsert: true });
  }
  console.log('Settings seeded');

  // Super Admin
  const adminExists = await User.findOne({ loginId: 'admin' });
  if (!adminExists) {
    await User.create({
      name: 'Super Admin',
      loginId: 'admin',
      password: 'admin123',
      role: UserRole.SUPER_ADMIN,
    });
    console.log('Super Admin created: login ID "admin" / password "admin123" — change in Settings → Login');
  }

  // Sample Categories
  const categories = [
    { name: 'Chains', code: 'CHN', barcodePrefix: 'CHN', description: 'Imitation jewellery chains' },
    { name: 'AD Stones', code: 'ADS', barcodePrefix: 'ADS', description: 'American Diamond stones' },
    { name: 'Glass Stones', code: 'GLS', barcodePrefix: 'GLS', description: 'Glass stones and beads' },
    { name: 'Marble Pieces', code: 'MBL', barcodePrefix: 'MBL', description: 'Marble decorative pieces' },
    { name: 'Metal Components', code: 'MTL', barcodePrefix: 'MTL', description: 'Metal findings and components' },
  ];

  for (const cat of categories) {
    const existing = await Category.findOne({ code: cat.code });
    if (!existing) {
      const admin = await User.findOne({ role: UserRole.SUPER_ADMIN });
      const category = await Category.create({ ...cat, createdBy: admin!._id });

      // Sample fields per category
      const fieldMap: Record<string, { name: string; key: string; fieldType: FieldType }[]> = {
        CHN: [
          { name: 'Material', key: 'material', fieldType: FieldType.TEXT },
          { name: 'Color', key: 'color', fieldType: FieldType.TEXT },
          { name: 'Length', key: 'length', fieldType: FieldType.INTEGER },
          { name: 'Roll Weight', key: 'roll_weight', fieldType: FieldType.DECIMAL },
          { name: 'Finish', key: 'finish', fieldType: FieldType.TEXT },
        ],
        ADS: [
          { name: 'Naka (Hook)', key: 'naka', fieldType: FieldType.INTEGER },
          { name: 'Shape', key: 'shape', fieldType: FieldType.TEXT },
          { name: 'Color', key: 'color', fieldType: FieldType.TEXT },
          { name: 'Size', key: 'size', fieldType: FieldType.TEXT },
          { name: 'Grade', key: 'grade', fieldType: FieldType.TEXT },
        ],
        GLS: [
          { name: 'Naka (Hook)', key: 'naka', fieldType: FieldType.INTEGER },
          { name: 'Shape', key: 'shape', fieldType: FieldType.TEXT },
          { name: 'Color', key: 'color', fieldType: FieldType.TEXT },
          { name: 'Size', key: 'size', fieldType: FieldType.TEXT },
        ],
        MBL: [
          { name: 'Naka (Hook)', key: 'naka', fieldType: FieldType.INTEGER },
          { name: 'Color', key: 'color', fieldType: FieldType.TEXT },
          { name: 'Size', key: 'size', fieldType: FieldType.TEXT },
          { name: 'Weight', key: 'weight', fieldType: FieldType.DECIMAL },
        ],
        MTL: [
          { name: 'Naka (Hook)', key: 'naka', fieldType: FieldType.INTEGER },
          { name: 'Material', key: 'material', fieldType: FieldType.TEXT },
          { name: 'Finish', key: 'finish', fieldType: FieldType.TEXT },
          { name: 'Size', key: 'size', fieldType: FieldType.TEXT },
        ],
      };

      const fields = fieldMap[cat.code] || [];
      for (let i = 0; i < fields.length; i++) {
        await CategoryField.create({ ...fields[i], category: category._id, sortOrder: i, required: i < 2 });
      }
      console.log(`Category ${cat.name} with ${fields.length} fields created`);
    }
  }

  console.log('Seed completed successfully');
  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
