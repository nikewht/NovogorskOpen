// Утилиты для расчета статистики, достижений и визуализации

// Расчет общей статистики по играм
function calculatePlayerStats(games, players) {
  const playerStats = {};

  // Инициализация статистики для каждого игрока
  players.forEach(player => {
    playerStats[player.user_id] = {
      user_id: player.user_id,
      name: player.first_name,
      username: player.username,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      played: 0,
      winStreak: 0,
      bestWinStreak: 0,
      lossStreak: 0,
      worstLossStreak: 0,
      currentStreak: 0,
      matches: []
    };
  });

  // Обработка каждой игры
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

    // Сохраняем информацию о матче
    const matchInfo = {
      date: game.created_at,
      opponent: game.player2_id,
      opponentName: game.player2_name,
      score: `${game.player1_score}:${game.player2_score}`,
      won: game.player1_score > game.player2_score
    };
    p1Stats.matches.push(matchInfo);

    const matchInfo2 = {
      date: game.created_at,
      opponent: game.player1_id,
      opponentName: game.player1_name,
      score: `${game.player2_score}:${game.player1_score}`,
      won: game.player2_score > game.player1_score
    };
    p2Stats.matches.push(matchInfo2);

    // Определение победителя
    if (game.player1_score > game.player2_score) {
      p1Stats.wins++;
      p2Stats.losses++;

      // Обновление серий
      p1Stats.currentStreak = p1Stats.currentStreak >= 0 ? p1Stats.currentStreak + 1 : 1;
      p1Stats.bestWinStreak = Math.max(p1Stats.bestWinStreak, p1Stats.currentStreak);

      p2Stats.currentStreak = p2Stats.currentStreak <= 0 ? p2Stats.currentStreak - 1 : -1;
      p2Stats.worstLossStreak = Math.min(p2Stats.worstLossStreak, p2Stats.currentStreak);
    } else {
      p2Stats.wins++;
      p1Stats.losses++;

      // Обновление серий
      p2Stats.currentStreak = p2Stats.currentStreak >= 0 ? p2Stats.currentStreak + 1 : 1;
      p2Stats.bestWinStreak = Math.max(p2Stats.bestWinStreak, p2Stats.currentStreak);

      p1Stats.currentStreak = p1Stats.currentStreak <= 0 ? p1Stats.currentStreak - 1 : -1;
      p1Stats.worstLossStreak = Math.min(p1Stats.worstLossStreak, p1Stats.currentStreak);
    }
  });

  // Расчет процента побед для каждого игрока
  Object.values(playerStats).forEach(player => {
    player.winRate = player.played > 0 ? (player.wins / player.played) * 100 : 0;
    player.avgPointsWon = player.played > 0 ? player.gamesWon / player.played : 0;
    player.avgPointsLost = player.played > 0 ? player.gamesLost / player.played : 0;
  });

  return playerStats;
}

// Расчет достижений и рекордов
function calculateAchievements(playerStats, games) {
  const achievements = {
    mvp: null, // Игрок с лучшим win rate (минимум 3 игры)
    mostActive: null, // Игрок с наибольшим количеством матчей
    bestStreak: null, // Лучшая серия побед
    mostProductiveMatch: null, // Самый результативный матч
    biggestWin: null, // Самая крупная победа
    closestMatch: null, // Самый близкий матч
    perfectPlayer: null // Игрок без поражений (минимум 3 игры)
  };

  const activePlayers = Object.values(playerStats).filter(p => p.played > 0);

  // MVP - игрок с лучшим win rate (минимум 3 игры)
  const qualifiedPlayers = activePlayers.filter(p => p.played >= 3);
  if (qualifiedPlayers.length > 0) {
    achievements.mvp = qualifiedPlayers.reduce((best, player) =>
      player.winRate > best.winRate ? player : best
    );
  }

  // Самый активный игрок
  if (activePlayers.length > 0) {
    achievements.mostActive = activePlayers.reduce((best, player) =>
      player.played > best.played ? player : best
    );
  }

  // Лучшая серия побед
  if (activePlayers.length > 0) {
    const bestStreakPlayer = activePlayers.reduce((best, player) =>
      player.bestWinStreak > best.bestWinStreak ? player : best
    );
    if (bestStreakPlayer.bestWinStreak > 0) {
      achievements.bestStreak = {
        player: bestStreakPlayer,
        streak: bestStreakPlayer.bestWinStreak
      };
    }
  }

  // Идеальный игрок (без поражений, минимум 3 игры)
  const perfectPlayers = activePlayers.filter(p => p.played >= 3 && p.losses === 0);
  if (perfectPlayers.length > 0) {
    achievements.perfectPlayer = perfectPlayers.reduce((best, player) =>
      player.played > best.played ? player : best
    );
  }

  // Анализ матчей
  if (games.length > 0) {
    // Самый результативный матч
    let mostProductive = games[0];
    let maxPoints = games[0].player1_score + games[0].player2_score;

    // Самая крупная победа
    let biggestWin = games[0];
    let maxDiff = Math.abs(games[0].player1_score - games[0].player2_score);

    // Самый близкий матч
    let closestMatch = games[0];
    let minDiff = Math.abs(games[0].player1_score - games[0].player2_score);

    games.forEach(game => {
      const totalPoints = game.player1_score + game.player2_score;
      const diff = Math.abs(game.player1_score - game.player2_score);

      if (totalPoints > maxPoints) {
        maxPoints = totalPoints;
        mostProductive = game;
      }

      if (diff > maxDiff) {
        maxDiff = diff;
        biggestWin = game;
      }

      if (diff < minDiff) {
        minDiff = diff;
        closestMatch = game;
      }
    });

    achievements.mostProductiveMatch = {
      game: mostProductive,
      totalPoints: maxPoints
    };

    achievements.biggestWin = {
      game: biggestWin,
      difference: maxDiff
    };

    if (minDiff < maxDiff) { // Только если есть разница
      achievements.closestMatch = {
        game: closestMatch,
        difference: minDiff
      };
    }
  }

  return achievements;
}

