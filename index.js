// index.js
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Configura pool con Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

// Ruta de prueba GET
app.get('/', (req, res) => {
  res.send('¡Backend P2E funcionando!');
});

// → вставь aquí tu nueva ruta POST ⬇️
app.post('/api/frame', async (req, res) => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta name="fc:frame" content='{"version":"1","title":"P2E Demo","icon":"✨","buttonText":"Loading…"}'/>
      </head>
      <body>
        <h1>P2E Mode – No implementado aún</h1>
      </body>
    </html>`;
  res
    .status(501)          // Not Implemented
    .set('Content-Type', 'text/html')
    .send(html);
});
// ↑ fin de la ruta POST

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
