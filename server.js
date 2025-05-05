// Importação dos módulos necessários
const express = require('express');              // Framework para criar o servidor web
const sqlite3 = require('sqlite3').verbose();    // Biblioteca para interagir com o banco SQLite
const path = require('path');                    // Utilitário para manipular caminhos de arquivos
const webpush = require('web-push');             // Biblioteca para envio de notificações push

// Inicialização da aplicação Express
const app = express();
const PORT = process.env.PORT || 3000;           // Define a porta (por variável de ambiente ou 3000 padrão)
const DB_PATH = path.join(__dirname, 'caminhadas.db'); // Caminho para o arquivo do banco de dados

// Módulo para tarefas agendadas (cron)
const cron = require("node-cron");

// Tarefa agendada para rodar a cada 14 minutos
cron.schedule('*/14 * * * *', async () => {
    const res = await fetch(url);                // Faz uma requisição à URL (URL precisa estar definida)
    const status = res.status;                   // Salva o status da resposta
    // OBS: status =- res.status está incorreto, deveria ser apenas = res.status
});

// Chaves públicas e privadas para envio de notificações push (substituir pelas suas em produção)
const publicVapidKey = 'BCa1XcQTdyOQU_QKNlHKjo7cYnGQBKc8h8u5DSRKrYEB2iYP2Bq2vhlddz-TntdCpu7oJfoXUR_2KgWsSrb8tm8';
const privateVapidKey = 'v9HMSf_LVQmRTe3-dalykeSf4CYDsggFKt3phADQxKQ';

// Configura as chaves VAPID para autenticação do serviço de notificação push
webpush.setVapidDetails(
  'mailto:projetositeviagens@gmail.com',   // Email de contato
  publicVapidKey,
  privateVapidKey
);

// Middleware para impedir cache (força sempre a requisição mais recente)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Middleware para interpretar JSON no corpo das requisições
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta "views"
app.use(express.static(path.join(__dirname, 'views')));

// Conexão com o banco de dados SQLite
const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('Erro ao abrir banco de dados', err);
    process.exit(1);
  }
  console.log('Conectado ao SQLite em', DB_PATH);

  // Criação das tabelas, se não existirem
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

// Rota para salvar a inscrição do usuário para notificações push
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

// Rota para salvar uma nova caminhada no banco de dados
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

    // Envia notificação push se o cliente estiver inscrito
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
      id: this.lastID // Retorna o ID da caminhada inserida
    });
  });
});

// Rota para listar todo o histórico de caminhadas
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
    res.json(rows); // Retorna lista de caminhadas
  });
});

// Rota para deletar uma caminhada específica pelo ID
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

// Inicializa o servidor na porta definida
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
