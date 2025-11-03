require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('Error: TELEGRAM_BOT_TOKEN not found in .env file');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const db = new Database();

// Временное хранилище для процесса добавления игры
const gameCreationSessions = new Map();

// Функция для генерации клавиатуры управления сессией
function getSessionKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '👥 Присоединиться', callback_data: 'join_session' },
        { text: '❌ Покинуть сессию', callback_data: 'leave_session' }
      ],
      [
        { text: '🎾 Добавить результат игры', callback_data: 'add_game_button' }
      ]
    ]
  };
}

console.log('Bot started successfully!');

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
🎾 Добро пожаловать в бота для учета статистики игр в теннис!

Доступные команды:

📋 Управление сессиями:
/newsession - Создать новую игровую сессию
/join - Присоединиться к текущей сессии
/endsession - Завершить текущую сессию

🎯 Запись результатов:
/addgame - Добавить результат игры (с выбором игроков и счета)

📊 Статистика:
/stats - Показать статистику текущей сессии
/history - Показать историю предыдущих сессий

ℹ️ /help - Показать эту справку
  `;

  bot.sendMessage(chatId, welcomeMessage);
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
🎾 Как использовать бота:

1️⃣ Создайте новую сессию: /newsession
2️⃣ Игроки присоединяются: /join
3️⃣ После каждой игры добавьте результат: /addgame
   - Выберите первого игрока
   - Выберите второго игрока
   - Выберите счет
4️⃣ Просматривайте статистику: /stats
5️⃣ Завершите сессию: /endsession
  `);
});

// Команда /newsession
bot.onText(/\/newsession/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    // Проверяем, есть ли активная сессия
    const activeSession = await db.getActiveSession(chatId);

    if (activeSession) {
      bot.sendMessage(chatId, '⚠️ У вас уже есть активная сессия. Завершите её командой /endsession');
      return;
    }

    // Показываем выбор режима игры
    bot.sendMessage(
      chatId,
      '🎾 Выберите режим игры:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Короткий матч (до 2 побед в геймах)', callback_data: 'mode_short' }],
            [{ text: '🎾 Классический сет (до 6 геймов)', callback_data: 'mode_set' }],
            [{ text: '🏆 Матч из 2 сетов', callback_data: 'mode_2sets' }],
            [{ text: '👑 Матч из 3 сетов', callback_data: 'mode_3sets' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error creating session:', error);
    bot.sendMessage(chatId, '❌ Ошибка при создании сессии');
  }
});

// Команда /join
bot.onText(/\/join/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || 'Игрок';

  try {
    const activeSession = await db.getActiveSession(chatId);

    if (!activeSession) {
      bot.sendMessage(chatId, '⚠️ Нет активной сессии. Создайте новую командой /newsession');
      return;
    }

    const result = await db.addPlayerToSession(activeSession.id, userId, username, firstName);

    if (result.alreadyExists) {
      bot.sendMessage(chatId, `ℹ️ ${firstName}, вы уже присоединились к этой сессии`);
    } else {
      const players = await db.getSessionPlayers(activeSession.id);
      const playersList = players.map(p => `• ${p.first_name}${p.username ? ' (@' + p.username + ')' : ''}`).join('\n');

      bot.sendMessage(chatId, `✅ ${firstName} присоединился к сессии!\n\n👥 Участники:\n${playersList}`);
    }
  } catch (error) {
    console.error('Error joining session:', error);
    bot.sendMessage(chatId, '❌ Ошибка при присоединении к сессии');
  }
});

// Команда /leave
bot.onText(/\/leave/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name || 'Игрок';

  try {
    const activeSession = await db.getActiveSession(chatId);

    if (!activeSession) {
      bot.sendMessage(chatId, '⚠️ Нет активной сессии');
      return;
    }

    const result = await db.removePlayerFromSession(activeSession.id, userId);

    if (!result.deleted) {
      bot.sendMessage(chatId, `ℹ️ ${firstName}, вы не были участником этой сессии`);
      return;
    }

    const players = await db.getSessionPlayers(activeSession.id);
    const playersList = players.length > 0
      ? players.map(p => `• ${p.first_name}${p.username ? ' (@' + p.username + ')' : ''}`).join('\n')
      : 'Пока никто не присоединился';

    bot.sendMessage(chatId, `✅ ${firstName} покинул(а) сессию\n\n👥 Участники:\n${playersList}`);
  } catch (error) {
    console.error('Error leaving session:', error);
    bot.sendMessage(chatId, '❌ Ошибка при выходе из сессии');
  }
});

