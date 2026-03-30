import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { ok } from './utils/apiResponse';
import { errorHandler } from './middleware/error';
import { ensureSeedAdmin } from './bootstrap/seedAdmin';
import authRouter from './routes/auth';
import agentsRouter from './routes/agents';
import runsRouter from './routes/runs';
import memoryRouter from './routes/memory';
import contentRouter from './routes/content';
import pipelineRouter from './routes/pipeline';
import leadgenRouter from './routes/leadgen';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json(ok({ status: 'ok' }));
});

app.use('/auth', authRouter);
app.use('/agents', agentsRouter);
app.use('/', runsRouter);
app.use('/memory', memoryRouter);
app.use('/', contentRouter);
app.use('/', pipelineRouter);
app.use('/leadgen', leadgenRouter);

app.use(errorHandler);

void ensureSeedAdmin();

// Start lead pipeline worker if Redis is available
import('./queue/leadPipelineWorker')
  .then(({ startLeadPipelineWorker }) => {
    try {
      startLeadPipelineWorker();
    } catch (err) {
      console.warn('[LeadPipeline] Worker startup skipped:', (err as Error).message);
    }
  })
  .catch(() => {
    console.warn('[LeadPipeline] Worker module not loaded — Redis may not be available');
  });

app.listen(Number(env.PORT), () => {
  console.log(`API listening on port ${env.PORT}`);
});
