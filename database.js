/**
 * SQLite Database Layer for Sic Bo
 * Uses better-sqlite3 with WAL mode and strict atomic transactions.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { calculatePayout } = require('./sicboRules');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sicbo.db');
const db = new Database(dbPath);

// Enable WAL mode and foreign keys for robustness and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema
 */
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 1000,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dice1 INTEGER,
      dice2 INTEGER,
      dice3 INTEGER,
      total INTEGER,
      status TEXT DEFAULT 'WAITING',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      bet_type TEXT NOT NULL,
      bet_value TEXT,
      wager INTEGER NOT NULL,
      payout INTEGER DEFAULT 0,
      result TEXT DEFAULT 'pending',
      request_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      settled_at DATETIME,
      FOREIGN KEY (player_id) REFERENCES players(id),
      FOREIGN KEY (round_id) REFERENCES rounds(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      round_id INTEGER,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bets_round ON bets(round_id);
    CREATE INDEX IF NOT EXISTS idx_bets_player ON bets(player_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_player ON transactions(player_id);
  `);
}

// Run schema initialization
initDatabase();

// Prepared statements for high performance and SQL injection prevention
const stmts = {
  // Player statements
  getPlayerById: db.prepare('SELECT id, username, display_name, credits, is_admin, is_disabled, created_at, last_login FROM players WHERE id = ?'),
  getPlayerByUsername: db.prepare('SELECT * FROM players WHERE username = ? COLLATE NOCASE'),
  createPlayer: db.prepare(`
    INSERT INTO players (username, password_hash, display_name, credits, is_admin)
    VALUES (?, ?, ?, ?, ?)
  `),
  updateLastLogin: db.prepare('UPDATE players SET last_login = CURRENT_TIMESTAMP WHERE id = ?'),
  updatePlayerPassword: db.prepare('UPDATE players SET password_hash = ? WHERE id = ?'),
  updatePlayerDisabled: db.prepare('UPDATE players SET is_disabled = ? WHERE id = ?'),
  getAllPlayers: db.prepare('SELECT id, username, display_name, credits, is_admin, is_disabled, created_at, last_login FROM players ORDER BY id ASC'),

  // Balance & Ledger
  updatePlayerBalance: db.prepare('UPDATE players SET credits = ? WHERE id = ?'),
  insertTransaction: db.prepare(`
    INSERT INTO transactions (player_id, round_id, type, amount, balance_before, balance_after, reference)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),

  // Round statements
  createRound: db.prepare('INSERT INTO rounds (status, started_at) VALUES (?, CURRENT_TIMESTAMP)'),
  updateRoundStatus: db.prepare('UPDATE rounds SET status = ? WHERE id = ?'),
  settleRound: db.prepare(`
    UPDATE rounds
    SET dice1 = ?, dice2 = ?, dice3 = ?, total = ?, status = 'SETTLED', ended_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  voidRound: db.prepare("UPDATE rounds SET status = 'VOID', ended_at = CURRENT_TIMESTAMP WHERE id = ?"),
  getRoundById: db.prepare('SELECT * FROM rounds WHERE id = ?'),
  getUnfinishedRounds: db.prepare("SELECT * FROM rounds WHERE status NOT IN ('SETTLED', 'VOID')"),
  getRecentRounds: db.prepare("SELECT * FROM rounds WHERE status = 'SETTLED' ORDER BY id DESC LIMIT ?"),

  // Bet statements
  getBetByRequestId: db.prepare('SELECT * FROM bets WHERE request_id = ?'),
  insertBet: db.prepare(`
    INSERT INTO bets (round_id, player_id, bet_type, bet_value, wager, request_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  getPendingBetsByRound: db.prepare("SELECT * FROM bets WHERE round_id = ? AND result = 'pending'"),
  getPendingBetsWithPlayerByRound: db.prepare(`
    SELECT b.*, p.display_name, p.username 
    FROM bets b 
    JOIN players p ON b.player_id = p.id 
    WHERE b.round_id = ? AND b.result = 'pending' 
    ORDER BY b.id ASC
  `),
  getBetsByPlayerAndRound: db.prepare("SELECT * FROM bets WHERE round_id = ? AND player_id = ? AND result != 'void' ORDER BY id ASC"),
  getLastPendingBetByPlayerAndRound: db.prepare("SELECT * FROM bets WHERE round_id = ? AND player_id = ? AND result = 'pending' ORDER BY id DESC LIMIT 1"),
  voidBet: db.prepare("UPDATE bets SET result = 'void', settled_at = CURRENT_TIMESTAMP WHERE id = ?"),
  deleteBet: db.prepare('DELETE FROM bets WHERE id = ?'),
  updateBetSettled: db.prepare(`
    UPDATE bets
    SET payout = ?, result = ?, settled_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  getPlayerHistory: db.prepare(`
    SELECT r.id as round_id, r.dice1, r.dice2, r.dice3, r.total,
           b.bet_type, b.bet_value, b.wager, b.payout, b.result, b.created_at, b.settled_at
    FROM bets b
    JOIN rounds r ON b.round_id = r.id
    WHERE b.player_id = ? AND b.result != 'void'
    ORDER BY b.round_id DESC, b.id ASC
    LIMIT ?
  `),
  getTransactionsByPlayer: db.prepare('SELECT * FROM transactions WHERE player_id = ? ORDER BY id DESC LIMIT ?'),
  getAllTransactions: db.prepare('SELECT t.*, p.username, p.display_name FROM transactions t JOIN players p ON t.player_id = p.id ORDER BY t.id DESC LIMIT ?')
};

/**
 * Register a new player with initial credit transaction
 */
function registerPlayer(username, password, displayName, initialCredits = 1000, isAdmin = 0) {
  const passwordHash = bcrypt.hashSync(password, 10);

  const txn = db.transaction(() => {
    const existing = stmts.getPlayerByUsername.get(username);
    if (existing) {
      throw new Error('Username already taken');
    }

    const res = stmts.createPlayer.run(username, passwordHash, displayName || username, initialCredits, isAdmin ? 1 : 0);
    const playerId = res.lastInsertRowid;

    stmts.insertTransaction.run(
      playerId,
      null,
      'INITIAL_CREDIT',
      initialCredits,
      0,
      initialCredits,
      'Account creation bonus'
    );

    return stmts.getPlayerById.get(playerId);
  });

  return txn();
}

/**
 * Authenticate player credentials
 */
function authenticatePlayer(username, password) {
  const player = stmts.getPlayerByUsername.get(username);
  if (!player) return null;
  if (player.is_disabled) {
    throw new Error('Account has been suspended by administrator');
  }

  const valid = bcrypt.compareSync(password, player.password_hash);
  if (!valid) return null;

  stmts.updateLastLogin.run(player.id);
  const { password_hash, ...safePlayer } = player;
  return safePlayer;
}

/**
 * Login or create player by Name only (no password required)
 */
function loginByName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Please enter your name');

  const txn = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM players WHERE display_name = ? COLLATE NOCASE OR username = ? COLLATE NOCASE').get(trimmed, trimmed);
    if (existing) {
      if (existing.is_disabled) {
        throw new Error('Account suspended by administrator');
      }
      stmts.updateLastLogin.run(existing.id);
      const { password_hash, ...safePlayer } = existing;
      return safePlayer;
    }

    // New player: 1,000 credits
    const username = trimmed.toLowerCase().replace(/[^a-z0-9_]/g, '_') + '_' + Math.random().toString(36).substring(2, 6);
    const passwordHash = bcrypt.hashSync('nopassword_' + Date.now(), 10);
    const res = stmts.createPlayer.run(username, passwordHash, trimmed, 1000, 0);
    const playerId = res.lastInsertRowid;

    stmts.insertTransaction.run(
      playerId,
      null,
      'INITIAL_CREDIT',
      1000,
      0,
      1000,
      'Welcome bonus for ' + trimmed
    );

    return stmts.getPlayerById.get(playerId);
  });

  return txn();
}

/**
 * Place a bet within an atomic SQLite transaction
 */
function placeBet(playerId, roundId, betType, betValue, wager, requestId) {
  const betAmount = parseInt(wager, 10);
  if (isNaN(betAmount) || betAmount <= 0) {
    throw new Error('Bet amount must be a positive integer');
  }

  const txn = db.transaction(() => {
    // 1. Idempotency check
    if (requestId) {
      const existing = stmts.getBetByRequestId.get(requestId);
      if (existing) {
        const player = stmts.getPlayerById.get(playerId);
        return { bet: existing, balance: player ? player.credits : 0, alreadyProcessed: true };
      }
    }

    // 2. Verify player and balance
    const player = stmts.getPlayerById.get(playerId);
    if (!player) throw new Error('Player not found');
    if (player.is_disabled) throw new Error('Player account is disabled');
    if (player.credits < betAmount) throw new Error('Insufficient credits');

    // 3. Verify round is open
    const round = stmts.getRoundById.get(roundId);
    if (!round) throw new Error('Round not found');
    if (round.status !== 'BETTING_OPEN') throw new Error('Betting is not currently open');

    // 4. Deduct balance
    const balanceBefore = player.credits;
    const balanceAfter = balanceBefore - betAmount;
    stmts.updatePlayerBalance.run(balanceAfter, playerId);

    // 5. Insert transaction record
    const stringValue = betValue !== null && betValue !== undefined ? String(betValue) : '';
    stmts.insertTransaction.run(
      playerId,
      roundId,
      'BET',
      -betAmount,
      balanceBefore,
      balanceAfter,
      `Wager on ${betType}${stringValue ? ' (' + stringValue + ')' : ''}`
    );

    // 6. Insert bet record
    const res = stmts.insertBet.run(roundId, playerId, betType, stringValue, betAmount, requestId || null);
    const betId = res.lastInsertRowid;

    return {
      bet: {
        id: betId,
        round_id: roundId,
        player_id: playerId,
        bet_type: betType,
        bet_value: stringValue,
        wager: betAmount,
        result: 'pending'
      },
      balance: balanceAfter,
      alreadyProcessed: false
    };
  });

  return txn();
}

/**
 * Undo the player's last pending bet for the active round
 */
function undoLastBet(playerId, roundId) {
  const txn = db.transaction(() => {
    const round = stmts.getRoundById.get(roundId);
    if (!round || round.status !== 'BETTING_OPEN') {
      throw new Error('Can only undo bets while betting is open');
    }

    const lastBet = stmts.getLastPendingBetByPlayerAndRound.get(roundId, playerId);
    if (!lastBet) {
      throw new Error('No pending bets to undo');
    }

    const player = stmts.getPlayerById.get(playerId);
    const balanceBefore = player.credits;
    const balanceAfter = balanceBefore + lastBet.wager;

    stmts.updatePlayerBalance.run(balanceAfter, playerId);
    stmts.deleteBet.run(lastBet.id);

    stmts.insertTransaction.run(
      playerId,
      roundId,
      'REFUND',
      lastBet.wager,
      balanceBefore,
      balanceAfter,
      `Undo bet #${lastBet.id} on ${lastBet.bet_type} (${lastBet.bet_value})`
    );

    const remainingBets = stmts.getBetsByPlayerAndRound.all(roundId, playerId);
    return {
      undoneBet: lastBet,
      balance: balanceAfter,
      remainingBets
    };
  });

  return txn();
}

