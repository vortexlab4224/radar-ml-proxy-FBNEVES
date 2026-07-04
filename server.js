// Radar ML — Proxy de autenticação
// Guarda o Client ID / Client Secret da aplicação no servidor (nunca no navegador)
// e renova o access_token sozinho via grant_type=client_credentials.
// A "moça" nunca vê token nenhum — o front-end só chama este servidor.

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors()); // libera chamadas vindas do arquivo HTML (rodando em qualquer origem/arquivo local)

const CLIENT_ID = process.env.ML_CLIENT_ID;
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltam as variáveis de ambiente ML_CLIENT_ID e ML_CLIENT_SECRET.');
  process.exit(1);
}

let cachedToken = null;
let expiresAt = 0;

async function getAppToken() {
  if (cachedToken && Date.now() < expiresAt) return cachedToken;

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Falha ao gerar token do app: ' + res.status + ' ' + body);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // renova 60s antes de expirar, por segurança
  expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function mlGet(path) {
  const token = await getAppToken();
  const res = await fetch('https://api.mercadolibre.com' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// GET /api/item/MLB123456789 -> dados públicos do anúncio
app.get('/api/item/:id', async (req, res) => {
  try {
    const { status, data } = await mlGet('/items/' + req.params.id);
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/user/123456 -> reputação/perfil público do vendedor
app.get('/api/user/:id', async (req, res) => {
  try {
    const { status, data } = await mlGet('/users/' + req.params.id);
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/product/MLB33979786 -> ficha de catálogo (pra resolver o vendedor que está no buy box)
app.get('/api/product/:id', async (req, res) => {
  try {
    const { status, data } = await mlGet('/products/' + req.params.id);
    res.status(status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('Radar ML proxy no ar.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Radar ML proxy rodando na porta ' + PORT));
