/**
 * Main Sic Bo Game Server
 * Express HTTP + Socket.IO + SQLite Session Authentication
 */

const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const db = require('./database');
const GameEngine = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Trust reverse proxy for HTTPS / forwarded headers in production
app.set('trust proxy', 1);

// Helper: Get LAN IPv4 Address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIp = getLocalIpAddress();

// Express Session Setup
const sessionMiddleware = session({
  secret: 'sicbo-casino-secret-key-super-secure',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Serve static assets
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

// Serve main visual reference image if requested
app.use('/SICBO.jpg', express.static(path.join(__dirname, 'SICBO.jpg')));

// -------------------------------------------------------------
// HTTP Page Routes
// -------------------------------------------------------------

// Root route: Redirect to player login or player dashboard
app.get('/', (req, res) => {
  if (req.session && req.session.playerId) {
    res.redirect('/player');
  } else {
    res.redirect('/login');
  }
});

// Main Display (Casino Table screen for monitor/TV)
app.get('/table', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Player Interface (Mobile phone screen)
app.get('/player', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Login / Registration Interface
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Administrator Interface
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// QR Code generation endpoint (works automatically on both local LAN and public HTTPS)
app.get('/api/qr', async (req, res) => {
  try {
    let baseUrl = process.env.PUBLIC_URL || process.env.BASE_URL;

    if (!baseUrl) {
      // 1. Check if client passed its origin (e.g. from table frontend)
      const clientOrigin = req.query.origin;
      if (clientOrigin && !clientOrigin.includes('localhost') && !clientOrigin.includes('127.0.0.1')) {
        baseUrl = clientOrigin;
      } else {
        // 2. Check reverse proxy / host headers
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.get('host');
        if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
          baseUrl = `${proto}://${host}`;
        } else {
          // 3. Fallback for local Wi-Fi / LAN development
          baseUrl = `http://${localIp}:${PORT}`;
        }
      }
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/player`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
    res.json({ qr: qrDataUrl, url, lanIp: localIp });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// -------------------------------------------------------------
// Authentication REST API
// -------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Username must be >= 3 chars, password >= 4 chars' });
    }

    const player = db.registerPlayer(username.trim(), password, displayName ? displayName.trim() : username.trim());
    req.session.playerId = player.id;
    req.session.username = player.username;
    req.session.isAdmin = !!player.is_admin;

    res.json({ success: true, player });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const name = (req.body.name || req.body.username || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Please enter your name' });
    }

    let player;
    if (req.body.password) {
      player = db.authenticatePlayer(name, req.body.password);
      if (!player) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
    } else {
      // Name-only login for players!
      player = db.loginByName(name);
    }

    req.session.playerId = player.id;
    req.session.username = player.username;
    req.session.displayName = player.display_name;
    req.session.isAdmin = !!player.is_admin;

    res.json({ success: true, player });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const player = db.stmts.getPlayerById.get(req.session.playerId);
  if (!player) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Player not found' });
  }

  res.json({ success: true, player });
});

// -------------------------------------------------------------
// Admin REST API (Protected)
// -------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.playerId || !req.session.isAdmin) {
    return res.status(403).json({ error: 'Administrator access required' });
  }
  next();
}

const loggedInPlayerSockets = new Map(); // socket.id -> playerId

app.get('/api/admin/players', requireAdmin, (req, res) => {
  try {
    const activePlayerIds = new Set(Array.from(loggedInPlayerSockets.values()));
    if (activePlayerIds.size === 0) {
      return res.json({ success: true, players: [] });
    }
    const ids = Array.from(activePlayerIds);
    const placeholders = ids.map(() => '?').join(',');
    const players = db.db.prepare(`
      SELECT id, username, display_name, credits, is_admin, is_disabled, created_at, last_login 
      FROM players 
      WHERE id IN (${placeholders}) 
      ORDER BY id ASC
    `).all(...ids);
    res.json({ success: true, players });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/players/create', requireAdmin, (req, res) => {
  try {
    const { username, password, displayName, credits, isAdmin } = req.body;
    const player = db.registerPlayer(username, password, displayName, parseInt(credits, 10) || 1000, isAdmin ? 1 : 0);
    res.json({ success: true, player });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/players/:id/credits', requireAdmin, (req, res) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    const { amount, reason } = req.body;
    const result = db.adminAdjustCredits(playerId, amount, reason, req.session.playerId);

    // Notify connected player via socket if online
    broadcastPlayerBalance(playerId, result.balanceAfter);

    res.json({ success: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/players/:id/status', requireAdmin, (req, res) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    const { isDisabled } = req.body;
    db.stmts.updatePlayerDisabled.run(isDisabled ? 1 : 0, playerId);
    res.json({ success: true, isDisabled: !!isDisabled });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/players/:id/password', requireAdmin, (req, res) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    const hash = require('bcryptjs').hashSync(newPassword, 10);
    db.stmts.updatePlayerPassword.run(hash, playerId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/transactions', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const txns = db.stmts.getAllTransactions.all(limit);
    res.json({ success: true, transactions: txns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/rounds', requireAdmin, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const rounds = db.stmts.getRecentRounds.all(limit);
    res.json({ success: true, rounds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dealer & Admin Game Controls
app.post('/api/dealer/stop-betting', (req, res) => {
  const result = gameEngine.stopBetting();
  res.json(result);
});

app.post('/api/dealer/roll-dice', (req, res) => {
  const result = gameEngine.rollDice();
  res.json(result);
});

app.post('/api/dealer/new-round', (req, res) => {
  const result = gameEngine.startNewRound();
  res.json({ success: true, roundId: result.roundId, state: result.state });
});

// Admin-specific Game Controls (aliases)
app.post('/api/admin/game/stop-betting', requireAdmin, (req, res) => {
  const result = gameEngine.stopBetting();
  res.json(result);
});

app.post('/api/admin/game/roll-dice', requireAdmin, (req, res) => {
  const result = gameEngine.rollDice();
  res.json(result);
});

app.post('/api/admin/game/next-round', requireAdmin, (req, res) => {
  const result = gameEngine.startNewRound();
  res.json({ success: true, roundId: result.roundId, state: result.state });
});

// -------------------------------------------------------------
// Player Data Endpoints
// -------------------------------------------------------------

app.get('/api/player/history', (req, res) => {
  if (!req.session || !req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const history = db.stmts.getPlayerHistory.all(req.session.playerId, 50);
  res.json({ success: true, history });
});

// -------------------------------------------------------------
// Socket.IO Multiplayer & Real-Time Engine
// -------------------------------------------------------------

const gameEngine = new GameEngine();

const CHIP_PALETTE = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad', 
  '#d35400', '#16a085', '#2c3e50', '#b71540', '#0c2461', '#1e3799'
];

// Helper to calculate total volume and individual player chips for the active round
function getRoundBetTotals(roundId) {
  const bets = db.stmts.getPendingBetsWithPlayerByRound.all(roundId);
  const byKey = {};
  const chipsByKey = {}; // key -> [ { playerId, playerName, wager, chipColor } ]
  let totalWager = 0;

  for (const b of bets) {
    let key = b.bet_type;
    if (b.bet_value) {
      if (b.bet_type === 'combination') {
        key = `combo_${b.bet_value.replace(/[,-]/g, '_')}`;
      } else {
        key = `${b.bet_type}_${b.bet_value}`;
      }
    }
    byKey[key] = (byKey[key] || 0) + b.wager;
    totalWager += b.wager;

    if (!chipsByKey[key]) chipsByKey[key] = [];

    const existing = chipsByKey[key].find(c => c.playerId === b.player_id);
    if (existing) {
      existing.wager += b.wager;
    } else {
      const color = CHIP_PALETTE[b.player_id % CHIP_PALETTE.length];
      chipsByKey[key].push({
        playerId: b.player_id,
        playerName: b.display_name || b.username,
        wager: b.wager,
        chipColor: color
      });
    }
  }

  return { byKey, chipsByKey, totalWager, betCount: bets.length };
}

function broadcastTableStats() {
  const betTotals = getRoundBetTotals(gameEngine.roundId);
  const activeSockets = io.sockets.sockets.size;
  io.to('table').emit('table:stats', {
    activePlayersCount: activeSockets,
    totalWager: betTotals.totalWager,
    betsByKey: betTotals.byKey,
    chipsByKey: betTotals.chipsByKey
  });
}

function broadcastPlayerBalance(playerId, newBalance) {
  io.to(`player_${playerId}`).emit('player:balance', { balance: newBalance });
}

// Wire GameEngine events to Socket.IO broadcasts
gameEngine.on('game:round-start', (data) => {
  io.emit('game:round-start', data);
  broadcastTableStats();
});

gameEngine.on('game:betting-closed', (data) => {
  io.emit('game:betting-closed', data);
});

gameEngine.on('game:rolling', (data) => {
  io.emit('game:rolling', data);
});

gameEngine.on('game:result', (data) => {
  io.emit('game:result', {
    roundId: data.roundId,
    state: data.state,
    dice: data.dice,
    total: data.total,
    winningKeys: data.winningKeys,
    recentRounds: data.recentRounds
  });

  // Notify individual players of their personal settlement results
  if (data.settlements) {
    for (const [playerId, summary] of Object.entries(data.settlements)) {
      io.to(`player_${playerId}`).emit('player:round-result', {
        roundId: data.roundId,
        dice: data.dice,
        total: data.total,
        totalWon: summary.totalWon,
        totalLost: summary.totalLost,
        newBalance: summary.balance,
        bets: summary.bets
      });
      broadcastPlayerBalance(playerId, summary.balance);
    }
  }
});

gameEngine.on('game:round-ended', (data) => {
  io.emit('game:round-ended', data);
});

gameEngine.on('game:state', (data) => {
  io.emit('game:state', data);
});

// Periodic timer broadcast (every 1 second) to keep all devices tightly synchronized
setInterval(() => {
  if (gameEngine.state === 'BETTING_OPEN' && gameEngine.bettingClosesAt) {
    const remainingMs = Math.max(0, gameEngine.bettingClosesAt - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    io.emit('game:timer', {
      roundId: gameEngine.roundId,
      remainingSeconds,
      bettingClosesAt: gameEngine.bettingClosesAt
    });
  }
}, 1000);

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  const session = socket.request.session;
  const playerId = session ? session.playerId : null;

  if (playerId) {
    socket.join(`player_${playerId}`);
    loggedInPlayerSockets.set(socket.id, playerId);
  }

  // Client identifies role or registers view
  socket.on('register:table', () => {
    socket.join('table');
    // Send immediate table snapshot
    socket.emit('game:state', gameEngine.getPublicState());
    broadcastTableStats();
  });

  // Dealer / Host control events
  socket.on('dealer:stop-betting', () => {
    gameEngine.stopBetting();
  });

  socket.on('dealer:roll-dice', () => {
    gameEngine.rollDice();
  });

  socket.on('dealer:new-round', () => {
    gameEngine.startNewRound();
  });

  // Player sync / reconnect
  socket.on('player:sync', () => {
    if (!playerId) {
      socket.emit('player:error', { message: 'Not authenticated' });
      return;
    }

    const player = db.stmts.getPlayerById.get(playerId);
    if (!player) return;

    const currentBets = db.stmts.getBetsByPlayerAndRound.all(gameEngine.roundId, playerId);
    socket.emit('player:state', {
      player: {
        id: player.id,
        username: player.username,
        displayName: player.display_name,
        credits: player.credits
      },
      currentBets,
      gameState: gameEngine.getPublicState()
    });
  });

  // Place Bet
  socket.on('bet:place', (betData) => {
    if (!playerId) {
      socket.emit('bet:error', { message: 'You must be logged in to place bets' });
      return;
    }

    if (gameEngine.state !== 'BETTING_OPEN') {
      socket.emit('bet:error', { message: 'Betting is closed for this round' });
      return;
    }

    try {
      const { betType, betValue, wager, requestId } = betData;
      const result = db.placeBet(
        playerId,
        gameEngine.roundId,
        betType,
        betValue,
        wager,
        requestId
      );

      // Return personal bet confirmation and balance
      const currentBets = db.stmts.getBetsByPlayerAndRound.all(gameEngine.roundId, playerId);
      socket.emit('bet:success', {
        bet: result.bet,
        balance: result.balance,
        currentBets
      });

      broadcastPlayerBalance(playerId, result.balance);
      broadcastTableStats();
    } catch (err) {
      socket.emit('bet:error', { message: err.message || 'Failed to place bet' });
    }
  });

  // Undo Last Bet
  socket.on('bet:undo', () => {
    if (!playerId) return;

    if (gameEngine.state !== 'BETTING_OPEN') {
      socket.emit('bet:error', { message: 'Cannot undo bet: betting is closed' });
      return;
    }

    try {
      const result = db.undoLastBet(playerId, gameEngine.roundId);
      socket.emit('bet:undo-success', {
        undoneBet: result.undoneBet,
        balance: result.balance,
        currentBets: result.remainingBets
      });

      broadcastPlayerBalance(playerId, result.balance);
      broadcastTableStats();
    } catch (err) {
      socket.emit('bet:error', { message: err.message || 'Cannot undo bet' });
    }
  });

  // Clear All Bets
  socket.on('bet:clear', () => {
    if (!playerId) return;

    if (gameEngine.state !== 'BETTING_OPEN') {
      socket.emit('bet:error', { message: 'Cannot clear bets: betting is closed' });
      return;
    }

    try {
      const result = db.clearBets(playerId, gameEngine.roundId);
      socket.emit('bet:clear-success', {
        clearedCount: result.clearedCount,
        refundedAmount: result.refundedAmount,
        balance: result.balance,
        currentBets: []
      });

      broadcastPlayerBalance(playerId, result.balance);
      broadcastTableStats();
    } catch (err) {
      socket.emit('bet:error', { message: err.message || 'Cannot clear bets' });
    }
  });

  // Double Current Bets
  socket.on('bet:double', () => {
    if (!playerId) return;

    if (gameEngine.state !== 'BETTING_OPEN') {
      socket.emit('bet:error', { message: 'Cannot double bets: betting is closed' });
      return;
    }

    try {
      const result = db.doubleBets(playerId, gameEngine.roundId);
      socket.emit('bet:success', {
        balance: result.balance,
        currentBets: result.currentBets
      });

      broadcastPlayerBalance(playerId, result.balance);
      broadcastTableStats();
    } catch (err) {
      socket.emit('bet:error', { message: err.message || 'Cannot double bets' });
    }
  });

  socket.on('disconnect', () => {
    loggedInPlayerSockets.delete(socket.id);
    broadcastTableStats();
  });
});

// -------------------------------------------------------------
// Server Startup & Admin Provisioning
// -------------------------------------------------------------

server.listen(PORT, () => {
  console.log('\n=================================================');
  console.log('            SIC BO MULTIPLAYER SERVER            ');
  console.log('=================================================');
  console.log(`Sic Bo server running`);
  console.log(`Player:     http://localhost:${PORT}`);
  console.log(`Main Table: http://localhost:${PORT}/table`);
  console.log(`Admin:      http://localhost:${PORT}/admin`);
  console.log(`LAN access: http://${localIp}:${PORT}`);
  console.log('=================================================');

  // Check admin account
  if (!db.hasAdminAccount()) {
    const defaultAdminUser = 'admin';
    const defaultAdminPass = 'AdminSicBo2026!';
    db.createInitialAdmin(defaultAdminUser, defaultAdminPass);
    console.log('[SECURITY] Initial Administrator account provisioned:');
    console.log(`   Username: ${defaultAdminUser}`);
    console.log(`   Password: ${defaultAdminPass}`);
    console.log('   (Please log in at /admin and update your password)');
    console.log('=================================================\n');
  }

  // Start the authoritative game engine loop
  gameEngine.start();
});

module.exports = { app, server, io, gameEngine };