/**
 * Clear all pending bets placed by a player in the active round
 */
function clearBets(playerId, roundId) {
  const txn = db.transaction(() => {
    const round = stmts.getRoundById.get(roundId);
    if (!round || round.status !== 'BETTING_OPEN') {
      throw new Error('Can only clear bets while betting is open');
    }

    const pendingBets = stmts.getBetsByPlayerAndRound.all(roundId, playerId);
    if (pendingBets.length === 0) {
      return { clearedCount: 0, balance: stmts.getPlayerById.get(playerId).credits, remainingBets: [] };
    }

    const totalRefund = pendingBets.reduce((acc, b) => acc + b.wager, 0);
    const player = stmts.getPlayerById.get(playerId);
    const balanceBefore = player.credits;
    const balanceAfter = balanceBefore + totalRefund;

    stmts.updatePlayerBalance.run(balanceAfter, playerId);

    for (const b of pendingBets) {
      stmts.deleteBet.run(b.id);
    }

    stmts.insertTransaction.run(
      playerId,
      roundId,
      'REFUND',
      totalRefund,
      balanceBefore,
      balanceAfter,
      `Cleared all ${pendingBets.length} bets for round #${roundId}`
    );

    return {
      clearedCount: pendingBets.length,
      refundedAmount: totalRefund,
      balance: balanceAfter,
      remainingBets: []
    };
  });

  return txn();
}

