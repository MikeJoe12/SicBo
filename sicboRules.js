/**
 * Sic Bo Rule Engine
 * Authoritative, pure functions for evaluating Sic Bo bets and calculating payouts.
 */

const TOTAL_PAYOUT_ODDS = {
  4: 60,
  5: 30,
  6: 17,
  7: 12,
  8: 8,
  9: 6,
  10: 6,
  11: 6,
  12: 6,
  13: 8,
  14: 12,
  15: 17,
  16: 30,
  17: 60
};

const DOUBLE_PAYOUT_ODDS = 10;
const SPECIFIC_TRIPLE_ODDS = 180;
const ANY_TRIPLE_ODDS = 30;
const COMBINATION_ODDS = 5;

/**
 * Check if all three dice have identical values.
 * @param {number[]} dice Array of 3 dice numbers [1-6]
 * @returns {boolean}
 */
function isTriple(dice) {
  if (!Array.isArray(dice) || dice.length !== 3) return false;
  return dice[0] === dice[1] && dice[1] === dice[2];
}

/**
 * Calculate the sum of the three dice.
 * @param {number[]} dice Array of 3 dice numbers [1-6]
 * @returns {number}
 */
function calculateTotal(dice) {
  return dice[0] + dice[1] + dice[2];
}

/**
 * Evaluate Small bet: Total 4 through 10, EXCEPT when a triple occurs.
 * @param {number[]} dice
 * @returns {boolean}
 */
function evaluateSmall(dice) {
  if (isTriple(dice)) return false;
  const total = calculateTotal(dice);
  return total >= 4 && total <= 10;
}

/**
 * Evaluate Big bet: Total 11 through 17, EXCEPT when a triple occurs.
 * @param {number[]} dice
 * @returns {boolean}
 */
function evaluateBig(dice) {
  if (isTriple(dice)) return false;
  const total = calculateTotal(dice);
  return total >= 11 && total <= 17;
}

/**
 * Evaluate specific total bet (4 through 17).
 * @param {number[]} dice
 * @param {number} selectedTotal
 * @returns {boolean}
 */
function evaluateTotalBet(dice, selectedTotal) {
  const target = Number(selectedTotal);
  if (target < 4 || target > 17) return false;
  return calculateTotal(dice) === target;
}

/**
 * Evaluate double bet: Win if at least two dice show the specified number.
 * @param {number[]} dice
 * @param {number} number Target number 1-6
 * @returns {boolean}
 */
function evaluateDouble(dice, number) {
  const target = Number(number);
  const count = dice.filter(d => d === target).length;
  return count >= 2;
}

/**
 * Evaluate specific triple bet: Win if all three dice show the specified number.
 * @param {number[]} dice
 * @param {number} number Target number 1-6
 * @returns {boolean}
 */
function evaluateTriple(dice, number) {
  const target = Number(number);
  return dice[0] === target && dice[1] === target && dice[2] === target;
}

/**
 * Evaluate any triple bet: Win if all three dice have the same value.
 * @param {number[]} dice
 * @returns {boolean}
 */
function evaluateAnyTriple(dice) {
  return isTriple(dice);
}

/**
 * Evaluate two-dice combination: Win if both numbers appear among the 3 dice.
 * @param {number[]} dice
 * @param {number} number1 First number (1-6)
 * @param {number} number2 Second number (1-6)
 * @returns {boolean}
 */
function evaluateCombination(dice, number1, number2) {
  const n1 = Number(number1);
  const n2 = Number(number2);
  if (n1 === n2) return false;
  return dice.includes(n1) && dice.includes(n2);
}

/**
 * Evaluate single number bet: Returns count of occurrences (0, 1, 2, or 3).
 * @param {number[]} dice
 * @param {number} number Target number (1-6)
 * @returns {number} Count of occurrences
 */
function evaluateSingleNumber(dice, number) {
  const target = Number(number);
  return dice.filter(d => d === target).length;
}

/**
 * Calculate the payout for a placed bet against the official dice.
 * @param {Object} bet { bet_type, bet_value, wager }
 * @param {number[]} dice [d1, d2, d3]
 * @returns {{ won: boolean, multiplier: number, payout: number }}
 * Note: Payout includes the returned original stake plus winnings: wager + (wager * multiplier)
 */
