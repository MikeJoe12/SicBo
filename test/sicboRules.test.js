/**
 * Unit Tests for Sic Bo Rule Engine
 */

const assert = require('assert');
const {
  isTriple,
  calculateTotal,
  evaluateSmall,
  evaluateBig,
  evaluateTotalBet,
  evaluateDouble,
  evaluateTriple,
  evaluateAnyTriple,
  evaluateCombination,
  evaluateSingleNumber,
  calculatePayout,
  getAllWinningBetKeys,
  TOTAL_PAYOUT_ODDS
} = require('../sicboRules');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('--- Running Sic Bo Rule Tests ---');

// Test Case 1: [1, 2, 3]
it('Dice [1, 2, 3]: Total 6, Small wins, Big loses, Total 6 wins, Singles 1,2,3 win, Combos win', () => {
  const dice = [1, 2, 3];
  assert.strictEqual(calculateTotal(dice), 6);
  assert.strictEqual(isTriple(dice), false);
  assert.strictEqual(evaluateSmall(dice), true);
  assert.strictEqual(evaluateBig(dice), false);

  assert.strictEqual(evaluateTotalBet(dice, 6), true);
  assert.strictEqual(evaluateTotalBet(dice, 7), false);

  assert.strictEqual(evaluateSingleNumber(dice, 1), 1);
  assert.strictEqual(evaluateSingleNumber(dice, 2), 1);
  assert.strictEqual(evaluateSingleNumber(dice, 3), 1);
  assert.strictEqual(evaluateSingleNumber(dice, 4), 0);

  assert.strictEqual(evaluateCombination(dice, 1, 2), true);
  assert.strictEqual(evaluateCombination(dice, 1, 3), true);
  assert.strictEqual(evaluateCombination(dice, 2, 3), true);
  assert.strictEqual(evaluateCombination(dice, 3, 4), false);

  // Payout check
  const pSmall = calculatePayout({ bet_type: 'small', wager: 100 }, dice);
  assert.strictEqual(pSmall.won, true);
  assert.strictEqual(pSmall.multiplier, 1);
  assert.strictEqual(pSmall.payout, 200); // 100 stake + 100 win

  const pBig = calculatePayout({ bet_type: 'big', wager: 100 }, dice);
  assert.strictEqual(pBig.won, false);
  assert.strictEqual(pBig.payout, 0);

  const pTot6 = calculatePayout({ bet_type: 'total', bet_value: 6, wager: 10 }, dice);
  assert.strictEqual(pTot6.won, true);
  assert.strictEqual(pTot6.multiplier, 17);
  assert.strictEqual(pTot6.payout, 180); // 10 stake + 170 win
});

// Test Case 2: Triple [3, 3, 3]
it('Dice [3, 3, 3]: Total 9, Small loses, Big loses, Any Triple wins, Triple 3 wins, Double 3 wins, Single 3 pays 3:1', () => {
  const dice = [3, 3, 3];
  assert.strictEqual(calculateTotal(dice), 9);
  assert.strictEqual(isTriple(dice), true);

  // Critical Sic Bo rule: triples lose Small and Big
  assert.strictEqual(evaluateSmall(dice), false, 'Small must lose on [3, 3, 3]');
  assert.strictEqual(evaluateBig(dice), false, 'Big must lose on [3, 3, 3]');

  assert.strictEqual(evaluateAnyTriple(dice), true);
  assert.strictEqual(evaluateTriple(dice, 3), true);
  assert.strictEqual(evaluateTriple(dice, 2), false);

  assert.strictEqual(evaluateDouble(dice, 3), true);
  assert.strictEqual(evaluateDouble(dice, 4), false);

  assert.strictEqual(evaluateSingleNumber(dice, 3), 3);

  // Payout checks
  const pAnyTriple = calculatePayout({ bet_type: 'any_triple', wager: 50 }, dice);
  assert.strictEqual(pAnyTriple.won, true);
  assert.strictEqual(pAnyTriple.multiplier, 30);
  assert.strictEqual(pAnyTriple.payout, 1550); // 50 stake + 1500 win

  const pTriple3 = calculatePayout({ bet_type: 'triple', bet_value: 3, wager: 10 }, dice);
  assert.strictEqual(pTriple3.won, true);
  assert.strictEqual(pTriple3.multiplier, 180);
  assert.strictEqual(pTriple3.payout, 1810); // 10 stake + 1800 win

  const pDouble3 = calculatePayout({ bet_type: 'double', bet_value: 3, wager: 20 }, dice);
  assert.strictEqual(pDouble3.won, true);
  assert.strictEqual(pDouble3.multiplier, 10);
  assert.strictEqual(pDouble3.payout, 220); // 20 stake + 200 win

  const pSingle3 = calculatePayout({ bet_type: 'single', bet_value: 3, wager: 100 }, dice);
  assert.strictEqual(pSingle3.won, true);
  assert.strictEqual(pSingle3.multiplier, 3);
  assert.strictEqual(pSingle3.payout, 400); // 100 stake + 300 win
});

