/**
 * Comprehensive End-to-End Simulation & Verification Test
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database');
const { calculatePayout, getAllWinningBetKeys } = require('../sicboRules');

console.log('--- Starting Comprehensive Sic Bo Integration Test ---');

// 1. Create two test players
const p1Username = 'test_alice_' + Date.now();
const p2Username = 'test_bob_' + Date.now();

const p1 = db.registerPlayer(p1Username, 'password123', 'Alice', 1000);
const p2 = db.registerPlayer(p2Username, 'password123', 'Bob', 1000);

assert.strictEqual(p1.credits, 1000);
assert.strictEqual(p2.credits, 1000);
console.log('✓ Player accounts created with 1,000 initial credits.');

// 2. Start a test round
const roundRes = db.stmts.createRound.run('BETTING_OPEN');
const testRoundId = roundRes.lastInsertRowid;
console.log(`✓ Test round #${testRoundId} opened.`);

// 3. Player 1 bets 100 on BIG
const reqA1 = 'req_alice_1_' + Date.now();
const b1Res = db.placeBet(p1.id, testRoundId, 'big', null, 100, reqA1);
assert.strictEqual(b1Res.balance, 900);
assert.strictEqual(b1Res.bet.wager, 100);
console.log('✓ Alice placed 100 on BIG -> Balance: 900.');

// 4. Test Idempotency: Duplicate request ID should not double-deduct
const b1Dup = db.placeBet(p1.id, testRoundId, 'big', null, 100, reqA1);
assert.strictEqual(b1Dup.alreadyProcessed, true);
assert.strictEqual(b1Dup.balance, 900);
assert.strictEqual(db.stmts.getPlayerById.get(p1.id).credits, 900);
console.log('✓ Idempotency verified: Duplicate requestId did not double-deduct.');

// 5. Player 2 bets 25 on Total 9
const reqB1 = 'req_bob_1_' + Date.now();
const b2Res = db.placeBet(p2.id, testRoundId, 'total', 9, 25, reqB1);
assert.strictEqual(b2Res.balance, 975);
console.log('✓ Bob placed 25 on Total 9 -> Balance: 975.');

// 6. Test Undo: Bob undos his bet
const undoRes = db.undoLastBet(p2.id, testRoundId);
assert.strictEqual(undoRes.balance, 1000);
assert.strictEqual(db.stmts.getPlayerById.get(p2.id).credits, 1000);
console.log('✓ Bob undid his bet -> Balance restored to 1,000.');

// Bob re-places 25 on Total 9
const reqB2 = 'req_bob_2_' + Date.now();
db.placeBet(p2.id, testRoundId, 'total', 9, 25, reqB2);
assert.strictEqual(db.stmts.getPlayerById.get(p2.id).credits, 975);

// 7. Settle the round with official dice [3, 5, 6] (Total 14, BIG wins, Total 9 loses)
const officialDice = [3, 5, 6];
const settleData = db.settleRound(testRoundId, officialDice);

assert.strictEqual(settleData.total, 14);
assert.strictEqual(settleData.settlements[p1.id].totalWon, 200); // 100 stake + 100 profit
assert.strictEqual(settleData.settlements[p1.id].balance, 1100);

assert.strictEqual(settleData.settlements[p2.id].totalWon, 0);
assert.strictEqual(settleData.settlements[p2.id].totalLost, 25);
assert.strictEqual(settleData.settlements[p2.id].balance, 975);
console.log('✓ Round settled: Alice won 200 (Balance: 1,100), Bob lost 25 (Balance: 975).');

// 8. Verify Ledger Integrity
const aliceTxns = db.stmts.getTransactionsByPlayer.all(p1.id, 10);
assert.strictEqual(aliceTxns.length, 3); // INITIAL_CREDIT (1000), BET (-100), WIN (+200)
assert.strictEqual(aliceTxns[0].type, 'WIN');
assert.strictEqual(aliceTxns[0].balance_after, 1100);
console.log('✓ Alice transaction ledger validated.');

// 9. Admin Credit Adjustment
const adminAdj = db.adminAdjustCredits(p2.id, 500, 'VIP Tournament Reward', 1);
assert.strictEqual(adminAdj.balanceAfter, 1475);
assert.strictEqual(db.stmts.getPlayerById.get(p2.id).credits, 1475);
console.log('✓ Admin adjusted Bob credits (+500 with audit note) -> Balance: 1,475.');

// 10. Startup Recovery Test: simulate crashed round
const crashedRound = db.stmts.createRound.run('BETTING_OPEN').lastInsertRowid;
const reqACrashed = 'req_alice_crashed_' + Date.now();
db.placeBet(p1.id, crashedRound, 'small', null, 200, reqACrashed);
assert.strictEqual(db.stmts.getPlayerById.get(p1.id).credits, 900);

const refundedCount = db.refundUnfinishedRounds();
assert.strictEqual(refundedCount, 1);
assert.strictEqual(db.stmts.getPlayerById.get(p1.id).credits, 1100);
console.log('✓ Startup Crash Recovery verified: Pending bets refunded and round voided.');

console.log('\n--- ALL INTEGRATION VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
