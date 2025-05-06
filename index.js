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
  console.log('▶️ Frame payload:', JSON.stringify(req.body));
  const { fid, buttonIndex, button_index } = req.body;

    if (!fid) return res.status(400).send('{"error":"FID missing"}');

    // 1) Asegura registro
    await pool.query(`
      INSERT INTO player_rewards (fid)
      VALUES ($1) ON CONFLICT (fid) DO NOTHING;
    `, [fid]);

    // 2) Detecta Claim (buttonIndex = 1)
    const isClaim = (buttonIndex == 1) || (button_index == 1);

    if (isClaim) {
      // Reclamación: +5 tokens
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

    // 3) Si no es Claim, mostrar saldo con el botón
    const { rows } = await pool.query(`
      SELECT virtual_balance
      FROM player_rewards
      WHERE fid = $1;
    `, [fid]);
    const balance = rows[0]?.virtual_balance ?? 0;
    res
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
    res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
