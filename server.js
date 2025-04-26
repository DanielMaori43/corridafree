const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const webpush = require('web-push');  // Importa a biblioteca web-push

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'caminhadas.db');

// Defina as suas chaves públicas e privadas para Web Push
const publicVapidKey = 'BFdXjAtR3fgd2FWlhKUNdKS6kapmTVPolRw-vWvQKCreMsSh4sPAMwd7lnF5p5ZbdXYZ3JhhFsGDKFfKD2C2C7c';  // Substitua pela sua chave pública
const privateVapidKey = '4af7E8gwxVBf2aiuBBFjcVm54RvzMfKF5ysQkcUcNHY';  // Substitua pela sua chave privada

// Configure as chaves do VAPID
webpush.setVapidDetails(
    'mailto:projetositeviagens@gmail.com', // Defina seu email aqui
    publicVapidKey,
    privateVapidKey
);

// Middleware para impedir o cache de respostas
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); // Impede o cache de respostas
  next();
});

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
    );
    
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL,
      keys TEXT NOT NULL
    );
  `;
  db.run(createTableSQL, err => {
    if (err) {
      console.error('Erro ao criar tabela:', err);
    } else {
      console.log("Tabelas criadas ou já existentes.");
    }
  });
});

// Rota API - inscrição para notificações
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body; // Inscrição recebida do cliente

  console.log('Inscrição recebida:', subscription);

  const insertSQL = `
    INSERT INTO subscriptions (endpoint, keys) 
    VALUES (?, ?)
  `;
  
  // Salvando a inscrição no banco de dados
  db.run(insertSQL, [subscription.endpoint, JSON.stringify(subscription.keys)], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao salvar inscrição no servidor' });
    }
    res.status(201).json({ message: 'Inscrição salva com sucesso!' });
  });
});

// Rota API - inserir histórico de caminhada
app.post('/api/historico', (req, res) => {
  const { data, tempo, distancia, ritmo, subscription } = req.body;

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

// Rota API - buscar histórico de caminhadas
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
