import app from './app';
import { connectDB } from './config/database';
import { env } from './config/env';
import { ensureUserLoginIds } from './services/userMigrationService';
import { ensureProductSearchText } from './services/productSearchTextService';

const start = async () => {
  await connectDB();
  await ensureUserLoginIds();
  await ensureProductSearchText();

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