// Команда /endsession
bot.onText(/\/endsession/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const activeSession = await db.getActiveSession(chatId);

    if (!activeSession) {
      bot.sendMessage(chatId, '⚠️ Нет активной сессии');
      return;
    }

    await db.closeSession(activeSession.id);

    // Показываем итоговую статистику
    const games = await db.getSessionGames(activeSession.id);

    if (games.length === 0) {
      bot.sendMessage(chatId, '✅ Сессия завершена. Игр не было.');
      return;
    }

    const statsMessage = await generateSessionStats(activeSession.id);
    bot.sendMessage(chatId, `✅ Сессия завершена!\n\n${statsMessage}`);
  } catch (error) {
    console.error('Error ending session:', error);
    bot.sendMessage(chatId, '❌ Ошибка при завершении сессии');
  }
});

// Команда /addgame - теперь интерактивная
bot.onText(/\/addgame$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const activeSession = await db.getActiveSession(chatId);

    if (!activeSession) {
      bot.sendMessage(chatId, '⚠️ Нет активной сессии. Создайте новую командой /newsession');
      return;
    }

    const players = await db.getSessionPlayers(activeSession.id);

    if (players.length < 2) {
      bot.sendMessage(chatId, '⚠️ В сессии должно быть минимум 2 игрока. Присоединяйтесь командой /join');
      return;
    }

    // Создаем кнопки для выбора первого игрока
    const keyboard = {
      inline_keyboard: players.map(player => [{
        text: `${player.first_name}${player.username ? ' (@' + player.username + ')' : ''}`,
        callback_data: `select_p1_${player.user_id}`
      }])
    };

    // Инициализируем сессию добавления игры
    gameCreationSessions.set(`${chatId}_${userId}`, {
      sessionId: activeSession.id,
      players: players,
      step: 'select_player1'
    });

    bot.sendMessage(chatId, '🎾 Выберите первого игрока:', { reply_markup: keyboard });
  } catch (error) {
    console.error('Error starting game creation:', error);
    bot.sendMessage(chatId, '❌ Ошибка при создании формы добавления игры');
  }
});

