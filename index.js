require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { ethers } = require('ethers');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Ethers.js setup
tconst provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet    = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const token     = new ethers.Contract(
  process.env.TOKEN_ADDRESS,
  [
    "function transfer(address to,uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
  ],
  wallet
);

app.use(express.json());

// Main Frame endpoint
app.post('/api/frame', async (req, res) => {
  try {
    console.log('▶️ Payload:', JSON.stringify(req.body));
    const { fid, buttonIndex, button_index, inputText, input_text } = req.body;
    if (!fid) {
      return res.status(400).send('{"error":"FID missing"}');
    }

    // Ensure player exists
    await pool.query(
      `INSERT INTO player_rewards (fid)
       VALUES ($1)
       ON CONFLICT (fid) DO NOTHING;`,
      [fid]
    );

    // Get current state
    const { rows } = await pool.query(
      `SELECT virtual_balance, withdrawal_address
       FROM player_rewards
       WHERE fid = $1;`,
      [fid]
    );
    const balance = rows[0].virtual_balance;
    let withdrawalAddress = rows[0].withdrawal_address;

    const MIN_WITHDRAWAL = 20;
    const REWARD_AMOUNT = 5;
    const actionIdx = parseInt(buttonIndex ?? button_index);

    // 1) Save withdrawal address if provided
    const input = inputText ?? input_text;
    if (!withdrawalAddress && input) {
      withdrawalAddress = input;
      await pool.query(
        `UPDATE player_rewards
         SET withdrawal_address = $2
         WHERE fid = $1;`,
        [fid, withdrawalAddress]
      );
      return res.type('html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{"version":"1","title":"Dirección guardada","icon":"🏦","buttonText":"Ok"}'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ Dirección guardada</h1>
          <p><code>${withdrawalAddress}</code></p>
        </body></html>`);
    }

    // 2) Ask for address if missing
    if (!withdrawalAddress) {
      return res.type('html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{"version":"1","title":"Configurar Retiro","icon":"🏦","buttonText":"Guardar","inputPlaceholder":"0x…","buttonType":"text"}'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Introduce tu dirección Base para retiros:</h1>
        </body></html>`);
    }

    // 3) Handle on-chain withdrawal
    if (withdrawalAddress && balance >= MIN_WITHDRAWAL && actionIdx === 1) {
      // Convert balance to token units
      const decimals = await token.decimals();
      const amount = ethers.utils.parseUnits(balance.toString(), decimals);

      let tx;
      try {
        tx = await token.transfer(withdrawalAddress, amount);
        await tx.wait();
      } catch (err) {
        console.error('❌ Error al transferir tokens:', err);
        return res.type('html').send(`
          <!doctype html><html><head>
            <meta name="fc:frame" content='{"version":"1","title":"Error","icon":"❌","buttonText":"Ok"}'/>
          </head><body style="font-family:sans-serif;text-align:center;">
            <h1>¡Falló la transferencia!</h1>
            <p>${err.message}</p>
          </body></html>`);
      }

      // Reset off-chain balance
      await pool.query(
        `UPDATE player_rewards
         SET virtual_balance = 0
         WHERE fid = $1;`,
        [fid]
      );

      return res.type('html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{"version":"1","title":"Retiro enviado","icon":"✅","buttonText":"Ok"}'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ Retiro iniciado</h1>
          <p>TxHash:</p>
          <code>${tx.hash}</code>
        </body></html>`);
    }

    // 4) Claim off-chain reward
    if (actionIdx === 1) {
      const upd = await pool.query(
        `UPDATE player_rewards
         SET virtual_balance = virtual_balance + $2
         WHERE fid = $1
         RETURNING virtual_balance;`,
        [fid, REWARD_AMOUNT]
      );
      const newBal = upd.rows[0].virtual_balance;
      return res.type('html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{"version":"1","title":"¡Reclamado!","icon":"🎉","buttonText":"Claim again"}'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>✅ Has reclamado ${REWARD_AMOUNT} tokens</h1>
          <p>Nuevo saldo: <strong>${newBal}</strong> tokens</p>
        </body></html>`);
    }

    // 5) Insufficient balance
    if (balance < MIN_WITHDRAWAL) {
      const falta = MIN_WITHDRAWAL - balance;
      return res.type('html').send(`
        <!doctype html><html><head>
          <meta name="fc:frame" content='{"version":"1","title":"Saldo insuficiente","icon":"⚠️","buttonText":"Ok"}'/>
        </head><body style="font-family:sans-serif;text-align:center;">
          <h1>Saldo: ${balance} tokens</h1>
          <p>Te faltan <strong>${falta}</strong> tokens para retirar.</p>
        </body></html>`);
    }

    // 6) Default: show request withdrawal
    return res.type('html').send(`
      <!doctype html><html><head>
        <meta name="fc:frame" content='{"version":"1","title":"Retirar","icon":"💸","buttonText":"Request Withdrawal"}'/>
      </head><body style="font-family:sans-serif;text-align:center;">
        <h1>Saldo: ${balance} tokens</h1>
        <p>Se enviarán a: <code>${withdrawalAddress}</code></p>
      </body></html>`);

  } catch (err) {
    console.error('❌ Error en /api/frame:', err);
    res.status(500).send('{"error":"Internal server error"}');
  }
});

app.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
