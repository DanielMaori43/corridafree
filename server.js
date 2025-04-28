// Importação dos módulos necessários
const express = require('express');          // Framework para criar servidor HTTP
const sqlite3 = require('sqlite3').verbose(); // Driver para conectar e manipular banco SQLite
const path = require('path');                 // Utilitário para lidar com caminhos de arquivos
const webpush = require('web-push');           // Biblioteca para envio de notificações Push Web

const app = express();                        // Criação da aplicação Express
const PORT = process.env.PORT || 3000;         // Porta do servidor
const DB_PATH = path.join(__dirname, 'caminhadas.db'); // Caminho do banco de dados

// Configuração das chaves VAPID (Web Push Notifications)
const publicVapidKey = '...';    // Substituir pela sua chave pública
const privateVapidKey = '...';   // Substituir pela sua chave privada
webpush.setVapidDetails(
  'mailto:projetositeviagens@gmail.com',       // Email de contato
  publicVapidKey,
  privateVapidKey
);

// Middleware para impedir que respostas sejam armazenadas em cache
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Middleware para interpretar o corpo das requisições como JSON
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta 'views'
app.use(express.static(path.join(__dirname, 'views')));

// Conexão e criação das tabelas do banco de dados
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('Erro ao abrir banco de dados', err);
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
  db.exec(createTableSQL, err => {
    if (err) {
      console.error('Erro ao criar tabelas:', err);
    } else {
      console.log('Tabelas criadas ou já existentes.');
    }
  });
});

// Rota para receber inscrição de push notification
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;

  const insertSQL = `
    INSERT INTO subscriptions (endpoint, keys) 
    VALUES (?, ?)
  `;

  db.run(insertSQL, [subscription.endpoint, JSON.stringify(subscription.keys)], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erro ao salvar inscrição no servidor' });
    }
    res.status(201).json({ message: 'Inscrição salva com sucesso!' });
  });
});

// Rota para salvar dados de uma caminhada
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

    // Se houver uma inscrição, envia notificação
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
      id: this.lastID // ID da caminhada recém-criada
    });
  });
});

// Rota para listar todas as caminhadas registradas
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

// >>> NOVA FUNÇÃO: Excluir uma caminhada pelo ID
app.delete('/api/historico/:id', (req, res) => {
  const { id } = req.params;

  const deleteSQL = `
    DELETE FROM historico_caminhada
    WHERE id = ?
  `;

  db.run(deleteSQL, [id], function(err) {
    if (err) {
      console.error('Erro ao deletar caminhada:', err);
      return res.status(500).json({ error: 'Falha ao deletar caminhada.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Caminhada não encontrada.' });
    }
    res.json({ message: 'Caminhada deletada com sucesso!' });
  });
});

// Inicializa o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