// Обработка callback-запросов (нажатия на кнопки)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;

  try {
    // Выбор режима игры
    if (data.startsWith('mode_')) {
      const gameMode = data.replace('mode_', '');

      const sessionId = await db.createSession(chatId, gameMode);

      const modeNames = {
        'short': '⚡ Короткий матч (до 2 побед в геймах)',
        'set': '🎾 Классический сет (до 6 геймов)',
        '2sets': '🏆 Матч из 2 сетов',
        '3sets': '👑 Матч из 3 сетов'
      };

      bot.editMessageText(
        `✅ Новая сессия создана! ID: ${sessionId}\n🎮 Режим: ${modeNames[gameMode]}\n\n👥 Участники:\nПока никто не присоединился\n\nИспользуйте кнопки ниже или команды /join и /leave`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getSessionKeyboard()
        }
      );

      bot.answerCallbackQuery(query.id, { text: `✅ Сессия создана в режиме ${modeNames[gameMode]}` });
      return;
    }
    // Просмотр детальной статистики сессии
    else if (data.startsWith('session_details_')) {
      const sessionId = parseInt(data.replace('session_details_', ''));

      const detailedStats = await generateDetailedSessionStats(sessionId);

      bot.editMessageText(detailedStats, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{
            text: '◀️ Назад к списку сессий',
            callback_data: 'back_to_history'
          }]]
        }
      });

      bot.answerCallbackQuery(query.id);
      return;
    }
    // Присоединение к сессии через кнопку
    else if (data === 'join_session') {
      const activeSession = await db.getActiveSession(chatId);

      if (!activeSession) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Нет активной сессии' });
        return;
      }

      const username = query.from.username || '';
      const firstName = query.from.first_name || 'Игрок';

      const result = await db.addPlayerToSession(activeSession.id, userId, username, firstName);

      if (result.alreadyExists) {
        bot.answerCallbackQuery(query.id, { text: `ℹ️ Вы уже участник сессии` });
        return;
      }

      const players = await db.getSessionPlayers(activeSession.id);
      const playersList = players.map(p => `• ${p.first_name}${p.username ? ' (@' + p.username + ')' : ''}`).join('\n');

      bot.editMessageText(
        `✅ Новая сессия создана! ID: ${activeSession.id}\n\n👥 Участники:\n${playersList}\n\nИспользуйте кнопки ниже или команды /join и /leave`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getSessionKeyboard()
        }
      );

      bot.answerCallbackQuery(query.id, { text: `✅ ${firstName} присоединился!` });
      return;
    }
    // Выход из сессии через кнопку
    else if (data === 'leave_session') {
      const activeSession = await db.getActiveSession(chatId);

      if (!activeSession) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Нет активной сессии' });
        return;
      }

      const firstName = query.from.first_name || 'Игрок';
      const result = await db.removePlayerFromSession(activeSession.id, userId);

      if (!result.deleted) {
        bot.answerCallbackQuery(query.id, { text: 'ℹ️ Вы не были участником сессии' });
        return;
      }

      const players = await db.getSessionPlayers(activeSession.id);
      const playersList = players.length > 0
        ? players.map(p => `• ${p.first_name}${p.username ? ' (@' + p.username + ')' : ''}`).join('\n')
        : 'Пока никто не присоединился';

      bot.editMessageText(
        `✅ Новая сессия создана! ID: ${activeSession.id}\n\n👥 Участники:\n${playersList}\n\nИспользуйте кнопки ниже или команды /join и /leave`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: getSessionKeyboard()
        }
      );

      bot.answerCallbackQuery(query.id, { text: `✅ ${firstName} покинул(а) сессию` });
      return;
    }
    // Добавление результата игры через кнопку
    else if (data === 'add_game_button') {
      const activeSession = await db.getActiveSession(chatId);

      if (!activeSession) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ Нет активной сессии' });
        return;
      }

      const players = await db.getSessionPlayers(activeSession.id);

      if (players.length < 2) {
        bot.answerCallbackQuery(query.id, { text: '⚠️ В сессии должно быть минимум 2 игрока' });
        return;
      }

      // Создаем кнопки для выбора первого игрока
      const keyboard = {
        inline_keyboard: players.map(player => [{
          text: `${player.first_name}${player.username ? ' (@' + player.username + ')' : ''}`,
          callback_data: `select_p1_${player.user_id}`
        }])
      };

      // Инициализируем сессию добавления игры
      gameCreationSessions.set(`${chatId}_${userId}`, {
        sessionId: activeSession.id,
        players: players,
        step: 'select_player1'
      });

      // Отправляем новое сообщение для добавления игры
      bot.sendMessage(chatId, '🎾 Выберите первого игрока:', { reply_markup: keyboard });
      bot.answerCallbackQuery(query.id);
      return;
    }
    // Возврат к списку сессий
    else if (data === 'back_to_history') {
      // Получаем список сессий заново
      const sessions = await db.getChatSessions(chatId, 10);

      if (sessions.length === 0) {
        bot.editMessageText('ℹ️ История сессий пуста', {
          chat_id: chatId,
          message_id: messageId
        });
        bot.answerCallbackQuery(query.id);
        return;
      }

      let historyMessage = '📜 История сессий:\n\n';
      const buttons = [];

      for (const session of sessions) {
        const games = await db.getSessionGames(session.id);
        const players = await db.getSessionPlayers(session.id);
        const date = new Date(session.created_at).toLocaleDateString('ru-RU');
        const status = session.is_active ? '🟢 Активна' : '⚫️ Завершена';

        historyMessage += `${status} Сессия #${session.id} (${date})\n`;
        historyMessage += `👥 Игроков: ${players.length} | 🎾 Матчей: ${games.length}\n\n`;

        buttons.push([{
          text: `📊 Подробнее о сессии #${session.id}`,
          callback_data: `session_details_${session.id}`
        }]);
      }

      const keyboard = {
        inline_keyboard: buttons
      };

      bot.editMessageText(historyMessage, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      });

      bot.answerCallbackQuery(query.id);
      return;
    }

    // Для callback, связанных с добавлением игры, проверяем наличие gameSession
    const sessionKey = `${chatId}_${userId}`;
    const gameSession = gameCreationSessions.get(sessionKey);

    if (!gameSession) {
      bot.answerCallbackQuery(query.id, { text: '⚠️ Сессия истекла. Начните заново с /addgame' });
      return;
    }

    // Выбор первого игрока
    if (data.startsWith('select_p1_')) {
      const player1Id = parseInt(data.replace('select_p1_', ''));
      gameSession.player1Id = player1Id;
      gameSession.step = 'select_player2';

      const player1 = gameSession.players.find(p => p.user_id === player1Id);

      // Создаем кнопки для выбора второго игрока (исключая первого)
      const keyboard = {
        inline_keyboard: gameSession.players
          .filter(p => p.user_id !== player1Id)
          .map(player => [{
            text: `${player.first_name}${player.username ? ' (@' + player.username + ')' : ''}`,
            callback_data: `select_p2_${player.user_id}`
          }])
      };

      bot.editMessageText(
        `✅ Первый игрок: ${player1.first_name}\n\n🎾 Выберите второго игрока:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        }
      );

      bot.answerCallbackQuery(query.id);
    }
    // Выбор второго игрока
    else if (data.startsWith('select_p2_')) {
      const player2Id = parseInt(data.replace('select_p2_', ''));
      gameSession.player2Id = player2Id;
      gameSession.step = 'select_score';

      const player1 = gameSession.players.find(p => p.user_id === gameSession.player1Id);
      const player2 = gameSession.players.find(p => p.user_id === player2Id);

      // Получаем режим игры из сессии
      const session = await db.getSessionById(gameSession.sessionId);
      const gameMode = session.game_mode || 'short';

      // Создаем кнопки для выбора счета в зависимости от режима
      let scores = [];

      if (gameMode === 'short') {
        // Короткий матч (до 2 побед в геймах)
        scores = [
          ['2:0', '2:1'],
          ['0:2', '1:2']
        ];
      } else if (gameMode === 'set') {
        // Классический сет (до 6 геймов)
        scores = [
          ['6:0', '6:1', '6:2'],
          ['6:3', '6:4', '7:5'],
          ['7:6', '0:6', '1:6'],
          ['2:6', '3:6', '4:6'],
          ['5:7', '6:7']
        ];
      } else if (gameMode === '2sets') {
        // Матч из 2 сетов
        scores = [
          ['2:0', '2:1'],
          ['0:2', '1:2']
        ];
      } else if (gameMode === '3sets') {
        // Матч из 3 сетов (до 2 побед)
        scores = [
          ['2:0', '2:1'],
          ['0:2', '1:2']
        ];
      }

      const keyboard = {
        inline_keyboard: scores.map(row =>
          row.map(score => ({
            text: `${player1.first_name} ${score} ${player2.first_name}`,
            callback_data: `score_${score}`
          }))
        )
      };

      const scoreLabels = {
        'short': 'геймы',
        'set': 'геймы',
        '2sets': 'сеты',
        '3sets': 'сеты'
      };

      bot.editMessageText(
        `✅ Первый игрок: ${player1.first_name}\n✅ Второй игрок: ${player2.first_name}\n\n🎯 Выберите счет (${scoreLabels[gameMode]}):`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: keyboard
        }
      );

      bot.answerCallbackQuery(query.id);
    }
    // Выбор счета
    else if (data.startsWith('score_')) {
      const scoreStr = data.replace('score_', '');
      const [score1, score2] = scoreStr.split(':').map(s => parseInt(s));

      const player1 = gameSession.players.find(p => p.user_id === gameSession.player1Id);
      const player2 = gameSession.players.find(p => p.user_id === gameSession.player2Id);

      // Сохраняем результат в базу
      await db.addGame(gameSession.sessionId, gameSession.player1Id, gameSession.player2Id, score1, score2);

      const winner = score1 > score2 ? player1.first_name : player2.first_name;

      bot.editMessageText(
        `✅ Результат записан!\n\n🎾 ${player1.first_name} ${score1}:${score2} ${player2.first_name}\n🏆 Победитель: ${winner}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{
              text: '🎾 Добавить еще один результат',
              callback_data: 'add_game_button'
            }]]
          }
        }
      );

      bot.answerCallbackQuery(query.id, { text: '✅ Результат сохранен!' });

      // Удаляем сессию
      gameCreationSessions.delete(sessionKey);
    }
  } catch (error) {
    console.error('Error handling callback:', error);
    bot.answerCallbackQuery(query.id, { text: '❌ Произошла ошибка' });
  }
});

