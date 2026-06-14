import app from './app';
import { connectDB } from './config/database';
import { env } from './config/env';

const start = async () => {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
