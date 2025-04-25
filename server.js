
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'caminhadas.db');

app.use(express.json());

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

// Endpoint ajustado para salvar uma nova caminhada
app.post('/api/historico', (req, res) => {
  const { tempo, distancia, ritmo } = req.body;
  const insertSQL = `
    INSERT INTO historico_caminhada (tempo, distancia, ritmo)
    VALUES (?, ?, ?)
  `;
  db.run(insertSQL, [tempo, distancia, ritmo], function(err) {
    if (err) {
      console.error('Erro ao salvar caminhada:', err);
      return res.status(500).json({ error: 'Falha ao salvar caminhada.' });
    }
    res.status(201).json({ 
      message: 'Caminhada salva com sucesso!', 
      id: this.lastID 
    });
  });
});

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