// Команда /stats
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const activeSession = await db.getActiveSession(chatId);

    if (!activeSession) {
      bot.sendMessage(chatId, '⚠️ Нет активной сессии');
      return;
    }

    const statsMessage = await generateSessionStats(activeSession.id);
    bot.sendMessage(chatId, statsMessage);
  } catch (error) {
    console.error('Error getting stats:', error);
    bot.sendMessage(chatId, '❌ Ошибка при получении статистики');
  }
});

// Команда /history
bot.onText(/\/history/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const sessions = await db.getChatSessions(chatId, 10);

    if (sessions.length === 0) {
      bot.sendMessage(chatId, 'ℹ️ История сессий пуста');
      return;
    }

    let historyMessage = '📜 История сессий:\n\n';
    const buttons = [];

    const modeIcons = {
      'short': '⚡',
      'set': '🎾',
      '2sets': '🏆',
      '3sets': '👑'
    };

    for (const session of sessions) {
      const games = await db.getSessionGames(session.id);
      const players = await db.getSessionPlayers(session.id);
      const date = new Date(session.created_at).toLocaleDateString('ru-RU');
      const status = session.is_active ? '🟢 Активна' : '⚫️ Завершена';
      const gameMode = session.game_mode || 'short';
      const modeIcon = modeIcons[gameMode];

      historyMessage += `${status} Сессия #${session.id} (${date})\n`;
      historyMessage += `${modeIcon} Режим: ${gameMode} | 👥 Игроков: ${players.length} | 🎾 Матчей: ${games.length}\n`;

      // Добавляем кнопку для просмотра деталей
      buttons.push([{
        text: `📊 Подробнее о сессии #${session.id}`,
        callback_data: `session_details_${session.id}`
      }]);

      historyMessage += '\n';
    }

    const keyboard = {
      inline_keyboard: buttons
    };

    bot.sendMessage(chatId, historyMessage, { reply_markup: keyboard });
  } catch (error) {
    console.error('Error getting history:', error);
    bot.sendMessage(chatId, '❌ Ошибка при получении истории');
  }
});