/**
 * Double all pending bets for the player in the active round
 */
function doubleBets(playerId, roundId) {
  const txn = db.transaction(() => {
    const round = stmts.getRoundById.get(roundId);
    if (!round || round.status !== 'BETTING_OPEN') {
      throw new Error('Can only double bets while betting is open');
    }

    const pendingBets = stmts.getPendingBetsByPlayerAndRound.all(roundId, playerId);
    if (pendingBets.length === 0) {
      throw new Error('No bets to double');
    }

    const player = stmts.getPlayerById.get(playerId);
    let totalAdditionalWager = 0;
    for (const b of pendingBets) {
      totalAdditionalWager += b.wager;
    }

    if (player.credits < totalAdditionalWager) {
      throw new Error(`Insufficient credits to double bets (Need ${totalAdditionalWager}, have ${player.credits})`);
    }

    const balanceBefore = player.credits;
    const balanceAfter = balanceBefore - totalAdditionalWager;
    stmts.updatePlayerBalance.run(balanceAfter, playerId);

    for (const b of pendingBets) {
      const reqId = `req_dbl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      stmts.insertBet.run(
        playerId,
        roundId,
        b.bet_type,
        b.bet_value,
        b.wager,
        reqId
      );
    }

    stmts.insertTransaction.run(
      playerId,
      roundId,
      'BET_PLACE',
      -totalAdditionalWager,
      balanceBefore,
      balanceAfter,
      `Doubled ${pendingBets.length} bets for round #${roundId}`
    );

    const allBets = stmts.getBetsByPlayerAndRound.all(roundId, playerId);
    return {
      balance: balanceAfter,
      currentBets: allBets
    };
  });

  return txn();
}

