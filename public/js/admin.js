/**
 * Admin Portal Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check Admin Authentication
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (!data.success || !data.player || !data.player.is_admin) {
      alert('Access restricted to administrators. Please log in with an admin account.');
      window.location.href = '/login';
      return;
    }
  } catch (err) {
    window.location.href = '/login';
    return;
  }

  // Socket.IO
  const socket = io();

  // Tab Navigation
  const tabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'playersTab') loadPlayers();
      if (tabId === 'roundsTab') loadRounds();
      if (tabId === 'ledgerTab') loadLedger();
    });
  });

  // Overview Live State
  const adminRoundId = document.getElementById('adminRoundId');
  const adminRoundState = document.getElementById('adminRoundState');
  const adminPauseStatus = document.getElementById('adminPauseStatus');

  socket.on('game:state', (state) => {
    if (!state) return;
    adminRoundId.textContent = `#${state.roundId || '--'}`;
    adminRoundState.textContent = state.state;
    adminPauseStatus.textContent = state.isPaused ? 'PAUSED' : 'RUNNING';
    adminPauseStatus.style.color = state.isPaused ? '#e74c3c' : '#2ecc71';
  });

  // Dealer & Game Engine Controls
  document.getElementById('adminStopBettingBtn').addEventListener('click', async () => {
    const res = await fetch('/api/admin/game/stop-betting', { method: 'POST' });
    const data = await res.json();
    if (!data.success && data.message) alert(data.message);
  });

  document.getElementById('adminRollDiceBtn').addEventListener('click', async () => {
    const res = await fetch('/api/admin/game/roll-dice', { method: 'POST' });
    const data = await res.json();
    if (!data.success && data.message) alert(data.message);
  });

  document.getElementById('adminNewRoundBtn').addEventListener('click', async () => {
    const res = await fetch('/api/admin/game/next-round', { method: 'POST' });
    const data = await res.json();
    if (!data.success && data.message) alert(data.message);
  });

  // Players Management
  const playersTableBody = document.getElementById('playersTableBody');
  const createPlayerForm = document.getElementById('createPlayerForm');

  async function loadPlayers() {
    try {
      const res = await fetch('/api/admin/players');
      const data = await res.json();
      if (!data.success) return;

      if (!data.players || data.players.length === 0) {
        playersTableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: #8b949e; padding: 24px;">
              No players are currently logged in. Connected players will appear here as soon as they enter their name and join the table.
            </td>
          </tr>
        `;
        return;
      }

      playersTableBody.innerHTML = data.players.map(p => `
        <tr>
          <td>${p.id}</td>
          <td><strong>${p.username}</strong></td>
          <td>${p.display_name}</td>
          <td style="color: var(--admin-gold); font-weight: 700;">${SicBoCommon.formatCredits(p.credits)}</td>
          <td>${p.is_admin ? '<span class="badge badge-admin">Admin</span>' : 'Player'}</td>
          <td>${p.is_disabled ? '<span class="badge badge-disabled">Suspended</span>' : '<span class="badge badge-active">Active</span>'}</td>
          <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '--'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="admin-btn secondary adjust-credits-btn" data-id="${p.id}" data-name="${p.username}">Adjust Credits</button>
              <button class="admin-btn secondary toggle-status-btn" data-id="${p.id}" data-disabled="${p.is_disabled}">
                ${p.is_disabled ? 'Enable' : 'Suspend'}
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load players:', err);
    }
  }

  // Create Player Form
  createPlayerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('newUsername').value.trim();
    const displayName = document.getElementById('newDisplayName').value.trim();
    const password = document.getElementById('newPassword').value;
    const credits = parseInt(document.getElementById('newCredits').value, 10) || 1000;
    const isAdmin = document.getElementById('newIsAdmin').checked;

    try {
      const res = await fetch('/api/admin/players/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password, credits, isAdmin })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Player ${data.player.username} created successfully.`);
        createPlayerForm.reset();
        loadPlayers();
      } else {
        alert(data.error || 'Failed to create player');
      }
    } catch (err) {
      alert('Network error');
    }
  });

  // Credit Adjustment Modal
  const creditModalBackdrop = document.getElementById('creditModalBackdrop');
  const creditAdjustForm = document.getElementById('creditAdjustForm');
  const adjustPlayerId = document.getElementById('adjustPlayerId');
  const adjustPlayerName = document.getElementById('adjustPlayerName');
  const adjustAmount = document.getElementById('adjustAmount');
  const adjustReason = document.getElementById('adjustReason');

  playersTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.adjust-credits-btn');
    if (btn) {
      adjustPlayerId.value = btn.getAttribute('data-id');
      adjustPlayerName.textContent = btn.getAttribute('data-name');
      adjustAmount.value = '';
      adjustReason.value = '';
      creditModalBackdrop.classList.add('open');
      return;
    }

    const toggleBtn = e.target.closest('.toggle-status-btn');
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-id');
      const isDisabled = toggleBtn.getAttribute('data-disabled') === '1';
      if (confirm(`${isDisabled ? 'Enable' : 'Suspend'} player #${id}?`)) {
        fetch(`/api/admin/players/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDisabled: !isDisabled })
        }).then(() => loadPlayers());
      }
    }
  });

  document.getElementById('closeCreditModalBtn').addEventListener('click', () => {
    creditModalBackdrop.classList.remove('open');
  });

  creditAdjustForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = adjustPlayerId.value;
    const amount = parseInt(adjustAmount.value, 10);
    const reason = adjustReason.value.trim();

    try {
      const res = await fetch(`/api/admin/players/${id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason })
      });
      const data = await res.json();
      if (data.success) {
        alert('Credits adjusted successfully.');
        creditModalBackdrop.classList.remove('open');
        loadPlayers();
      } else {
        alert(data.error || 'Adjustment failed');
      }
    } catch (err) {
      alert('Network error');
    }
  });

  // Rounds History
  const roundsTableBody = document.getElementById('roundsTableBody');
  async function loadRounds() {
    try {
      const res = await fetch('/api/admin/rounds?limit=50');
      const data = await res.json();
      if (!data.success) return;

      roundsTableBody.innerHTML = data.rounds.map(r => `
        <tr>
          <td><strong>#${r.id}</strong></td>
          <td>[${r.dice1}, ${r.dice2}, ${r.dice3}]</td>
          <td style="font-weight: 800; color: var(--admin-gold);">${r.total}</td>
          <td>${r.status}</td>
          <td>${r.ended_at ? new Date(r.ended_at).toLocaleTimeString() : '--'}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load rounds:', err);
    }
  }

  // Transaction Ledger
  const ledgerTableBody = document.getElementById('ledgerTableBody');
  async function loadLedger() {
    try {
      const res = await fetch('/api/admin/transactions?limit=100');
      const data = await res.json();
      if (!data.success) return;

      ledgerTableBody.innerHTML = data.transactions.map(t => `
        <tr>
          <td>${t.id}</td>
          <td><strong>${t.username}</strong> (${t.display_name})</td>
          <td>${t.round_id ? '#' + t.round_id : '--'}</td>
          <td><span class="badge ${t.amount >= 0 ? 'badge-active' : 'badge-disabled'}">${t.type}</span></td>
          <td style="font-weight: 800; color: ${t.amount >= 0 ? '#2ecc71' : '#ff8e8e'};">
            ${t.amount >= 0 ? '+' : ''}${SicBoCommon.formatCredits(t.amount)}
          </td>
          <td>${SicBoCommon.formatCredits(t.balance_before)}</td>
          <td>${SicBoCommon.formatCredits(t.balance_after)}</td>
          <td style="font-size: 12px; color: #8b949e;">${t.reference || '--'}</td>
          <td>${new Date(t.created_at).toLocaleTimeString()}</td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load ledger:', err);
    }
  }

  // Admin Logout
  document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
});