// Test Case 3: High Triple [6, 6, 6]
it('Dice [6, 6, 6]: Total 18, Big loses, Small loses, Any Triple wins, Triple 6 wins', () => {
  const dice = [6, 6, 6];
  assert.strictEqual(calculateTotal(dice), 18);
  assert.strictEqual(isTriple(dice), true);
  assert.strictEqual(evaluateBig(dice), false, 'Big must lose on [6, 6, 6]');
  assert.strictEqual(evaluateSmall(dice), false, 'Small must lose on [6, 6, 6]');
  assert.strictEqual(evaluateAnyTriple(dice), true);
  assert.strictEqual(evaluateTriple(dice, 6), true);
  assert.strictEqual(evaluateTriple(dice, 5), false);
  assert.strictEqual(evaluateDouble(dice, 6), true);
});

// Test Case 4: Boundary Totals 4, 10, 11, 17
it('Boundary Total 4: [1, 1, 2] -> Total 4, Small wins, Total 4 wins at 60:1, Double 1 wins', () => {
  const dice = [1, 1, 2];
  assert.strictEqual(calculateTotal(dice), 4);
  assert.strictEqual(evaluateSmall(dice), true);
  assert.strictEqual(evaluateBig(dice), false);
  assert.strictEqual(evaluateTotalBet(dice, 4), true);
  assert.strictEqual(evaluateDouble(dice, 1), true);

  const pTot4 = calculatePayout({ bet_type: 'total', bet_value: 4, wager: 10 }, dice);
  assert.strictEqual(pTot4.multiplier, 60);
  assert.strictEqual(pTot4.payout, 610);
});

it('Boundary Total 10: [1, 4, 5] -> Total 10, Small wins, Big loses, Total 10 wins at 6:1', () => {
  const dice = [1, 4, 5];
  assert.strictEqual(calculateTotal(dice), 10);
  assert.strictEqual(evaluateSmall(dice), true);
  assert.strictEqual(evaluateBig(dice), false);
  assert.strictEqual(evaluateTotalBet(dice, 10), true);

  const pTot10 = calculatePayout({ bet_type: 'total', bet_value: 10, wager: 100 }, dice);
  assert.strictEqual(pTot10.multiplier, 6);
  assert.strictEqual(pTot10.payout, 700);
});

it('Boundary Total 11: [2, 4, 5] -> Total 11, Big wins, Small loses, Total 11 wins at 6:1', () => {
  const dice = [2, 4, 5];
  assert.strictEqual(calculateTotal(dice), 11);
  assert.strictEqual(evaluateBig(dice), true);
  assert.strictEqual(evaluateSmall(dice), false);
  assert.strictEqual(evaluateTotalBet(dice, 11), true);

  const pTot11 = calculatePayout({ bet_type: 'total', bet_value: 11, wager: 100 }, dice);
  assert.strictEqual(pTot11.multiplier, 6);
  assert.strictEqual(pTot11.payout, 700);
});

it('Boundary Total 17: [5, 6, 6] -> Total 17, Big wins, Total 17 wins at 60:1, Double 6 wins', () => {
  const dice = [5, 6, 6];
  assert.strictEqual(calculateTotal(dice), 17);
  assert.strictEqual(evaluateBig(dice), true);
  assert.strictEqual(evaluateSmall(dice), false);
  assert.strictEqual(evaluateTotalBet(dice, 17), true);
  assert.strictEqual(evaluateDouble(dice, 6), true);

  const pTot17 = calculatePayout({ bet_type: 'total', bet_value: 17, wager: 10 }, dice);
  assert.strictEqual(pTot17.multiplier, 60);
  assert.strictEqual(pTot17.payout, 610);
});

// Test Case 5: All 14 Specific Totals Odds Verification
it('Specific Totals Odds Match Document Specifications', () => {
  const expectedOdds = {
    4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6,
    10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 17,
    16: 30, 17: 60
  };
  for (let total = 4; total <= 17; total++) {
    assert.strictEqual(TOTAL_PAYOUT_ODDS[total], expectedOdds[total], `Odds mismatch for total ${total}`);
  }
});

// Test Case 6: getAllWinningBetKeys for UI lighting
it('getAllWinningBetKeys accurately identifies all winning positions', () => {
  const dice = [3, 5, 6]; // Total 14, Big, Combos: (3,5), (3,6), (5,6), Singles: 3, 5, 6
  const keys = getAllWinningBetKeys(dice);
  assert.ok(keys.includes('big'));
  assert.ok(!keys.includes('small'));
  assert.ok(keys.includes('total_14'));
  assert.ok(keys.includes('combo_3_5'));
  assert.ok(keys.includes('combo_3_6'));
  assert.ok(keys.includes('combo_5_6'));
  assert.ok(keys.includes('single_3'));
  assert.ok(keys.includes('single_5'));
  assert.ok(keys.includes('single_6'));
  assert.ok(!keys.includes('single_1'));
  assert.ok(!keys.includes('any_triple'));
});

console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
if (passedTests === totalTests) {
  console.log('ALL SIC BO RULE TESTS PASSED!\n');
} else {
  process.exit(1);
}
