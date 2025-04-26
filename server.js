const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const webpush = require('web-push');  // Importa a biblioteca web-push

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'caminhadas.db');

// Defina as suas chaves públicas e privadas para Web Push
const publicVapidKey = 'YOUR_PUBLIC_VAPID_KEY';  // Substitua pela sua chave pública
const privateVapidKey = 'YOUR_PRIVATE_VAPID_KEY';  // Substitua pela sua chave privada

// Configure as chaves do VAPID
webpush.setVapidDetails(
    'mailto:seu-email@dominio.com', // Defina seu email aqui
    publicVapidKey,
    privateVapidKey
);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'views')));

// Conexão com banco e criação da tabela
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('Erro ao abrir o banco de dados', err);
    process.exit(1);
  }
  console.log('Conectado ao SQLite em', DB_PATH);

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS historico_caminhada (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      tempo DECIMAL,
      distancia DECIMAL,
      ritmo TEXT
    )
  `;
  db.run(createTableSQL, err => {
    if (err) {
      console.error('Erro ao criar tabela:', err);
    } else {
      console.log("Tabela 'historico_caminhada' pronta.");
    }
  });
});

// Rota API - inserir
app.post('/api/historico', (req, res) => {
  const { data, tempo, distancia, ritmo, subscription } = req.body;  // Agora recebemos a 'subscription' para notificação

  const insertSQL = `
    INSERT INTO historico_caminhada (data_inicio, tempo, distancia, ritmo)
    VALUES (?, ?, ?, ?)
  `;

  db.run(insertSQL, [data, tempo, distancia, ritmo], function(err) {
    if (err) {
      console.error('Erro ao salvar caminhada:', err);
      return res.status(500).json({ error: 'Falha ao salvar caminhada.' });
    }

    // Envia a notificação Web Push
    if (subscription) {
      const payload = JSON.stringify({
        title: "Boa caminhada!",
        body: `Você já andou ${distancia} km! Continue assim!`
      });

      webpush.sendNotification(subscription, payload)
        .catch(err => console.error('Erro ao enviar notificação Web Push:', err));
    }

    res.status(201).json({
      message: 'Caminhada salva com sucesso!',
      id: this.lastID
    });
  });
});

// Rota API - buscar
app.get('/api/historico', (req, res) => {
  const selectSQL = `
    SELECT id, data_inicio AS data, tempo, distancia, ritmo
    FROM historico_caminhada
    ORDER BY data_inicio DESC
  `;
  db.all(selectSQL, [], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar histórico:', err);
      return res.status(500).json({ error: 'Falha ao carregar histórico.' });
    }
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
