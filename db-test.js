require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('SELECT NOW() AS "current_time"', (err, res) => {
  if (err) {
    console.error('🔴 Error al conectar:', err);
  } else {
    console.log('🟢 Conexión OK, hora DB:', res.rows[0].current_time);
  }
  pool.end();
});
