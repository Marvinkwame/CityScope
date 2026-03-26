import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { districtRouter } from './routes/districts.js';
import { poiRouter } from './routes/pois.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: 'http://localhost:5174' }));
app.use(express.json());

app.use('/api/districts', districtRouter);
app.use('/api/pois', poiRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
