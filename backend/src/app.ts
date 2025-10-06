import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database';
import usersRoutes from './routes/users';
import { CronService } from './services/CronService';
import { sourcesRoutes } from './routes/sources';
import authMiddleware from './middlewares/auth';
import { newsRoutes } from './routes/news';
import authRoutes from './routes/auth';
import './services/TelegramBot';

const app = express();
const cronService = new CronService();

app.use(cors());
app.use(express.json());

connectDB();

// Initialize and start cron service with deduplication
(async () => {
  try {
    await cronService.initialize();
    cronService.start();
  } catch (error) {
    console.error('Failed to initialize CronService:', error);
  }
})();

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);

app.use(authMiddleware);

app.use('/api/users', usersRoutes);
app.use('/api/sources', sourcesRoutes);
app.use('/api/news', newsRoutes);

export default app;
