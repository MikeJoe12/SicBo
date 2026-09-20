/**
 * Modern Single-Page Mobile Sic Bo Player Terminal Controller
 * Renders authentic casino dice for all bets (Doubles, Triples, Any Triple, Singles)
 * Exactly matching table page look & feel.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const headerAvatarDot = document.getElementById('headerAvatarDot');
  const headerPlayerName = document.getElementById('headerPlayerName');
  const roundLabelMini = document.getElementById('roundLabelMini');
  const roadmapChipsRow = document.getElementById('roadmapChipsRow');
  const domeDice1 = document.getElementById('domeDice1');
  const domeDice2 = document.getElementById('domeDice2');
  const domeDice3 = document.getElementById('domeDice3');
  const domeStatusBanner = document.getElementById('domeStatusBanner');
  const soundBtn = document.getElementById('soundBtn');
  const wakeLockBtn = document.getElementById('wakeLockBtn');
  const historyBtn = document.getElementById('historyBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const playerCreditsDisplay = document.getElementById('playerCreditsDisplay');
  const totalWageredBottom = document.getElementById('totalWageredBottom');
  const playerAvatarCircle = document.getElementById('playerAvatarCircle');
  const playerNameTag = document.getElementById('playerNameTag');
  const chipSelectorTray = document.getElementById('chipSelectorTray');
  const doubleBetsBtn = document.getElementById('doubleBetsBtn');
  const undoBetBtn = document.getElementById('undoBetBtn');
  const clearBetsBtn = document.getElementById('clearBetsBtn');

  // Modals & Drawers
  const openCombosBtn = document.getElementById('openCombosBtn');
  const combosModalBackdrop = document.getElementById('combosModalBackdrop');
  const closeCombosModalBtn = document.getElementById('closeCombosModalBtn');
  const combosDrawerGrid = document.getElementById('combosDrawerGrid');

  const historyModalBackdrop = document.getElementById('historyModalBackdrop');
  const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
  const historyModalList = document.getElementById('historyModalList');

  const resultModalBackdrop = document.getElementById('resultModalBackdrop');
  const closeResultModalBtn = document.getElementById('closeResultModalBtn');
  const dismissResultBtn = document.getElementById('dismissResultBtn');
  const settlementOutcomeText = document.getElementById('settlementOutcomeText');
  const settlementDiceDisplay = document.getElementById('settlementDiceDisplay');
  const settlementWonVal = document.getElementById('settlementWonVal');
  const settlementLostVal = document.getElementById('settlementLostVal');
  const settlementNewBalVal = document.getElementById('settlementNewBalVal');

  let currentPlayer = null;
  let currentRoundId = null;
  let currentRoundState = 'BETTING_OPEN';
  let selectedChip = 25;
  let currentBets = [];
  let rollAnimTimer = null;
  let stagedTimers = [];

  // 1. Authenticate with Server
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.success || !data.player) {
      window.location.href = '/login';
      return;
    }
    currentPlayer = data.player;
    const initial = (currentPlayer.display_name || currentPlayer.username || 'P')[0].toUpperCase();
    if (headerAvatarDot) headerAvatarDot.textContent = initial;
    if (playerAvatarCircle) playerAvatarCircle.textContent = initial;
    if (headerPlayerName) headerPlayerName.textContent = currentPlayer.display_name || currentPlayer.username;
    if (playerNameTag) playerNameTag.textContent = currentPlayer.display_name || currentPlayer.username;
    playerCreditsDisplay.textContent = SicBoCommon.formatCredits(currentPlayer.credits);
  } catch (err) {
    window.location.href = '/login';
    return;
  }

  // 2. Sound Toggle
  function updateSoundBtn() {
    soundBtn.innerHTML = window.casinoAudio.isMuted
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  }
  updateSoundBtn();
  soundBtn.addEventListener('click', () => {
    window.casinoAudio.toggleMute();
    updateSoundBtn();
  });

  // -------------------------------------------------------------
  // Screen Wake Lock (Keep Screen On) - Adopted from Backgammon
  // -------------------------------------------------------------
  let wakeLock = null;
  let keepAwakeEnabled = localStorage.getItem('sicbo_wake_lock') !== 'false';
  let wakeLockRequestInProgress = false;

  function updateWakeLockUI() {
    if (!wakeLockBtn) return;
    if (keepAwakeEnabled) {
      wakeLockBtn.classList.add('wake-active');
      wakeLockBtn.classList.remove('wake-inactive');
      wakeLockBtn.title = 'Keep Screen On: Active';
    } else {
      wakeLockBtn.classList.add('wake-inactive');
      wakeLockBtn.classList.remove('wake-active');
      wakeLockBtn.title = 'Keep Screen On: Disabled';
    }
  }

  async function enableWakeLock(showNotification = false) {
    keepAwakeEnabled = true;
    localStorage.setItem('sicbo_wake_lock', 'true');
    updateWakeLockUI();

    if (wakeLock || wakeLockRequestInProgress) return;
    if (!('wakeLock' in navigator)) {
      if (showNotification) {
        alertToast('Keep Screen On requires HTTPS connection');
      }
      return;
    }

    try {
      wakeLockRequestInProgress = true;
      wakeLock = await navigator.wakeLock.request('screen');

      if (showNotification) {
        alertToast('Screen Stay Awake: ON ☀️', true);
      }

      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        if (keepAwakeEnabled && document.visibilityState === 'visible') {
          setTimeout(() => enableWakeLock(false), 250);
        }
      });
    } catch (err) {
      console.warn('Screen Wake Lock request failed:', err);
      if (showNotification) {
        alertToast('Screen Wake Lock requires HTTPS');
      }
    } finally {
      wakeLockRequestInProgress = false;
    }
  }

  async function disableWakeLock(showNotification = false) {
    keepAwakeEnabled = false;
    localStorage.setItem('sicbo_wake_lock', 'false');
    updateWakeLockUI();

    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (err) {
        console.warn('Screen Wake Lock release failed:', err);
      }
      wakeLock = null;
    }

    if (showNotification) {
      alertToast('Screen Stay Awake: OFF');
    }
  }

  if (wakeLockBtn) {
    updateWakeLockUI();
    wakeLockBtn.addEventListener('click', () => {
      if (keepAwakeEnabled) {
        disableWakeLock(true);
      } else {
        enableWakeLock(true);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (keepAwakeEnabled && document.visibilityState === 'visible' && !wakeLock) {
      enableWakeLock(false);
    }
  });

  const reengageWakeLock = () => {
    if (keepAwakeEnabled && !wakeLock) {
      enableWakeLock(false);
    }
  };
  document.addEventListener('pointerdown', reengageWakeLock, { passive: true });
  document.addEventListener('touchstart', reengageWakeLock, { passive: true });

  if (keepAwakeEnabled) {
    enableWakeLock(false);
  }

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  // 3. Initialize Dome Dice Faces (if dome present)
  function renderDomeDice(d1, d2, d3, rolling = false) {
    if (!domeDice1 || !domeDice2 || !domeDice3) return;
    domeDice1.innerHTML = SicBoCommon.renderDiceFace(d1, 'dome');
    domeDice2.innerHTML = SicBoCommon.renderDiceFace(d2, 'dome');
    domeDice3.innerHTML = SicBoCommon.renderDiceFace(d3, 'dome');

    if (rolling) {
      domeDice1.firstElementChild?.classList.add('rolling');
      domeDice2.firstElementChild?.classList.add('rolling');
      domeDice3.firstElementChild?.classList.add('rolling');
    }
  }
  renderDomeDice(1, 2, 3);

  // 4. POPULATE CASINO DICE FACES (DOUBLES, TRIPLES, ANY TRIPLE, SINGLES)
  // Populate Doubles (1 to 6)
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById('doubleDiceFace_' + i);
    if (el) {
      el.innerHTML = SicBoCommon.renderDiceFace(i, 'double') + SicBoCommon.renderDiceFace(i, 'double');
    }
  }

  // Populate Triples (1 to 6) - Pyramid: 1 on top centered, 2 on bottom side by side
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById('tripleDiceFace_' + i);
    if (el) {
      el.innerHTML = '<div class="pyramid-top">' +
                     SicBoCommon.renderDiceFace(i, 'triple-mobile') +
                     '</div>' +
                     '<div class="pyramid-bottom">' +
                     SicBoCommon.renderDiceFace(i, 'triple-mobile') +
                     SicBoCommon.renderDiceFace(i, 'triple-mobile') +
                     '</div>';
    }
  }

  // Populate Any Triple 6 Mini Pairs
  const anyTripleGrid = document.getElementById('anyTripleMobileGrid');
  if (anyTripleGrid) {
    let previewHtml = '';
    for (let i = 1; i <= 6; i++) {
      previewHtml += '<div class="any-mini-pair">' +
                     SicBoCommon.renderDiceFace(i, 'mini') +
                     SicBoCommon.renderDiceFace(i, 'mini') +
                     '</div>';
    }
    anyTripleGrid.innerHTML = previewHtml;
  }

  // Populate Singles (1 to 6)
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById('singleDieFace_' + i);
    if (el) {
      el.innerHTML = SicBoCommon.renderDiceFace(i, 'single');
    }
  }

  // Populate Combos Drawer (15 Pairs)
  if (combosDrawerGrid) {
    let comboHtml = '';
    for (let i = 1; i <= 5; i++) {
      for (let j = i + 1; j <= 6; j++) {
        comboHtml += '<div class="combo-drawer-item touch-cell" data-type="combination" data-value="' + i + ',' + j + '">' +
                     '<div class="touch-placed-chip" id="chip_combo_' + i + '_' + j + '"></div>' +
                     '<div style="display: flex; gap: 3px; align-items: center; justify-content: center;">' +
                     SicBoCommon.renderDiceFace(i, 'double') +
                     SicBoCommon.renderDiceFace(j, 'double') +
                     '</div>' +
                     '<div style="font-size: 8.5px; font-weight: 800; color: #ffd358; margin-top: 1px;">1 : 5</div>' +
                     '</div>';
      }
    }
    combosDrawerGrid.innerHTML = comboHtml;
  }

  // 5. Chip Selection
  chipSelectorTray.addEventListener('click', (e) => {
    const chipEl = e.target.closest('.app-chip');
    if (!chipEl) return;

    document.querySelectorAll('.app-chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');
    selectedChip = parseInt(chipEl.getAttribute('data-val'), 10);
    window.casinoAudio.playChip();
  });

  // 6. Connect Socket.IO
  const socket = io();

  socket.on('connect', () => {
    socket.emit('player:sync');
  });

  socket.on('player:state', (data) => {
    if (data.player) {
      currentPlayer = data.player;
      playerCreditsDisplay.textContent = SicBoCommon.formatCredits(currentPlayer.credits);
    }
    if (data.currentBets) {
      currentBets = data.currentBets;
      renderPlacedChips();
    }
    if (data.gameState) {
      handleGameState(data.gameState);
    }
  });

  socket.on('player:balance', (data) => {
    if (data.balance !== undefined) {
      currentPlayer.credits = data.balance;
      playerCreditsDisplay.textContent = SicBoCommon.formatCredits(data.balance);
    }
  });

  // 7. Bet Placement (Felt grid + Combos drawer)
  document.body.addEventListener('click', (e) => {
    const cell = e.target.closest('.touch-cell');
    if (!cell) return;

    if (currentRoundState !== 'BETTING_OPEN') {
      alertToast('Betting is closed for this round');
      return;
    }

    if (currentPlayer.credits < selectedChip) {
      alertToast('Insufficient credits');
      return;
    }

    const betType = cell.getAttribute('data-type');
    const betValue = cell.getAttribute('data-value') || '';
    const requestId = SicBoCommon.generateRequestId();

    window.casinoAudio.playChip();

    socket.emit('bet:place', {
      betType,
      betValue,
      wager: selectedChip,
      requestId
    });
  });

  socket.on('bet:success', (data) => {
    currentPlayer.credits = data.balance;
    playerCreditsDisplay.textContent = SicBoCommon.formatCredits(data.balance);
    currentBets = data.currentBets;
    renderPlacedChips();
  });

  socket.on('bet:error', (err) => {
    alertToast(err.message || 'Bet placement failed');
  });

  // Double Bets
  doubleBetsBtn.addEventListener('click', () => {
    if (currentRoundState !== 'BETTING_OPEN') {
      alertToast('Cannot double bets: betting is closed');
      return;
    }
    if (currentBets.length === 0) return;
    socket.emit('bet:double');
    window.casinoAudio.playChip();
  });

  // Undo Last Bet
  undoBetBtn.addEventListener('click', () => {
    if (currentRoundState !== 'BETTING_OPEN') {
      alertToast('Cannot undo bet: betting is closed');
      return;
    }
    socket.emit('bet:undo');
  });

  socket.on('bet:undo-success', (data) => {
    currentPlayer.credits = data.balance;
    playerCreditsDisplay.textContent = SicBoCommon.formatCredits(data.balance);
    currentBets = data.currentBets;
    renderPlacedChips();
    window.casinoAudio.playChip();
  });

  // Clear All Bets
  clearBetsBtn.addEventListener('click', () => {
    if (currentRoundState !== 'BETTING_OPEN') {
      alertToast('Cannot clear bets: betting is closed');
      return;
    }
    if (currentBets.length === 0) return;

    if (confirm('Clear all bets for this round?')) {
      socket.emit('bet:clear');
    }
  });

  socket.on('bet:clear-success', (data) => {
    currentPlayer.credits = data.balance;
    playerCreditsDisplay.textContent = SicBoCommon.formatCredits(data.balance);
    currentBets = [];
    renderPlacedChips();
  });

  // 8. Render Player's Placed Chips with Name Inside
  function renderPlacedChips() {
    document.querySelectorAll('.touch-placed-chip').forEach(el => {
      el.innerHTML = '';
      el.classList.remove('active');
    });

    let totalWager = 0;
    const aggregated = {};

    currentBets.forEach(b => {
      totalWager += b.wager;

      let key = b.bet_type;
      if (b.bet_value) {
        if (b.bet_type === 'combination') {
          key = 'combo_' + b.bet_value.replace(/[,-]/g, '_');
        } else {
          key = b.bet_type + '_' + b.bet_value;
        }
      }

      aggregated[key] = (aggregated[key] || 0) + b.wager;

      const chipBadge = document.getElementById('chip_' + key);
      if (chipBadge) {
        const pName = currentPlayer ? (currentPlayer.display_name || currentPlayer.username) : 'YOU';
        chipBadge.innerHTML = '<span class="touch-chip-name">' + pName + '</span> ' + SicBoCommon.formatCredits(aggregated[key]);
        chipBadge.classList.add('active');
      }
    });

    totalWageredBottom.textContent = SicBoCommon.formatCredits(totalWager);

    const hasBets = currentBets.length > 0 && currentRoundState === 'BETTING_OPEN';
    doubleBetsBtn.disabled = !hasBets;
    undoBetBtn.disabled = !hasBets;
    clearBetsBtn.disabled = !hasBets;
  }

  // 9. Roadmap Bar Rendering (Fixed Triple Detection)
  function renderRoadmap(recentRounds) {
    if (!roadmapChipsRow || !recentRounds) return;
    roadmapChipsRow.innerHTML = recentRounds.map(r => {
      // Correctly check if dice array has all three equal values
      const d = r.dice;
      const isTriple = Array.isArray(d) && d.length === 3 && d[0] && d[0] === d[1] && d[1] === d[2];
      const isSmall = r.total <= 10;

      let badgeClass = 'big';
      let label = r.total + ' B';

      if (isTriple) {
        badgeClass = 'triple';
        label = r.total + ' T';
      } else if (isSmall) {
        badgeClass = 'small';
        label = r.total + ' S';
      }

      return '<div class="mini-roadmap-die ' + badgeClass + '">' + label + '</div>';
    }).join('');
  }

  // 10. Game State & Staged Dice Rolling Handlers
  function updatePhaseBanner(state) {
    if (!domeStatusBanner) return;
    if (state === 'BETTING_OPEN') {
      domeStatusBanner.textContent = 'BETTING OPEN';
      domeStatusBanner.style.color = '#2ecc71';
    } else if (state === 'BETTING_CLOSED') {
      domeStatusBanner.textContent = 'NO MORE BETS';
      domeStatusBanner.style.color = '#ff8e8e';
    } else if (state === 'ROLLING') {
      domeStatusBanner.textContent = 'ROLLING DICE...';
      domeStatusBanner.style.color = '#ffdf78';
    } else if (state === 'RESULT') {
      domeStatusBanner.textContent = 'ROUND RESULT';
      domeStatusBanner.style.color = '#78ffd6';
    }
  }

  function handleGameState(state) {
    if (!state) return;
    currentRoundId = state.roundId;
    currentRoundState = state.state;

    if (roundLabelMini) roundLabelMini.textContent = 'Round #' + (state.roundId || '--');
    updatePhaseBanner(state.state);
    renderRoadmap(state.recentRounds);

    if (state.state === 'RESULT' && state.dice) {
      renderDomeDice(state.dice[0], state.dice[1], state.dice[2]);
      highlightWinningCells(state.winningKeys);
    }
  }

  socket.on('game:state', handleGameState);

  socket.on('game:round-start', (data) => {
    currentRoundId = data.roundId;
    currentRoundState = 'BETTING_OPEN';
    currentBets = [];
    renderPlacedChips();
    clearWinningHighlights();
    resultModalBackdrop.classList.remove('open');

    if (roundLabelMini) roundLabelMini.textContent = 'Round #' + data.roundId;
    updatePhaseBanner('BETTING_OPEN');
    renderDomeDice(1, 2, 3);
  });

  socket.on('game:betting-closed', () => {
    currentRoundState = 'BETTING_CLOSED';
    updatePhaseBanner('BETTING_CLOSED');
    renderPlacedChips();
    window.casinoAudio.playBell();
  });

  // Rolling Phase Audio & Banner
  socket.on('game:rolling', (data) => {
    currentRoundState = 'ROLLING';
    updatePhaseBanner('ROLLING');
    clearWinningHighlights();

    if (rollAnimTimer) clearInterval(rollAnimTimer);
    stagedTimers.forEach(t => clearTimeout(t));
    stagedTimers = [];

    window.casinoAudio.playDiceShake();

    stagedTimers.push(setTimeout(() => {
      window.casinoAudio.playDiceLand();
    }, 4500));
  });

  socket.on('game:result', (data) => {
    currentRoundState = 'RESULT';
    updatePhaseBanner('RESULT');
    renderRoadmap(data.recentRounds);
    highlightWinningCells(data.winningKeys);
  });

  // Highlight Winning Cells on the Board
  function highlightWinningCells(winningKeys) {
    clearWinningHighlights();
    if (!winningKeys || !Array.isArray(winningKeys)) return;

    winningKeys.forEach(k => {
      let selector = '';
      if (k === 'small') selector = '[data-type="small"]';
      else if (k === 'big') selector = '[data-type="big"]';
      else if (k === 'any_triple') selector = '[data-type="any_triple"]';
      else if (k.startsWith('total_')) {
        const val = k.replace('total_', '');
        selector = '[data-type="total"][data-value="' + val + '"]';
      } else if (k.startsWith('double_')) {
        const val = k.replace('double_', '');
        selector = '[data-type="double"][data-value="' + val + '"]';
      } else if (k.startsWith('triple_')) {
        const val = k.replace('triple_', '');
        selector = '[data-type="triple"][data-value="' + val + '"]';
      } else if (k.startsWith('single_')) {
        const val = k.replace('single_', '');
        selector = '[data-type="single"][data-value="' + val + '"]';
      } else if (k.startsWith('combo_')) {
        const val = k.replace('combo_', '').replace('_', ',');
        selector = '[data-type="combination"][data-value="' + val + '"]';
      }

      if (selector) {
        document.querySelectorAll(selector).forEach(cell => cell.classList.add('winning'));
      }
    });
  }

  function clearWinningHighlights() {
    document.querySelectorAll('.touch-cell.winning').forEach(cell => cell.classList.remove('winning'));
  }

  // Personal Settlement Popup
  socket.on('player:round-result', (result) => {
    settlementOutcomeText.textContent = 'TOTAL: ' + result.total;
    settlementDiceDisplay.innerHTML =
      SicBoCommon.renderDiceFace(result.dice[0], 'medium') +
      SicBoCommon.renderDiceFace(result.dice[1], 'medium') +
      SicBoCommon.renderDiceFace(result.dice[2], 'medium');

    settlementWonVal.textContent = SicBoCommon.formatCredits(result.totalWon);
    settlementLostVal.textContent = SicBoCommon.formatCredits(result.totalLost);
    settlementNewBalVal.textContent = SicBoCommon.formatCredits(result.newBalance);

    currentPlayer.credits = result.newBalance;
    playerCreditsDisplay.textContent = SicBoCommon.formatCredits(result.newBalance);

    setTimeout(() => {
      resultModalBackdrop.classList.add('open');
      if (result.totalWon > 0) {
        window.casinoAudio.playWin();
      }
    }, 700);
  });

  // Modal Closures
  closeResultModalBtn.addEventListener('click', () => resultModalBackdrop.classList.remove('open'));
  dismissResultBtn.addEventListener('click', () => resultModalBackdrop.classList.remove('open'));
  resultModalBackdrop.addEventListener('click', (e) => {
    if (e.target === resultModalBackdrop) resultModalBackdrop.classList.remove('open');
  });

  // Combos Drawer
  openCombosBtn.addEventListener('click', () => combosModalBackdrop.classList.add('open'));
  closeCombosModalBtn.addEventListener('click', () => combosModalBackdrop.classList.remove('open'));
  combosModalBackdrop.addEventListener('click', (e) => {
    if (e.target === combosModalBackdrop) combosModalBackdrop.classList.remove('open');
  });

  // Betting History
  historyBtn.addEventListener('click', async () => {
    historyModalBackdrop.classList.add('open');
    historyModalList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Loading history...</div>';

    try {
      const res = await fetch('/api/player/history');
      const data = await res.json();
      if (!data.success || !data.history || data.history.length === 0) {
        historyModalList.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No betting history found.</div>';
        return;
      }

      historyModalList.innerHTML = data.history.map(item =>
        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); border-left: 3px solid ' + (item.result === 'won' ? '#2ecc71' : '#e74c3c') + '; margin-bottom: 4px; background: rgba(0,0,0,0.3);">' +
        '<div>' +
        '<div style="font-weight: 800; font-size: 12px; color: #fff;">Round #' + item.round_id + ' - ' + SicBoCommon.getBetDisplayName(item.bet_type, item.bet_value) + '</div>' +
        '<div style="font-size: 10px; color: #aaa; margin-top: 2px;">Dice: [' + item.dice1 + ', ' + item.dice2 + ', ' + item.dice3 + '] (Total: ' + item.total + ')</div>' +
        '</div>' +
        '<div style="text-align: right;">' +
        '<div style="font-weight: 800; color: ' + (item.result === 'won' ? '#2ecc71' : '#ff7d6b') + '; font-size: 13px;">' +
        (item.result === 'won' ? '+' + SicBoCommon.formatCredits(item.payout) : '-' + SicBoCommon.formatCredits(item.wager)) +
        '</div>' +
        '<div style="font-size: 10px; text-transform: uppercase; color: #888;">' + item.result + '</div>' +
        '</div>' +
        '</div>'
      ).join('');
    } catch (err) {
      historyModalList.innerHTML = '<div style="text-align: center; color: #ff7d6b; padding: 20px;">Failed to load history.</div>';
    }
  });

  closeHistoryModalBtn.addEventListener('click', () => historyModalBackdrop.classList.remove('open'));
  historyModalBackdrop.addEventListener('click', (e) => {
    if (e.target === historyModalBackdrop) historyModalBackdrop.classList.remove('open');
  });

  // Simple Toast notification
  function alertToast(msg, isSuccess = false) {
    const toast = document.createElement('div');
    const bg = isSuccess ? 'rgba(39, 174, 96, 0.95)' : 'rgba(231, 76, 60, 0.95)';
    toast.style.cssText = `position: fixed; top: 50px; left: 50%; transform: translateX(-50%); background: ${bg}; color: #fff; padding: 6px 16px; border-radius: 16px; font-weight: 800; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.6); z-index: 500; transition: opacity 0.3s; pointer-events: none; white-space: nowrap;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
});

