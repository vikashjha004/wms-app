require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
// Need a larger body limit for the potentially large JSON payload
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
        
        // Ensure there is at least one row
        const res = await pool.query('SELECT id FROM application_state LIMIT 1');
        if (res.rowCount === 0) {
            console.log('Inserting initial empty state...');
            await pool.query('INSERT INTO application_state (data) VALUES ($1)', ['{}']);
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
};

initDb();

// GET /api/data endpoint (mimics ?action=read)
app.get('/api/data', async (req, res) => {
    try {
        const result = await pool.query('SELECT data FROM application_state ORDER BY id DESC LIMIT 1');
        if (result.rowCount > 0 && Object.keys(result.rows[0].data).length > 0) {
            res.json(result.rows[0].data);
        } else {
            // Send empty object and let the frontend rely on its getDefaultDB
            res.json({}); 
        }
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/data endpoint (mimics action='write')
app.post('/api/data', async (req, res) => {
    try {
        const payload = req.body;
        
        // Frontend sends: { action: 'write', data: { users, projects, leadAssignments, assocAssignments, trackerEntries } }
        if (payload.action === 'write' && payload.data) {
            // Update the single row or insert a new one
            // We'll update the first row to act as a singleton
            await pool.query(
                `UPDATE application_state SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT id FROM application_state ORDER BY id ASC LIMIT 1)`,
                [JSON.stringify(payload.data)]
            );
            res.json({ ok: true });
        } else {
            res.status(400).json({ error: 'Invalid payload format' });
        }
    } catch (err) {
        console.error('Error saving data:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
