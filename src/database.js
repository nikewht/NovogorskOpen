const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, '..', 'tennis_stats.db'), (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initDatabase();
      }
    });
  }

  initDatabase() {
    this.db.serialize(() => {
      // Таблица сессий
      this.db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL,
          game_mode TEXT DEFAULT 'short',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          is_active BOOLEAN DEFAULT 1
        )
      `, (err) => {
        if (err) {
          console.error('Error creating sessions table:', err);
          return;
        }

        // Миграция: добавляем game_mode если его нет
        this.db.all(`PRAGMA table_info(sessions)`, (err, columns) => {
          if (err) {
            console.error('Error checking table schema:', err);
            return;
          }

          const hasGameMode = columns.some(col => col.name === 'game_mode');

          if (!hasGameMode) {
            console.log('Running migration: adding game_mode column to sessions table');
            this.db.run(`ALTER TABLE sessions ADD COLUMN game_mode TEXT DEFAULT 'short'`, (err) => {
              if (err) {
                console.error('Error adding game_mode column:', err);
              } else {
                console.log('Migration completed: game_mode column added');
              }
            });
          }
        });
      });

      // Таблица игроков в сессии
      this.db.run(`
        CREATE TABLE IF NOT EXISTS session_players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          username TEXT,
          first_name TEXT,
          joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
      `);

      // Таблица игр (матчей)
      this.db.run(`
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          player1_id INTEGER NOT NULL,
          player2_id INTEGER NOT NULL,
          player1_score INTEGER NOT NULL,
          player2_score INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions (id)
        )
      `);
    });
  }

  // Создать новую сессию
  createSession(chatId, gameMode = 'short') {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO sessions (chat_id, game_mode, is_active) VALUES (?, ?, 1)',
        [chatId, gameMode],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Получить активную сессию для чата
  getActiveSession(chatId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM sessions WHERE chat_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
        [chatId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Получить сессию по ID
  getSessionById(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM sessions WHERE id = ?',
        [sessionId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Закрыть сессию
  closeSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE sessions SET is_active = 0, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [sessionId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Добавить игрока в сессию
  addPlayerToSession(sessionId, userId, username, firstName) {
    return new Promise((resolve, reject) => {
      // Проверяем, не добавлен ли уже игрок
      this.db.get(
        'SELECT * FROM session_players WHERE session_id = ? AND user_id = ?',
        [sessionId, userId],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve({ alreadyExists: true });
          } else {
            this.db.run(
              'INSERT INTO session_players (session_id, user_id, username, first_name) VALUES (?, ?, ?, ?)',
              [sessionId, userId, username, firstName],
              function(err) {
                if (err) reject(err);
                else resolve({ alreadyExists: false, id: this.lastID });
              }
            );
          }
        }
      );
    });
  }

  // Удалить игрока из сессии
  removePlayerFromSession(sessionId, userId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM session_players WHERE session_id = ? AND user_id = ?',
        [sessionId, userId],
        function(err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes > 0 });
        }
      );
    });
  }

  // Получить игроков сессии
  getSessionPlayers(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM session_players WHERE session_id = ?',
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Добавить результат игры
  addGame(sessionId, player1Id, player2Id, player1Score, player2Score) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO games (session_id, player1_id, player2_id, player1_score, player2_score) VALUES (?, ?, ?, ?, ?)',
        [sessionId, player1Id, player2Id, player1Score, player2Score],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Получить игры сессии
  getSessionGames(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT g.*,
                p1.first_name as player1_name, p1.username as player1_username,
                p2.first_name as player2_name, p2.username as player2_username,
                (strftime('%s', 'now') - strftime('%s', g.created_at)) as seconds_ago
         FROM games g
         LEFT JOIN session_players p1 ON g.player1_id = p1.user_id AND g.session_id = p1.session_id
         LEFT JOIN session_players p2 ON g.player2_id = p2.user_id AND g.session_id = p2.session_id
         WHERE g.session_id = ?
         ORDER BY g.created_at`,
        [sessionId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Получить все сессии чата
  getChatSessions(chatId, limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM sessions WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?',
        [chatId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  // Удалить сессию (только для админа)
  deleteSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Удаляем все игры сессии
        this.db.run('DELETE FROM games WHERE session_id = ?', [sessionId], (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Удаляем всех игроков сессии
          this.db.run('DELETE FROM session_players WHERE session_id = ?', [sessionId], (err) => {
            if (err) {
              reject(err);
              return;
            }

            // Удаляем саму сессию
            this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId], function(err) {
              if (err) reject(err);
              else resolve({ deleted: this.changes > 0 });
            });
          });
        });
      });
    });
  }

  // Получить игру по ID
  getGameById(gameId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT g.*,
                p1.first_name as player1_name, p1.username as player1_username,
                p2.first_name as player2_name, p2.username as player2_username,
                (strftime('%s', 'now') - strftime('%s', g.created_at)) as seconds_ago
         FROM games g
         LEFT JOIN session_players p1 ON g.player1_id = p1.user_id AND g.session_id = p1.session_id
         LEFT JOIN session_players p2 ON g.player2_id = p2.user_id AND g.session_id = p2.session_id
         WHERE g.id = ?`,
        [gameId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  // Проверить, можно ли редактировать игру (менее 5 минут назад)
  canEditGame(gameId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT (strftime('%s', 'now') - strftime('%s', created_at)) as seconds_ago
         FROM games WHERE id = ?`,
        [gameId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row && row.seconds_ago < 300); // 300 секунд = 5 минут
        }
      );
    });
  }

  // Обновить счет игры
  updateGameScore(gameId, player1Score, player2Score) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE games SET player1_score = ?, player2_score = ? WHERE id = ?',
        [player1Score, player2Score, gameId],
        function(err) {
          if (err) reject(err);
          else resolve({ updated: this.changes > 0 });
        }
      );
    });
  }

  // Удалить игру
  deleteGame(gameId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM games WHERE id = ?',
        [gameId],
        function(err) {
          if (err) reject(err);
          else resolve({ deleted: this.changes > 0 });
        }
      );
    });
  }

  close() {
    this.db.close();
  }
}

module.exports = Database;
