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
  try {
    // 1️⃣ Extraer datos del payload
    const { fid, buttonIndex, button_index, inputText, input_text } = req.body;
    if (!fid) return res.status(400).send('{"error":"FID missing"}');

    // 2️⃣ Asegurar registro del jugador
    await pool.query(
      `INSERT INTO player_rewards (fid)
       VALUES ($1)
       ON CONFLICT (fid) DO NOTHING;`,
      [fid]
    );

    // 3️⃣ Leer estado actual del jugador
    const { rows: info } = await pool.query(
      `SELECT virtual_balance, withdrawal_address
       FROM player_rewards
       WHERE fid = $1;`,
      [fid]
    );
    const balance = info[0].virtual_balance;
    let withdrawalAddress = info[0].withdrawal_address;

    // Constante: mínimo para retirar (ajústala)
    const MIN_WITHDRAWAL = 20;

    // 4️⃣ Si llega como Claim (buttonIndex=1) seguimos aumentando balance
    const claimIndex = buttonIndex ?? button_index;
    if (parseInt(claimIndex) === 1) {
      const { rows } = await pool.query(
        `UPDATE player_rewards
         SET virtual_balance = virtual_balance + 5
         WHERE fid = $1
         RETURNING virtual_balance;`,
        [fid]
      );
      const newBal = rows[0].virtual_balance;
      return res.set('Content-Type','text/html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{
            "version":"1",
            "title":"¡Reclamado!",
            "icon":"🎉",
            "buttonText":"Claim again"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ ¡Has reclamado 5 tokens!</h1>
          <p>Tu nuevo saldo: <strong>${newBal}</strong> tokens</p>
        </body></html>`);
    }

    // 5️⃣ Si no tienes withdrawal_address y llega inputText, lo guardamos
    const input = inputText ?? input_text;
    if (!withdrawalAddress && input) {
      // Aquí podrías validar que input arranque con "0x" y longitud 42
      withdrawalAddress = input;
      await pool.query(
        `UPDATE player_rewards
         SET withdrawal_address = $2
         WHERE fid = $1;`,
        [fid, withdrawalAddress]
      );
      return res.set('Content-Type','text/html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{
            "version":"1",
            "title":"Dirección guardada",
            "icon":"🏦",
            "buttonText":"Ok"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ Dirección guardada:</h1>
          <p><code>${withdrawalAddress}</code></p>
        </body></html>`);
    }

    // 6️⃣ Si no tienes withdrawal_address, mostrar input para pedirla
    if (!withdrawalAddress) {
      return res.set('Content-Type','text/html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{
            "version":"1",
            "title":"Configura Retiro",
            "icon":"🏦",
            "buttonText":"Guardar",
            "inputPlaceholder":"0x…",
            "buttonType":"text"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Introduce tu dirección Base para retiros:</h1>
        </body></html>`);
    }

    // 7️⃣ A estas alturas tienes withdrawalAddress
    //    — Si no llegas al mínimo, muestras cuánto falta
    if (balance < MIN_WITHDRAWAL) {
      const falta = MIN_WITHDRAWAL - balance;
      return res.set('Content-Type','text/html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{
            "version":"1",
            "title":"Saldo insuficiente",
            "icon":"⚠️",
            "buttonText":"Ok"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Saldo: ${balance} tokens</h1>
          <p>Te faltan <strong>${falta}</strong> tokens para retirar.</p>
        </body></html>`);
    }

    // 8️⃣ Si llegas al mínimo, mostramos botón "Request Withdrawal"
    return res.set('Content-Type','text/html').send(`
      <!doctype html><html><head>
        <meta name="fc:frame" content='{
          "version":"1",
          "title":"Retirar Tokens",
          "icon":"💸",
          "buttonText":"Request Withdrawal"
        }'/>
      </head><body style="font-family:sans-serif;text-align:center;">
        <h1>Saldo: ${balance} tokens</h1>
        <p>Se enviarán a: <code>${withdrawalAddress}</code></p>
      </body></html>`);

  } catch (err) {
    console.error("Error en /api/frame:", err);
    res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