// Генерация текстового графика активности по неделям
function generateActivityChart(games, periodStart, periodEnd) {
  if (games.length === 0) return '';

  // Группировка игр по неделям
  const weeks = {};
  const start = new Date(periodStart);
  const end = new Date(periodEnd);

  games.forEach(game => {
    const gameDate = new Date(game.created_at);
    const weekNumber = getWeekNumber(gameDate);
    const year = gameDate.getFullYear();
    const key = `${year}-W${weekNumber}`;

    weeks[key] = (weeks[key] || 0) + 1;
  });

  // Сортировка по неделям
  const sortedWeeks = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));

  if (sortedWeeks.length === 0) return '';

  // Нахождение максимума для масштабирования
  const maxGames = Math.max(...sortedWeeks.map(([, count]) => count));
  const maxBarLength = 20;

  let chart = '📊 График активности по неделям:\n\n';

  sortedWeeks.forEach(([week, count]) => {
    const barLength = Math.ceil((count / maxGames) * maxBarLength);
    const bar = '█'.repeat(barLength);
    const weekLabel = week.replace(/-W/, ' нед. ');
    chart += `${weekLabel}: ${bar} ${count}\n`;
  });

  return chart;
}

// Генерация графика активности по дням месяца
function generateMonthlyActivityChart(games, year, month) {
  if (games.length === 0) return '';

  // Группировка игр по дням
  const days = {};
  const daysInMonth = new Date(year, month, 0).getDate();

  // Инициализация всех дней месяца
  for (let day = 1; day <= daysInMonth; day++) {
    days[day] = 0;
  }

  games.forEach(game => {
    const gameDate = new Date(game.created_at);
    if (gameDate.getFullYear() === year && gameDate.getMonth() + 1 === month) {
      const day = gameDate.getDate();
      days[day] = (days[day] || 0) + 1;
    }
  });

  const maxGames = Math.max(...Object.values(days));
  if (maxGames === 0) return '';

  const maxBarLength = 15;

  let chart = '📊 Активность по дням месяца:\n\n';

  // Группируем по неделям для компактности
  const weeks = [];
  let currentWeek = [];

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push({ day, count: days[day] });
    if (currentWeek.length === 7 || day === daysInMonth) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  weeks.forEach((week, weekIndex) => {
    chart += `Неделя ${weekIndex + 1}: `;
    week.forEach(({ day, count }) => {
      const height = count > 0 ? Math.ceil((count / maxGames) * 5) : 0;
      const symbol = height === 0 ? '·' : ['▁', '▂', '▃', '▅', '▇'][Math.min(height - 1, 4)];
      chart += symbol;
    });
    chart += '\n';
  });

  const dayLabels = '            ';
  for (let i = 0; i < Math.min(7, daysInMonth); i++) {
    dayLabels += (i + 1).toString().padStart(2, ' ');
  }

  return chart;
}

