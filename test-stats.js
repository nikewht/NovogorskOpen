// Тестовый скрипт для проверки функций статистики
const Database = require('./src/database');
const {
  calculatePlayerStats,
  calculateAchievements,
  generateActivityChart,
  generateMonthlyActivityChart,
  formatPlayerRanking,
  formatAchievements,
  generateMonthlyStatsData
} = require('./src/stats-utils');

async function testStats() {
  console.log('🧪 Тестирование новых функций статистики...\n');

  const db = new Database();

  try {
    // Ждем инициализации БД
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Тест 1: Получение всех игр
    console.log('📊 Тест 1: Получение всех игр для чата...');
    const chatId = -4984611501; // Используем реальный chat_id из базы
    const games = await db.getAllChatGames(chatId);
    console.log(`✅ Получено игр: ${games.length}\n`);

    if (games.length === 0) {
      console.log('⚠️  Нет игр в базе для тестирования. Завершение.');
      db.close();
      return;
    }

    // Тест 2: Получение всех игроков
    console.log('📊 Тест 2: Получение всех игроков...');
    const players = await db.getAllChatPlayers(chatId);
    console.log(`✅ Получено игроков: ${players.length}`);
    players.forEach(p => console.log(`  - ${p.first_name} (ID: ${p.user_id})`));
    console.log('');

    // Тест 3: Расчет статистики игроков
    console.log('📊 Тест 3: Расчет статистики игроков...');
    const playerStats = calculatePlayerStats(games, players);
    console.log('✅ Статистика рассчитана:');
    Object.values(playerStats).forEach(p => {
      if (p.played > 0) {
        console.log(`  - ${p.name}: ${p.wins}-${p.losses} (${p.winRate.toFixed(1)}% побед, ${p.played} матчей)`);
      }
    });
    console.log('');

    // Тест 4: Расчет достижений
    console.log('📊 Тест 4: Расчет достижений...');
    const achievements = calculateAchievements(playerStats, games);
    console.log('✅ Достижения рассчитаны:');
    if (achievements.mvp) {
      console.log(`  - MVP: ${achievements.mvp.name} (${achievements.mvp.winRate.toFixed(1)}% побед)`);
    }
    if (achievements.mostActive) {
      console.log(`  - Самый активный: ${achievements.mostActive.name} (${achievements.mostActive.played} матчей)`);
    }
    if (achievements.bestStreak) {
      console.log(`  - Лучшая серия: ${achievements.bestStreak.player.name} (${achievements.bestStreak.streak} побед)`);
    }
    console.log('');

    // Тест 5: Форматирование рейтинга
    console.log('📊 Тест 5: Форматирование рейтинга...');
    const ranking = formatPlayerRanking(playerStats, {
      title: '🏆 Тестовый рейтинг',
      showMedals: true,
      minGames: 1,
      maxPlayers: 5,
      scoreUnit: 'очков'
    });
    console.log('✅ Рейтинг сформирован:');
    console.log(ranking);

    // Тест 6: График активности
    console.log('📊 Тест 6: График активности...');
    const firstGame = new Date(games[0].created_at);
    const lastGame = new Date(games[games.length - 1].created_at);
    const chart = generateActivityChart(games, firstGame, lastGame);
    console.log('✅ График создан:');
    console.log(chart);

    // Тест 7: Сохранение месячного отчета
    console.log('📊 Тест 7: Сохранение тестового месячного отчета...');
    const now = new Date();
    const testYear = now.getFullYear();
    const testMonth = now.getMonth() + 1;

    const monthlyData = generateMonthlyStatsData(games, players, testYear, testMonth);
    await db.saveMonthlyReport(chatId, testYear, testMonth, monthlyData);
    console.log(`✅ Отчет сохранен для ${testMonth}/${testYear}\n`);

    // Тест 8: Получение месячного отчета
    console.log('📊 Тест 8: Получение сохраненного отчета...');
    const savedReport = await db.getMonthlyReport(chatId, testYear, testMonth);
    if (savedReport) {
      console.log(`✅ Отчет получен:`);
      console.log(`  - Дата создания: ${new Date(savedReport.created_at).toLocaleString('ru-RU')}`);
      console.log(`  - Матчей: ${savedReport.stats.totalGames}`);
      console.log(`  - Игроков: ${savedReport.stats.totalPlayers}`);
    } else {
      console.log('❌ Отчет не найден');
    }
    console.log('');

    // Тест 9: Получение игр за период
    console.log('📊 Тест 9: Получение игр за период...');
    const startDate = new Date(testYear, testMonth - 1, 1);
    const endDate = new Date(testYear, testMonth, 0, 23, 59, 59);
    const periodGames = await db.getGamesByPeriod(chatId, startDate.toISOString(), endDate.toISOString());
    console.log(`✅ Получено игр за ${testMonth}/${testYear}: ${periodGames.length}\n`);

    // Тест 10: Список месячных отчетов
    console.log('📊 Тест 10: Получение списка месячных отчетов...');
    const reports = await db.getMonthlyReports(chatId, 12);
    console.log(`✅ Получено отчетов: ${reports.length}`);
    reports.forEach(r => {
      console.log(`  - ${r.month}/${r.year} - создан ${new Date(r.created_at).toLocaleDateString('ru-RU')}`);
    });

    console.log('\n✅ Все тесты успешно завершены!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
  } finally {
    db.close();
  }
}

testStats();
