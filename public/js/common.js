/**
 * Common utilities and dice rendering for Sic Bo
 */

function formatCredits(num) {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-US');
}

function generateRequestId() {
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Returns HTML string representing a casino die face with authentic pip layout
 * @param {number} value 1-6
 * @param {string} size 'small', 'medium', 'large', 'mini'
 */
function renderDiceFace(value, size = 'medium') {
  const val = parseInt(value, 10);
  if (isNaN(val) || val < 1 || val > 6) {
    return `<div class="dice-face dice-${size} empty-die">?</div>`;
  }

  // Generate pips according to standard dice face patterns
  const pips = [];
  switch (val) {
    case 1:
      pips.push('<span class="pip center"></span>');
      break;
    case 2:
      pips.push('<span class="pip top-left"></span>');
      pips.push('<span class="pip bottom-right"></span>');
      break;
    case 3:
      pips.push('<span class="pip top-left"></span>');
      pips.push('<span class="pip center"></span>');
      pips.push('<span class="pip bottom-right"></span>');
      break;
    case 4:
      pips.push('<span class="pip top-left"></span>');
      pips.push('<span class="pip top-right"></span>');
      pips.push('<span class="pip bottom-left"></span>');
      pips.push('<span class="pip bottom-right"></span>');
      break;
    case 5:
      pips.push('<span class="pip top-left"></span>');
      pips.push('<span class="pip top-right"></span>');
      pips.push('<span class="pip center"></span>');
      pips.push('<span class="pip bottom-left"></span>');
      pips.push('<span class="pip bottom-right"></span>');
      break;
    case 6:
      pips.push('<span class="pip top-left"></span>');
      pips.push('<span class="pip top-right"></span>');
      pips.push('<span class="pip middle-left"></span>');
      pips.push('<span class="pip middle-right"></span>');
      pips.push('<span class="pip bottom-left"></span>');
      pips.push('<span class="pip bottom-right"></span>');
      break;
  }

  return `<div class="dice-face dice-${size} face-${val}" data-val="${val}">${pips.join('')}</div>`;
}

/**
 * Returns human-readable label for any bet type
 */
function getBetDisplayName(type, value) {
  const t = String(type).toLowerCase();
  switch (t) {
    case 'small':
      return 'SMALL (4-10)';
    case 'big':
      return 'BIG (11-17)';
    case 'total':
      return `TOTAL ${value}`;
    case 'double':
      return `DOUBLE ${value}`;
    case 'triple':
      return `TRIPLE ${value}`;
    case 'any_triple':
      return 'ANY TRIPLE';
    case 'combination': {
      const parts = String(value).split(/[-,_]/);
      return `COMBO ${parts[0]} + ${parts[1]}`;
    }
    case 'single':
      return `SINGLE ${value}`;
    default:
      return `${type} ${value || ''}`.trim();
  }
}

window.SicBoCommon = {
  formatCredits,
  generateRequestId,
  renderDiceFace,
  getBetDisplayName
};
