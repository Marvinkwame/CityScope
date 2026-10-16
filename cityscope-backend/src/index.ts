import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { cityRouter } from './routes/cities.js';
import { districtRouter } from './routes/districts.js';
import { poiRouter } from './routes/pois.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
}));
// Isochrone contour payloads are small (measured: 3 KB walking, 27 KB for a
// 30-minute driving isochrone) but the 100 KB default leaves little headroom,
// so state the limit explicitly.
app.use(express.json({ limit: '512kb' }));

// Keep-warm target. An outside scheduler calls this every 10 minutes so
// Render's free tier never reaches its 15-minute idle spin-down. It skips the
// database on purpose: Neon's free compute allowance can't cover staying awake
// around the clock, and Neon wakes on the next real query anyway.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// City-scoped routes
app.use('/api/cities', cityRouter);
app.use('/api/cities/:cityId/districts', districtRouter);
app.use('/api/cities/:cityId/pois', poiRouter);

// Legacy routes (default to Berlin)
app.use('/api/districts', districtRouter);
app.use('/api/pois', poiRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