// Функция для генерации статистики сессии
async function generateSessionStats(sessionId) {
  const games = await db.getSessionGames(sessionId);
  const players = await db.getSessionPlayers(sessionId);
  const session = await db.getSessionById(sessionId);
  const gameMode = session.game_mode || 'short';

  const modeNames = {
    'short': '⚡ Короткий матч (до 2 побед в геймах)',
    'set': '🎾 Классический сет (до 6 геймов)',
    '2sets': '🏆 Матч из 2 сетов',
    '3sets': '👑 Матч из 3 сетов'
  };

  const scoreUnit = (gameMode === '2sets' || gameMode === '3sets') ? 'сеты' : 'геймы';

  if (games.length === 0) {
    return `📊 Статистика текущей сессии:\n🎮 Режим: ${modeNames[gameMode]}\n\nИгр пока не было`;
  }

  // Подсчет статистики для каждого игрока
  const playerStats = {};

  players.forEach(player => {
    playerStats[player.user_id] = {
      name: player.first_name,
      username: player.username,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      played: 0
    };
  });

  games.forEach(game => {
    const p1Stats = playerStats[game.player1_id];
    const p2Stats = playerStats[game.player2_id];

    if (!p1Stats || !p2Stats) return;

    p1Stats.played++;
    p2Stats.played++;

    p1Stats.gamesWon += game.player1_score;
    p1Stats.gamesLost += game.player2_score;
    p2Stats.gamesWon += game.player2_score;
    p2Stats.gamesLost += game.player1_score;

    if (game.player1_score > game.player2_score) {
      p1Stats.wins++;
      p2Stats.losses++;
    } else {
      p2Stats.wins++;
      p1Stats.losses++;
    }
  });

  let statsMessage = `📊 Статистика сессии:\n🎮 Режим: ${modeNames[gameMode]}\n\n`;

  // Список игр
  statsMessage += '🎾 Сыгранные матчи:\n';
  games.forEach((game, index) => {
    const winner = game.player1_score > game.player2_score ? game.player1_name : game.player2_name;
    statsMessage += `${index + 1}. ${game.player1_name} ${game.player1_score}:${game.player2_score} ${game.player2_name} (🏆 ${winner})\n`;
  });

  // Статистика игроков
  statsMessage += '\n👥 Статистика игроков:\n';

  const sortedPlayers = Object.values(playerStats)
    .filter(p => p.played > 0)
    .sort((a, b) => b.wins - a.wins);

  sortedPlayers.forEach((player, index) => {
    const winRate = player.played > 0 ? ((player.wins / player.played) * 100).toFixed(0) : 0;
    statsMessage += `\n${index + 1}. ${player.name}${player.username ? ' (@' + player.username + ')' : ''}\n`;
    statsMessage += `   Побед: ${player.wins} | Поражений: ${player.losses}\n`;
    statsMessage += `   ${scoreUnit.charAt(0).toUpperCase() + scoreUnit.slice(1)}: ${player.gamesWon}:${player.gamesLost}\n`;
    statsMessage += `   Процент побед: ${winRate}%\n`;
  });

  return statsMessage;
}