// Вспомогательная функция для получения номера недели
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Форматирование статистики в красивый текст
function formatPlayerRanking(playerStats, options = {}) {
  const {
    title = '🏆 Рейтинг игроков',
    showMedals = true,
    minGames = 0,
    maxPlayers = 10,
    scoreUnit = 'очков'
  } = options;

  const sortedPlayers = Object.values(playerStats)
    .filter(p => p.played >= minGames)
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.played - a.played;
    })
    .slice(0, maxPlayers);

  if (sortedPlayers.length === 0) {
    return `${title}\n\nНедостаточно данных для формирования рейтинга.`;
  }

  let message = `${title}\n\n`;

  sortedPlayers.forEach((player, index) => {
    const rank = index + 1;
    let medal = '';

    if (showMedals) {
      if (rank === 1) medal = '🥇';
      else if (rank === 2) medal = '🥈';
      else if (rank === 3) medal = '🥉';
      else medal = `${rank}.`;
    } else {
      medal = `${rank}.`;
    }

    const winRate = player.winRate.toFixed(1);
    const streakInfo = player.currentStreak > 0
      ? ` 🔥${player.currentStreak}`
      : player.currentStreak < 0
      ? ` ❄️${Math.abs(player.currentStreak)}`
      : '';

    message += `${medal} ${player.name}${streakInfo}\n`;
    message += `   📊 ${player.wins}-${player.losses} (${winRate}% побед)\n`;
    message += `   🎾 ${scoreUnit}: ${player.gamesWon}:${player.gamesLost} | Матчей: ${player.played}\n`;

    if (player.bestWinStreak > 1) {
      message += `   ⭐ Лучшая серия: ${player.bestWinStreak}\n`;
    }

    message += '\n';
  });

  return message;
}

// Форматирование достижений
function formatAchievements(achievements, games) {
  let message = '🏅 Достижения и рекорды:\n\n';

  if (achievements.mvp) {
    const mvp = achievements.mvp;
    message += `👑 MVP: ${mvp.name}\n`;
    message += `   ${mvp.wins}-${mvp.losses} (${mvp.winRate.toFixed(1)}% побед, ${mvp.played} матчей)\n\n`;
  }

  if (achievements.perfectPlayer) {
    const perfect = achievements.perfectPlayer;
    message += `💯 Безупречный игрок: ${perfect.name}\n`;
    message += `   ${perfect.wins} побед без поражений!\n\n`;
  }

  if (achievements.bestStreak) {
    const streak = achievements.bestStreak;
    message += `🔥 Лучшая серия побед: ${streak.player.name}\n`;
    message += `   ${streak.streak} побед подряд!\n\n`;
  }

  if (achievements.mostActive) {
    const active = achievements.mostActive;
    message += `⚡ Самый активный: ${active.name}\n`;
    message += `   ${active.played} матчей сыграно\n\n`;
  }

  if (achievements.mostProductiveMatch) {
    const match = achievements.mostProductiveMatch.game;
    message += `🎯 Самый результативный матч:\n`;
    message += `   ${match.player1_name} ${match.player1_score}:${match.player2_score} ${match.player2_name}\n`;
    message += `   (всего ${achievements.mostProductiveMatch.totalPoints} очков)\n\n`;
  }

  if (achievements.biggestWin) {
    const match = achievements.biggestWin.game;
    const winner = match.player1_score > match.player2_score ? match.player1_name : match.player2_name;
    message += `💪 Самая крупная победа:\n`;
    message += `   ${match.player1_name} ${match.player1_score}:${match.player2_score} ${match.player2_name}\n`;
    message += `   (${winner} выиграл с разницей ${achievements.biggestWin.difference})\n\n`;
  }

  if (achievements.closestMatch) {
    const match = achievements.closestMatch.game;
    message += `⚔️ Самый близкий матч:\n`;
    message += `   ${match.player1_name} ${match.player1_score}:${match.player2_score} ${match.player2_name}\n`;
    message += `   (разница всего ${achievements.closestMatch.difference})\n\n`;
  }

  return message;
}

// Генерация месячной статистики
function generateMonthlyStatsData(games, players, year, month) {
  const playerStats = calculatePlayerStats(games, players);
  const achievements = calculateAchievements(playerStats, games);

  const stats = {
    year,
    month,
    totalGames: games.length,
    totalPlayers: Object.values(playerStats).filter(p => p.played > 0).length,
    playerStats: Object.values(playerStats).filter(p => p.played > 0),
    achievements,
    generated_at: new Date().toISOString()
  };

  return stats;
}

module.exports = {
  calculatePlayerStats,
  calculateAchievements,
  generateActivityChart,
  generateMonthlyActivityChart,
  formatPlayerRanking,
  formatAchievements,
  generateMonthlyStatsData,
  getWeekNumber
};
