/**
 * Main Table Controller - Dealer-Controlled Mode
 * Features:
 * - 3 Big Dice displayed directly on the board matching SICBO.jpg
 * - Slower, suspenseful 3D rolling physics stopping ONE AT A TIME
 * - Player chips displayed directly on the table with player names inside each chip
 * - Direct Dealer Controls on the table HUD (Stop Betting, Roll Dice, New Round)
 * - Winning positions illumination
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // DOM Elements
  const roundDisplay = document.getElementById('roundDisplay');
  const phaseBadge = document.getElementById('phaseBadge');
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  const diceCupViewport = document.getElementById('diceCupViewport');
  const outcomeTotalBadge = document.getElementById('outcomeTotalBadge');
  const feltBoard = document.getElementById('feltBoard');
  const connectedPlayersVal = document.getElementById('connectedPlayersVal');
  const totalRoundPoolVal = document.getElementById('totalRoundPoolVal');
  const recentHistoryList = document.getElementById('recentHistoryList');
  const qrCodeImg = document.getElementById('qrCodeImg');
  const lanUrlDisplay = document.getElementById('lanUrlDisplay');

  // 3D Dice Cup Instance
  let diceCupInstance = null;
  function initDiceCup3D() {
    if (diceCupViewport && window.SicBoDiceCup && !diceCupInstance) {
      diceCupInstance = window.SicBoDiceCup.createDiceCup(diceCupViewport, {
        width: diceCupViewport.clientWidth || 340,
        height: 225
      });
    }
  }
  if (window.SicBoDiceCup) {
    initDiceCup3D();
  }
  window.addEventListener('dicecup:ready', () => {
    initDiceCup3D();
  });

  // Dealer Action Buttons
  const dealerStopBettingBtn = document.getElementById('dealerStopBettingBtn');
  const dealerRollDiceBtn = document.getElementById('dealerRollDiceBtn');
  const dealerNewRoundBtn = document.getElementById('dealerNewRoundBtn');

  let rollInterval = null;
  let rollTimeout1 = null;
  let rollTimeout2 = null;
  let rollTimeout3 = null;

  // Audio Toggle
  function updateAudioButton() {
    audioToggleBtn.textContent = window.casinoAudio.isMuted ? '🔇' : '🔊';
  }
  updateAudioButton();
  audioToggleBtn.addEventListener('click', () => {
    window.casinoAudio.toggleMute();
    updateAudioButton();
  });

  // Render 3 Dices on the 3D Cup
  function renderBigDice(dice) {
    if (diceCupInstance) {
      diceCupInstance.resetToSettled(dice);
    }
  }

  // 1. Populate Board Visual Elements Matching SICBO.jpg
  function populateBoardVisuals() {
    // Populate Doubles (1 to 6)
    for (let i = 1; i <= 6; i++) {
      const a = document.getElementById(`prev_d${i}_a`);
      const b = document.getElementById(`prev_d${i}_b`);
      if (a && b) {
        a.innerHTML = SicBoCommon.renderDiceFace(i, 'small');
        b.innerHTML = SicBoCommon.renderDiceFace(i, 'small');
      }
    }

    // Populate Triples (1 to 6)
    for (let i = 1; i <= 6; i++) {
      const a = document.getElementById(`prev_t${i}_a`);
      const b = document.getElementById(`prev_t${i}_b`);
      const c = document.getElementById(`prev_t${i}_c`);
      if (a && b && c) {
        a.innerHTML = SicBoCommon.renderDiceFace(i, 'triple');
        b.innerHTML = SicBoCommon.renderDiceFace(i, 'triple');
        c.innerHTML = SicBoCommon.renderDiceFace(i, 'triple');
      }
    }

    // Populate Any Triple 6 Mini Pairs
    const anyTripleGrid = document.getElementById('anyTripleMiniGrid');
    if (anyTripleGrid) {
      let previewHtml = '';
      for (let i = 1; i <= 6; i++) {
        previewHtml += `
          <div style="display: flex; gap: 2px; justify-content: center; align-items: center;">
            ${SicBoCommon.renderDiceFace(i, 'mini')}
            ${SicBoCommon.renderDiceFace(i, 'mini')}
          </div>
        `;
      }
      anyTripleGrid.innerHTML = previewHtml;
    }

    // Populate 15 Combinations Row (matching SICBO.jpg)
    const combosRow = document.getElementById('combosRow');
    if (combosRow) {
      let comboHtml = '';
      for (let i = 1; i <= 5; i++) {
        for (let j = i + 1; j <= 6; j++) {
          comboHtml += `
            <div class="bet-cell cell-combo" data-bet-key="combo_${i}_${j}">
              <span class="vol-badge" id="vol_combo_${i}_${j}">0</span>
              <div style="display: flex; flex-direction: column; gap: 3px; align-items: center; margin-bottom: 2px;">
                ${SicBoCommon.renderDiceFace(i, 'small')}
                ${SicBoCommon.renderDiceFace(j, 'small')}
              </div>
              <div class="bet-odds">1:5</div>
            </div>
          `;
        }
      }
      combosRow.innerHTML = comboHtml;
    }

    // Populate Single Numbers Row (1 to 6)
    const singlesRow = document.getElementById('singlesRow');
    if (singlesRow) {
      let singleHtml = '';
      for (let i = 1; i <= 6; i++) {
        singleHtml += `
          <div class="bet-cell cell-single" data-bet-key="single_${i}">
            <span class="vol-badge" id="vol_single_${i}">0</span>
            <div style="margin-bottom: 2px;">
              ${SicBoCommon.renderDiceFace(i, 'medium')}
            </div>
          </div>
        `;
      }
      singlesRow.innerHTML = singleHtml;
    }

    // Initialize 3 Big Dice on the Board
    renderBigDice([1, 2, 3]);
  }

  populateBoardVisuals();

  // 2. Fetch QR Code & LAN/Public Join URL
  const originQuery = encodeURIComponent(window.location.origin);
  fetch(`/api/qr?origin=${originQuery}`)
    .then(r => r.json())
    .then(data => {
      if (data.qr) qrCodeImg.src = data.qr;
      if (data.url) lanUrlDisplay.textContent = data.url;
    })
    .catch(err => console.error('Failed to load QR code:', err));

  // 3. Clear Highlights and Chips
  function clearHighlights() {
    document.querySelectorAll('.bet-cell.winning').forEach(el => {
      el.classList.remove('winning');
    });
  }

  function clearPlayerChips() {
    document.querySelectorAll('.cell-chips-holder').forEach(el => el.remove());
  }

  // 4. Highlight Winning Cells
  function highlightWinners(winningKeys) {
    clearHighlights();
    if (!winningKeys || !Array.isArray(winningKeys)) return;

    winningKeys.forEach(key => {
      const el = document.querySelector(`.bet-cell[data-bet-key="${key}"]`);
      if (el) el.classList.add('winning');
    });
  }

  // 5. Render Player Chips directly on each betting position on the table
  function renderPlayerChips(chipsByKey) {
    clearPlayerChips();
    if (!chipsByKey) return;

    for (const [key, playerList] of Object.entries(chipsByKey)) {
      const cell = document.querySelector(`.bet-cell[data-bet-key="${key}"]`);
      if (!cell || !playerList || playerList.length === 0) continue;

      let holder = cell.querySelector('.cell-chips-holder');
      if (!holder) {
        holder = document.createElement('div');
        holder.className = 'cell-chips-holder';
        cell.appendChild(holder);
      }

      holder.innerHTML = playerList.map(chip => `
        <div class="player-chip" style="--chip-bg: ${chip.chipColor || '#c0392b'};" title="${chip.playerName}: ${chip.wager} credits">
          <div class="chip-inner">
            <span class="chip-player-name">${chip.playerName}</span>
            <span class="chip-amount">${chip.wager}</span>
          </div>
        </div>
      `).join('');
    }
  }

  // 6. Update Volume Badges
  function updateVolumeBadges(betsByKey) {
    document.querySelectorAll('.vol-badge').forEach(badge => {
      badge.textContent = '0';
      badge.classList.remove('has-bets');
    });

    if (!betsByKey) return;

    for (const [key, amount] of Object.entries(betsByKey)) {
      const badge = document.getElementById(`vol_${key}`);
      if (badge && amount > 0) {
        badge.textContent = SicBoCommon.formatCredits(amount);
        badge.classList.add('has-bets');
      }
    }
  }

  // 7. Update Recent History
  function updateHistoryList(rounds) {
    if (!rounds || rounds.length === 0) {
      recentHistoryList.innerHTML = '<div style="color: #888; font-size: 13px; text-align: center; padding: 10px;">Waiting for first round...</div>';
      return;
    }

    recentHistoryList.innerHTML = rounds.slice(0, 10).map(r => {
      const d = r.dice;
      const total = r.total;
      const isTrip = d[0] === d[1] && d[1] === d[2];
      const isBig = total >= 11 && total <= 17 && !isTrip;
      const isSmall = total >= 4 && total <= 10 && !isTrip;

      let tagClass = 'triple';
      let tagText = 'TRIPLE';
      if (isBig) { tagClass = 'big'; tagText = 'BIG'; }
      if (isSmall) { tagClass = 'small'; tagText = 'SMALL'; }

      return `
        <div class="history-item">
          <div class="history-dice-group">
            ${SicBoCommon.renderDiceFace(d[0], 'mini')}
            ${SicBoCommon.renderDiceFace(d[1], 'mini')}
            ${SicBoCommon.renderDiceFace(d[2], 'mini')}
          </div>
          <div class="history-total-tag">= ${total}</div>
          <span class="history-badge ${tagClass}">${tagText}</span>
        </div>
      `;
    }).join('');
  }

  // 8. 3D Automatic Dice Cup Rolling Animation
  function startStagedRollingAnimation(officialDice) {
    clearTimeout(rollTimeout1);

    outcomeTotalBadge.textContent = '🎲 SHAKING DICE CUP...';
    window.casinoAudio.playDiceShake();

    // Trigger 3D jumping animation inside the automatic glass dome
    if (diceCupInstance) {
      diceCupInstance.roll(officialDice, 5000);
    }

    rollTimeout1 = setTimeout(() => {
      const total = officialDice[0] + officialDice[1] + officialDice[2];
      const isTriple = officialDice[0] === officialDice[1] && officialDice[1] === officialDice[2];
      const tag = isTriple ? 'TRIPLE' : (total >= 11 ? 'BIG' : 'SMALL');
      outcomeTotalBadge.textContent = `TOTAL: ${total} (${tag})`;
    }, 5000);
  }

  // 9. Dealer Button Handlers
  dealerStopBettingBtn.addEventListener('click', () => {
    socket.emit('dealer:stop-betting');
  });

  dealerRollDiceBtn.addEventListener('click', () => {
    socket.emit('dealer:roll-dice');
  });

  dealerNewRoundBtn.addEventListener('click', () => {
    socket.emit('dealer:new-round');
  });

  function updateDealerButtonsState(state) {
    dealerStopBettingBtn.disabled = state !== 'BETTING_OPEN';
    dealerRollDiceBtn.disabled = state !== 'BETTING_OPEN' && state !== 'BETTING_CLOSED';
    dealerNewRoundBtn.disabled = state === 'ROLLING';
  }

  // -------------------------------------------------------------
  // Socket.IO Events
  // -------------------------------------------------------------

  socket.on('connect', () => {
    socket.emit('register:table');
  });

  socket.on('game:state', (state) => {
    if (!state) return;

    roundDisplay.textContent = `Round #${state.roundId || '--'}`;
    phaseBadge.textContent = state.state;
    updateDealerButtonsState(state.state);

    if (state.state === 'BETTING_OPEN') {
      phaseBadge.className = 'phase-badge';
      outcomeTotalBadge.textContent = 'PLACE YOUR BETS';
      clearHighlights();
    } else if (state.state === 'BETTING_CLOSED') {
      phaseBadge.className = 'phase-badge closed';
      phaseBadge.textContent = 'NO MORE BETS';
      outcomeTotalBadge.textContent = 'READY TO ROLL';
    } else if (state.state === 'ROLLING') {
      phaseBadge.className = 'phase-badge rolling';
      outcomeTotalBadge.textContent = 'ROLLING...';
    } else if (state.state === 'RESULT') {
      phaseBadge.className = 'phase-badge result';
      if (state.dice) {
        renderBigDice(state.dice);
        highlightWinners(state.winningKeys);
        const isTriple = state.dice[0] === state.dice[1] && state.dice[1] === state.dice[2];
        const tag = isTriple ? 'TRIPLE' : (state.total >= 11 ? 'BIG' : 'SMALL');
        outcomeTotalBadge.textContent = `TOTAL: ${state.total} (${tag})`;
      }
    }

    if (state.recentRounds) {
      updateHistoryList(state.recentRounds);
    }
  });

  socket.on('game:round-start', (data) => {
    roundDisplay.textContent = `Round #${data.roundId}`;
    phaseBadge.className = 'phase-badge';
    phaseBadge.textContent = 'BETTING OPEN';
    outcomeTotalBadge.textContent = 'PLACE YOUR BETS';
    updateDealerButtonsState('BETTING_OPEN');

    clearHighlights();
    clearPlayerChips();
    updateVolumeBadges({});
  });

  socket.on('game:betting-closed', () => {
    phaseBadge.className = 'phase-badge closed';
    phaseBadge.textContent = 'NO MORE BETS';
    outcomeTotalBadge.textContent = 'BETTING CLOSED';
    updateDealerButtonsState('BETTING_CLOSED');
    window.casinoAudio.playBell();
  });

  socket.on('game:rolling', (data) => {
    phaseBadge.className = 'phase-badge rolling';
    phaseBadge.textContent = 'ROLLING DICE';
    updateDealerButtonsState('ROLLING');

    const targetDice = data.dice || [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1
    ];
    startStagedRollingAnimation(targetDice);
  });

  socket.on('game:result', (data) => {
    clearTimeout(rollTimeout1);

    renderBigDice(data.dice);

    phaseBadge.className = 'phase-badge result';
    phaseBadge.textContent = 'RESULT';
    updateDealerButtonsState('RESULT');

    const isTriple = data.dice[0] === data.dice[1] && data.dice[1] === data.dice[2];
    const tag = isTriple ? 'TRIPLE' : (data.total >= 11 ? 'BIG' : 'SMALL');

    outcomeTotalBadge.textContent = `TOTAL: ${data.total} (${tag})`;
    highlightWinners(data.winningKeys);
    window.casinoAudio.playWin();

    if (data.recentRounds) {
      updateHistoryList(data.recentRounds);
    }
  });

  socket.on('table:stats', (stats) => {
    if (stats.activePlayersCount !== undefined) {
      connectedPlayersVal.textContent = stats.activePlayersCount;
    }
    if (stats.totalWager !== undefined) {
      totalRoundPoolVal.textContent = SicBoCommon.formatCredits(stats.totalWager);
    }
    if (stats.betsByKey) {
      updateVolumeBadges(stats.betsByKey);
    }
    if (stats.chipsByKey) {
      renderPlayerChips(stats.chipsByKey);
    }
  });
});