// Функция для генерации детальной статистики сессии с рейтингом
async function generateDetailedSessionStats(sessionId) {
  const games = await db.getSessionGames(sessionId);
  const players = await db.getSessionPlayers(sessionId);
  const session = await db.getSessionById(sessionId);

  if (!session) {
    return '❌ Сессия не найдена';
  }

  const gameMode = session.game_mode || 'short';

  const modeNames = {
    'short': '⚡ Короткий матч',
    'set': '🎾 Классический сет',
    '2sets': '🏆 Матч из 2 сетов',
    '3sets': '👑 Матч из 3 сетов'
  };

  const scoreUnit = (gameMode === '2sets' || gameMode === '3sets') ? 'сетам' : 'геймам';

  const date = new Date(session.created_at).toLocaleDateString('ru-RU');
  const time = new Date(session.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const status = session.is_active ? '🟢 Активна' : '⚫️ Завершена';

  let statsMessage = `📊 Детальная статистика сессии #${sessionId}\n`;
  statsMessage += `${status} | 📅 ${date} ${time}\n`;
  statsMessage += `🎮 Режим: ${modeNames[gameMode]}\n\n`;

  if (games.length === 0) {
    statsMessage += 'ℹ️ В этой сессии игр не было';
    return statsMessage;
  }

  // Подсчет статистики для каждого игрока
  const playerStats = {};

  players.forEach(player => {
    playerStats[player.user_id] = {
      name: player.first_name,
      username: player.username,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      played: 0
    };
  });

  games.forEach(game => {
    const p1Stats = playerStats[game.player1_id];
    const p2Stats = playerStats[game.player2_id];

    if (!p1Stats || !p2Stats) return;

    p1Stats.played++;
    p2Stats.played++;

    p1Stats.gamesWon += game.player1_score;
    p1Stats.gamesLost += game.player2_score;
    p2Stats.gamesWon += game.player2_score;
    p2Stats.gamesLost += game.player1_score;

    if (game.player1_score > game.player2_score) {
      p1Stats.wins++;
      p2Stats.losses++;
    } else {
      p2Stats.wins++;
      p1Stats.losses++;
    }
  });

  // Сортировка игроков по количеству побед
  const sortedPlayers = Object.values(playerStats)
    .filter(p => p.played > 0)
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      // При равном количестве побед сортируем по проценту побед
      const aWinRate = a.played > 0 ? a.wins / a.played : 0;
      const bWinRate = b.played > 0 ? b.wins / b.played : 0;
      return bWinRate - aWinRate;
    });

  // Медали для топ-3
  const medals = ['🥇', '🥈', '🥉'];

  // Рейтинг игроков
  statsMessage += '🏆 Рейтинг игроков:\n\n';

  sortedPlayers.forEach((player, index) => {
    const winRate = player.played > 0 ? ((player.wins / player.played) * 100).toFixed(0) : 0;
    const medal = index < 3 ? medals[index] + ' ' : `${index + 1}. `;

    statsMessage += `${medal}${player.name}${player.username ? ' (@' + player.username + ')' : ''}\n`;
    statsMessage += `   📊 Побед/Поражений: ${player.wins}/${player.losses}\n`;
    statsMessage += `   🎾 Счет по ${scoreUnit}: ${player.gamesWon}:${player.gamesLost}\n`;
    statsMessage += `   📈 Процент побед: ${winRate}%\n`;
    statsMessage += `   🎯 Сыграно матчей: ${player.played}\n\n`;
  });

  // Список всех матчей
  statsMessage += '📋 Все матчи сессии:\n\n';

  games.forEach((game, index) => {
    const winner = game.player1_score > game.player2_score ? game.player1_name : game.player2_name;
    const winnerMark = game.player1_score > game.player2_score ? '🏆' : '';
    const loserMark = game.player1_score < game.player2_score ? '🏆' : '';

    statsMessage += `${index + 1}. ${winnerMark}${game.player1_name} ${game.player1_score}:${game.player2_score} ${game.player2_name}${loserMark}\n`;
  });

  statsMessage += `\n📊 Всего матчей: ${games.length}`;

  return statsMessage;
}

// Обработка ошибок
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  db.close();
  process.exit(0);
});
