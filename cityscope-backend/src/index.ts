import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { cityRouter } from './routes/cities.js';
import { districtRouter } from './routes/districts.js';
import { poiRouter } from './routes/pois.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

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
