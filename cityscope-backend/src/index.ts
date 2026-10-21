import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { cityRouter } from './routes/cities.js';
import { districtRouter } from './routes/districts.js';
import { poiRouter } from './routes/pois.js';
import { reachRouter } from './routes/reach.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
}));
// Isochrone contour payloads are small (measured: 3 KB walking, 27 KB for a
// 30-minute driving isochrone) but the 100 KB default leaves little headroom,
// so state the limit explicitly.
app.use(express.json({ limit: '512kb' }));

// City-scoped routes
app.use('/api/cities', cityRouter);
app.use('/api/cities/:cityId/districts', districtRouter);
app.use('/api/cities/:cityId/pois', poiRouter);
app.use('/api/cities/:cityId/reach', reachRouter);

// Legacy routes (default to Berlin)
app.use('/api/districts', districtRouter);
app.use('/api/pois', poiRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
