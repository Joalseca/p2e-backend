require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Pool de Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Parseo de JSON
app.use(express.json());

// Ruta de prueba GET
app.get('/', (req, res) => {
  res.send('¡Backend P2E funcionando!');
});

// NUEVO: Endpoint P2E para Farcaster Frames
app.post('/api/frame', async (req, res) => {
  try {
    // 1. Extraer el FID del payload
    // En producción deberás validar la firma de Farcaster Frame primero
    const fid = req.body.fid;
    if (!fid) {
      return res.status(400).send('{"error":"FID missing"}');
    }

    // 2. Asegurar que el jugador exista (inserción si no)
    await pool.query(
      `INSERT INTO player_rewards (fid)
       VALUES ($1)
       ON CONFLICT (fid) DO NOTHING;`,
      [fid]
    );

    // 3. Leer su saldo actual
    const { rows } = await pool.query(
      `SELECT virtual_balance
       FROM player_rewards
       WHERE fid = $1;`,
      [fid]
    );
    const balance = rows[0]?.virtual_balance ?? 0;

    // 4. Devolver un Frame HTML con su saldo
    const html = `
      <!doctype html>
      <html>
        <head>
          <meta name="fc:frame" content='{
            "version":"1",
            "title":"P2E Balance",
            "icon":"💰",
            "buttonText":"Claim"
          }'/>
        </head>
        <body style="font-family:sans-serif; text-align:center;">
          <h1>👋 ¡Hola, jugador ${fid}!</h1>
          <p>Tu saldo virtual: <strong>${balance}</strong> tokens</p>
        </body>
      </html>`;

    res.set('Content-Type', 'text/html').send(html);

  } catch (err) {
    console.error("Error en /api/frame:", err);
    res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
