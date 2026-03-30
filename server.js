require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize database table
const initDb = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS application_state (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database table application_state is ready.');

    const res = await pool.query('SELECT id FROM application_state LIMIT 1');
    if (res.rowCount === 0) {
      console.log('Inserting initial empty state...');
      await pool.query('INSERT INTO application_state (data) VALUES ($1)', ['{}']);
    }
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1); // Exit if DB is unreachable at startup
  }
};

initDb();

// GET /api/data — read current state
app.get('/api/data', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data FROM application_state ORDER BY id DESC LIMIT 1'
    );
    if (result.rowCount > 0 && Object.keys(result.rows[0].data).length > 0) {
      res.json(result.rows[0].data);
    } else {
      res.json({});
    }
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/data — write new state
app.post('/api/data', async (req, res) => {
  try {
    const payload = req.body;

    if (payload.action === 'write' && payload.data) {
      // FIX: Use INSERT ... ON CONFLICT so it always works even if the row was deleted
      const result = await pool.query(
        `UPDATE application_state
         SET data = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT id FROM application_state ORDER BY id ASC LIMIT 1)
         RETURNING id`,
        [JSON.stringify(payload.data)]
      );

      // If no rows were updated (table was empty), insert a new row
      if (result.rowCount === 0) {
        await pool.query(
          'INSERT INTO application_state (data) VALUES ($1)',
          [JSON.stringify(payload.data)]
        );
      }

      res.json({ ok: true });
    } else {
      res.status(400).json({ error: 'Invalid payload format. Expected { action: "write", data: {...} }' });
    }
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`WMS Server running at http://localhost:${port}`);
});
