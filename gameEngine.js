/**
 * Authoritative Sic Bo Game Engine - Dealer-Controlled Mode
 * Manual Admin / Dealer flow:
 * Admin starts betting -> Admin stops betting -> Admin rolls dice -> Result displayed -> Admin starts new round.
 */

const crypto = require('crypto');
const db = require('./database');
const { getAllWinningBetKeys } = require('./sicboRules');

class GameEngine {
  constructor(options = {}) {
    this.ROLLING_DURATION = options.rollingDuration || 5000; // 5 seconds visual roll (slower, stops one by one)

    this.state = 'WAITING'; // WAITING, BETTING_OPEN, BETTING_CLOSED, ROLLING, RESULT
    this.roundId = null;
    this.dice = null;
    this.total = null;
    this.winningKeys = [];
    this.timerHandle = null;
    this.listeners = new Map();

    // Reset rounds and recent history on server startup (restarts round #1 and fresh history)
    db.resetRoundsAndHistory();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      }
    }
  }

  /**
   * Start initial round on boot
   */
  start() {
    this.startNewRound();
  }

  /**
   * Begin a new round: creates round in DB and opens betting.
   * No automatic countdown timer - betting remains open until dealer stops it.
   */
  startNewRound() {
    clearTimeout(this.timerHandle);

    // 1. Create round record in SQLite
    const res = db.stmts.createRound.run('BETTING_OPEN');
    this.roundId = res.lastInsertRowid;
    this.state = 'BETTING_OPEN';
    this.dice = null;
    this.total = null;
    this.winningKeys = [];

    this.emit('game:round-start', {
      roundId: this.roundId,
      state: this.state
    });
    this.emit('game:state', this.getPublicState());

    return this.getPublicState();
  }

  /**
   * Dealer Action: Stop betting ("No More Bets")
   */
  stopBetting() {
    if (this.state !== 'BETTING_OPEN') {
      return { success: false, message: `Cannot stop betting in state ${this.state}` };
    }

    this.state = 'BETTING_CLOSED';
    db.stmts.updateRoundStatus.run('BETTING_CLOSED', this.roundId);

    this.emit('game:betting-closed', {
      roundId: this.roundId,
      state: this.state
    });
    this.emit('game:state', this.getPublicState());

    return { success: true, state: this.state };
  }

  /**
   * Dealer Action: Roll the 3 dice
   */
  rollDice() {
    if (this.state !== 'BETTING_CLOSED' && this.state !== 'BETTING_OPEN') {
      return { success: false, message: `Cannot roll dice in state ${this.state}` };
    }

    // If betting was still open, close it first
    if (this.state === 'BETTING_OPEN') {
      db.stmts.updateRoundStatus.run('BETTING_CLOSED', this.roundId);
      this.emit('game:betting-closed', { roundId: this.roundId, state: 'BETTING_CLOSED' });
    }

    this.state = 'ROLLING';
    db.stmts.updateRoundStatus.run('ROLLING', this.roundId);

    // Cryptographically secure dice roll on server
    const d1 = crypto.randomInt(1, 7);
    const d2 = crypto.randomInt(1, 7);
    const d3 = crypto.randomInt(1, 7);
    this.dice = [d1, d2, d3];
    this.total = d1 + d2 + d3;
    this.winningKeys = getAllWinningBetKeys(this.dice);

    this.emit('game:rolling', {
      roundId: this.roundId,
      state: this.state,
      dice: this.dice,
      duration: this.ROLLING_DURATION
    });
    this.emit('game:state', this.getPublicState());

    clearTimeout(this.timerHandle);
    this.timerHandle = setTimeout(() => {
      this.revealAndSettle();
    }, this.ROLLING_DURATION);

    return { success: true, state: this.state };
  }

  /**
   * Reveal result, settle bets in SQLite, and light up winning positions
   */
  revealAndSettle() {
    this.state = 'RESULT';

    // Atomic settlement transaction in SQLite
    const settlementData = db.settleRound(this.roundId, this.dice);

    const resultPayload = {
      roundId: this.roundId,
      state: this.state,
      dice: this.dice,
      total: this.total,
      winningKeys: this.winningKeys,
      settlements: settlementData.settlements,
      recentRounds: this.getRecentRounds()
    };

    this.emit('game:result', resultPayload);
    this.emit('game:round-settled', resultPayload);
    this.emit('game:state', this.getPublicState());
  }

  /**
   * Get recent settled rounds for history display
   */
  getRecentRounds(limit = 10) {
    try {
      return db.stmts.getRecentRounds.all(limit).map(r => ({
        id: r.id,
        dice: [r.dice1, r.dice2, r.dice3],
        total: r.total,
        ended_at: r.ended_at
      }));
    } catch (err) {
      return [];
    }
  }

  /**
   * Public game state for any client
   */
  getPublicState() {
    return {
      roundId: this.roundId,
      state: this.state,
      dice: this.state === 'RESULT' || this.state === 'WAITING' ? this.dice : null,
      total: this.state === 'RESULT' || this.state === 'WAITING' ? this.total : null,
      winningKeys: this.state === 'RESULT' ? this.winningKeys : [],
      recentRounds: this.getRecentRounds(10)
    };
  }
}

module.exports = GameEngine;
