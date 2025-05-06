require('dotenv').config();

// Verificar ruta del fichero que se está ejecutando
console.log('🛠️ Ejecutando:', __filename);

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
    console.log('▶️ Payload:', JSON.stringify(req.body));

    // 1️⃣ Extraer datos
    const { fid, buttonIndex, button_index, inputText, input_text } = req.body;
    if (!fid) return res.status(400).send('{"error":"FID missing"}');

    // 2️⃣ Asegurar registro
    await pool.query(
      `INSERT INTO player_rewards (fid) VALUES ($1) ON CONFLICT (fid) DO NOTHING;`,
      [fid]
    );

    // 3️⃣ Leer estado
    const { rows } = await pool.query(
      `SELECT virtual_balance, withdrawal_address FROM player_rewards WHERE fid = $1;`,
      [fid]
    );
    const balance = rows[0].virtual_balance;
    let withdrawalAddress = rows[0].withdrawal_address;

    // 4️⃣ Claim: +5 tokens si buttonIndex (o button_index) = 1
    const claimIdx = buttonIndex ?? button_index;
    if (parseInt(claimIdx) === 1) {
      const upd = await pool.query(
        `UPDATE player_rewards
         SET virtual_balance = virtual_balance + 5
         WHERE fid = $1
         RETURNING virtual_balance;`,
        [fid]
      );
      const newBal = upd.rows[0].virtual_balance;
      return res.type('html').send(`
        <!doctype html>
        <html><head>
          <meta name="fc:frame" content='{
            "version":"1","title":"¡Reclamado!","icon":"🎉","buttonText":"Claim again"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ ¡Has reclamado 5 tokens!</h1>
          <p>Tu nuevo saldo: <strong>${newBal}</strong> tokens</p>
        </body></html>`);
    }

    // 5️⃣ Guardar dirección si viene inputText
    const input = inputText ?? input_text;
    if (!withdrawalAddress && input) {
      withdrawalAddress = input;
      await pool.query(
        `UPDATE player_rewards SET withdrawal_address = $2 WHERE fid = $1;`,
        [fid, withdrawalAddress]
      );
      return res.type('html').send(`
        <!doctype html>
        <html><head>
          <meta name="fc:frame" content='{
            "version":"1","title":"Dirección guardada","icon":"🏦","buttonText":"Ok"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ Dirección guardada</h1>
          <p><code>${withdrawalAddress}</code></p>
        </body></html>`);
    }

    // 6️⃣ Si no hay dirección, pedimos que la ingrese
    if (!withdrawalAddress) {
      return res.type('html').send(`
        <!doctype html>
        <html><head>
          <meta name="fc:frame" content='{
            "version":"1","title":"Configurar Retiro","icon":"🏦",
            "buttonText":"Guardar","inputPlaceholder":"0x…","buttonType":"text"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Introduce tu dirección Base:</h1>
        </body></html>`);
    }

    // 7️⃣ Si la tienes pero saldo insuficiente
    const MIN_WITHDRAWAL = 20;
    if (balance < MIN_WITHDRAWAL) {
      const falta = MIN_WITHDRAWAL - balance;
      return res.type('html').send(`
        <!doctype html>
        <html><head>
          <meta name="fc:frame" content='{
            "version":"1","title":"Saldo insuficiente","icon":"⚠️","buttonText":"Ok"
          }'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Saldo: ${balance} tokens</h1>
          <p>Te faltan <strong>${falta}</strong> tokens para retirar.</p>
        </body></html>`);
    }

    // 8️⃣ Tienes dirección y saldo suficiente → botón Request Withdrawal
    return res.type('html').send(`
      <!doctype html>
      <html><head>
        <meta name="fc:frame" content='{
          "version":"1","title":"Retirar","icon":"💸","buttonText":"Request Withdrawal"
        }'/>
      </head><body style="font-family:sans-serif;text-align:center;">
        <h1>Saldo: ${balance} tokens</h1>
        <p>Se enviarán a: <code>${withdrawalAddress}</code></p>
      </body></html>`);

  } catch (e) {
    console.error('❌ Error en /api/frame:', e);
    res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => console.log(`Servidor en http://localhost:${port}`));