/**
 * Settle an entire round atomically:
 * Updates round record, evaluates all pending bets, credits payouts, writes ledger.
 */
function settleRound(roundId, dice) {
  const txn = db.transaction(() => {
    const total = dice[0] + dice[1] + dice[2];
    stmts.settleRound.run(dice[0], dice[1], dice[2], total, roundId);

    const pendingBets = stmts.getPendingBetsByRound.all(roundId);
    const playerSettlements = {}; // playerId -> { wonBets: [], lostBets: [], totalPayout: 0, newBalance: 0 }

    for (const bet of pendingBets) {
      const evaluation = calculatePayout(bet, dice);
      const resultStatus = evaluation.won ? 'won' : 'lost';
      const payoutAmount = evaluation.payout;

      stmts.updateBetSettled.run(payoutAmount, resultStatus, bet.id);

      if (!playerSettlements[bet.player_id]) {
        const player = stmts.getPlayerById.get(bet.player_id);
        playerSettlements[bet.player_id] = {
          playerId: bet.player_id,
          username: player.username,
          balance: player.credits,
          totalWon: 0,
          totalLost: 0,
          bets: []
        };
      }

      const pSummary = playerSettlements[bet.player_id];
      pSummary.bets.push({
        id: bet.id,
        type: bet.bet_type,
        value: bet.bet_value,
        wager: bet.wager,
        won: evaluation.won,
        payout: payoutAmount
      });

      if (evaluation.won) {
        pSummary.totalWon += payoutAmount;
        const balanceBefore = pSummary.balance;
        const balanceAfter = balanceBefore + payoutAmount;
        pSummary.balance = balanceAfter;

        stmts.updatePlayerBalance.run(balanceAfter, bet.player_id);
        stmts.insertTransaction.run(
          bet.player_id,
          roundId,
          'WIN',
          payoutAmount,
          balanceBefore,
          balanceAfter,
          `Win on ${bet.bet_type} (${bet.bet_value}) - Payout: ${payoutAmount}`
        );
      } else {
        pSummary.totalLost += bet.wager;
      }
    }

    return {
      roundId,
      dice,
      total,
      settlements: playerSettlements
    };
  });

  return txn();
}

