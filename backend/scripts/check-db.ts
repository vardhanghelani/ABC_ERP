import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const { databases } = await mongoose.connection.db!.admin().listDatabases();
  console.log('All databases on cluster:');
  for (const db of databases) {
    console.log(`  - ${db.name}`);
  }

  const dbName = mongoose.connection.name;
  const cols = await mongoose.connection.db!.listCollections().toArray();
  console.log(`\nDatabase in use: "${dbName}"`);
  console.log(`Collections (${cols.length}):`);
  for (const col of cols) {
    const count = await mongoose.connection.db!.collection(col.name).countDocuments();
    console.log(`  - ${col.name}: ${count} documents`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
