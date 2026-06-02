import pg from 'pg';
import 'dotenv/config';

// Neon (and most managed Postgres providers) require SSL.
// Disable SSL for local connections to avoid certificate errors in dev.
const ssl = process.env.DATABASE_URL?.includes('localhost')
  ? false
  : { rejectUnauthorized: false };

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
});

export default pool;
