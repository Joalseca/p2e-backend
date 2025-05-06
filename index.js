require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

app.post('/api/frame', async (req, res) => {
  // 1) Para depuración
  console.log('▶️ Frame payload:', JSON.stringify(req.body));

  try {
    const { fid, buttonIndex, button_index } = req.body;
    if (!fid) {
      return res.status(400).send('{"error":"FID missing"}');
    }

    // 2) Asegurar que el jugador existe
    await pool.query(`
      INSERT INTO player_rewards (fid)
      VALUES ($1) ON CONFLICT (fid) DO NOTHING;
    `, [fid]);

    // 3) Detectar Claim (Farcaster suele enviar buttonIndex=1)
    const claimIndex = buttonIndex ?? button_index;
    const isClaim = parseInt(claimIndex) === 1;

    if (isClaim) {
      // +5 tokens al pulsar "Claim"
      const { rows } = await pool.query(`
        UPDATE player_rewards
        SET virtual_balance = virtual_balance + 5
        WHERE fid = $1
        RETURNING virtual_balance;
      `, [fid]);
      const newBalance = rows[0].virtual_balance;

      return res
        .set('Content-Type','text/html')
        .send(`
          <!doctype html>
          <html>
            <head>
              <meta name="fc:frame" content='{
                "version":"1",
                "title":"¡Reclamado!",
                "icon":"🎉",
                "buttonText":"Claim again"
              }'/>
            </head>
            <body style="font-family:sans-serif; text-align:center;">
              <h1>✅ ¡Has reclamado 5 tokens!</h1>
              <p>Tu nuevo saldo: <strong>${newBalance}</strong> tokens</p>
            </body>
          </html>`);
    }

    // 4) Si no es Claim, mostrar saldo actual y botón
    const { rows } = await pool.query(`
      SELECT virtual_balance
      FROM player_rewards
      WHERE fid = $1;
    `, [fid]);
    const balance = rows[0]?.virtual_balance ?? 0;

    return res
      .set('Content-Type','text/html')
      .send(`
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
        </html>`);
  } catch (err) {
    console.error("Error en /api/frame:", err);
    return res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