/**
 * Startup recovery:
 * Detects any unfinished rounds, voids them, and refunds pending bets.
 */
function refundUnfinishedRounds() {
  const unfinished = stmts.getUnfinishedRounds.all();
  if (unfinished.length === 0) return 0;

  const txn = db.transaction(() => {
    let refundedBetsCount = 0;

    for (const round of unfinished) {
      const pendingBets = stmts.getPendingBetsByRound.all(round.id);

      for (const bet of pendingBets) {
        const player = stmts.getPlayerById.get(bet.player_id);
        const balanceBefore = player.credits;
        const balanceAfter = balanceBefore + bet.wager;

        stmts.updatePlayerBalance.run(balanceAfter, bet.player_id);
        stmts.voidBet.run(bet.id);

        stmts.insertTransaction.run(
          bet.player_id,
          round.id,
          'REFUND',
          bet.wager,
          balanceBefore,
          balanceAfter,
          `Server restart recovery: voided bet #${bet.id} for unfinished round #${round.id}`
        );
        refundedBetsCount++;
      }

      stmts.voidRound.run(round.id);
    }

    return refundedBetsCount;
  });

  return txn();
}

/**
 * Reset rounds and recent history on server start:
 * - Refunds any unfinished pending bets first so player balances stay accurate
 * - Deletes all bets and rounds history
 * - Resets SQLite auto-increment sequence for rounds and bets to restart from round #1
 */
function resetRoundsAndHistory() {
  refundUnfinishedRounds();

  const txn = db.transaction(() => {
    db.prepare('DELETE FROM bets').run();
    db.prepare('DELETE FROM rounds').run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('rounds', 'bets')").run();
    } catch (e) {
      // Ignored if sqlite_sequence does not exist
    }
  });

  txn();
}

/**
 * Admin balance adjustment with mandatory ledger entry
 */
function adminAdjustCredits(playerId, amount, reason, adminUserId) {
  const delta = parseInt(amount, 10);
  if (isNaN(delta) || delta === 0) {
    throw new Error('Adjustment amount must be a non-zero integer');
  }

  const txn = db.transaction(() => {
    const player = stmts.getPlayerById.get(playerId);
    if (!player) throw new Error('Player not found');

    const balanceBefore = player.credits;
    const balanceAfter = balanceBefore + delta;
    if (balanceAfter < 0) {
      throw new Error('Balance cannot be adjusted below zero');
    }

    stmts.updatePlayerBalance.run(balanceAfter, playerId);
    const type = delta > 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT';
    const ref = `Admin adjustment by user #${adminUserId || 'system'}: ${reason || 'No reason specified'}`;

    stmts.insertTransaction.run(
      playerId,
      null,
      type,
      delta,
      balanceBefore,
      balanceAfter,
      ref
    );

    return {
      playerId,
      balanceBefore,
      balanceAfter,
      delta
    };
  });

  return txn();
}

/**
 * Check if an admin account exists
 */
function hasAdminAccount() {
  const row = db.prepare('SELECT COUNT(*) as count FROM players WHERE is_admin = 1').get();
  return row.count > 0;
}

/**
 * Create initial admin account
 */
function createInitialAdmin(username, password) {
  return registerPlayer(username, password, 'Administrator', 0, 1);
}

module.exports = {
  db,
  stmts,
  registerPlayer,
  authenticatePlayer,
  loginByName,
  placeBet,
  undoLastBet,
  clearBets,
  doubleBets,
  settleRound,
  refundUnfinishedRounds,
  resetRoundsAndHistory,
  adminAdjustCredits,
  hasAdminAccount,
  createInitialAdmin
};