function calculatePayout(bet, dice) {
  const wager = Number(bet.wager || bet.amount || 0);
  const type = String(bet.bet_type || bet.type || '').toLowerCase();
  const rawValue = bet.bet_value !== undefined && bet.bet_value !== null ? bet.bet_value : bet.value;

  let won = false;
  let multiplier = 0;

  switch (type) {
    case 'small':
      won = evaluateSmall(dice);
      multiplier = won ? 1 : 0;
      break;

    case 'big':
      won = evaluateBig(dice);
      multiplier = won ? 1 : 0;
      break;

    case 'total': {
      const targetTotal = Number(rawValue);
      won = evaluateTotalBet(dice, targetTotal);
      multiplier = won ? (TOTAL_PAYOUT_ODDS[targetTotal] || 0) : 0;
      break;
    }

    case 'double': {
      const targetNum = Number(rawValue);
      won = evaluateDouble(dice, targetNum);
      multiplier = won ? DOUBLE_PAYOUT_ODDS : 0;
      break;
    }

    case 'triple': {
      const targetNum = Number(rawValue);
      won = evaluateTriple(dice, targetNum);
      multiplier = won ? SPECIFIC_TRIPLE_ODDS : 0;
      break;
    }

    case 'any_triple':
      won = evaluateAnyTriple(dice);
      multiplier = won ? ANY_TRIPLE_ODDS : 0;
      break;

    case 'combination': {
      let n1, n2;
      if (typeof rawValue === 'string') {
        const parts = rawValue.split(/[-,_]/).map(Number);
        n1 = parts[0];
        n2 = parts[1];
      } else if (Array.isArray(rawValue)) {
        n1 = Number(rawValue[0]);
        n2 = Number(rawValue[1]);
      }
      won = evaluateCombination(dice, n1, n2);
      multiplier = won ? COMBINATION_ODDS : 0;
      break;
    }

    case 'single': {
      const targetNum = Number(rawValue);
      const count = evaluateSingleNumber(dice, targetNum);
      if (count > 0) {
        won = true;
        // 1:1 for 1 die, 2:1 for 2 dice, 3:1 for 3 dice
        multiplier = count;
      } else {
        won = false;
        multiplier = 0;
      }
      break;
    }

    default:
      won = false;
      multiplier = 0;
  }

  const payout = won ? wager + (wager * multiplier) : 0;

  return {
    won,
    multiplier,
    payout
  };
}

/**
 * Returns a list of all winning bet keys for the board, so the table and player UI
 * can highlight all winning positions.
 * @param {number[]} dice
 * @returns {string[]} List of keys, e.g. ["big", "total_14", "combo_3_5", "single_3"]
 */
function getAllWinningBetKeys(dice) {
  const keys = [];
  const total = calculateTotal(dice);

  // Small / Big
  if (evaluateSmall(dice)) keys.push('small');
  if (evaluateBig(dice)) keys.push('big');

  // Total
  if (total >= 4 && total <= 17) {
    keys.push(`total_${total}`);
  }

  // Any Triple
  if (evaluateAnyTriple(dice)) {
    keys.push('any_triple');
  }

  // Doubles and Triples
  for (let i = 1; i <= 6; i++) {
    if (evaluateDouble(dice, i)) keys.push(`double_${i}`);
    if (evaluateTriple(dice, i)) keys.push(`triple_${i}`);
  }

  // Combinations (15 possible)
  for (let i = 1; i <= 5; i++) {
    for (let j = i + 1; j <= 6; j++) {
      if (evaluateCombination(dice, i, j)) {
        keys.push(`combo_${i}_${j}`);
      }
    }
  }

  // Singles
  for (let i = 1; i <= 6; i++) {
    if (evaluateSingleNumber(dice, i) > 0) {
      keys.push(`single_${i}`);
    }
  }

  return keys;
}

module.exports = {
  TOTAL_PAYOUT_ODDS,
  DOUBLE_PAYOUT_ODDS,
  SPECIFIC_TRIPLE_ODDS,
  ANY_TRIPLE_ODDS,
  COMBINATION_ODDS,
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
  getAllWinningBetKeys
};
