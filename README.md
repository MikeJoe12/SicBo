# Sic Bo Multiplayer Casino Game

A full-stack, server-authoritative electronic multiplayer Sic Bo game built with **HTML5, CSS3, Vanilla JavaScript, Node.js, Express, Socket.IO, and SQLite**.

The architecture uses a single host computer (PC/Laptop or TV) as the shared **Casino Table**, while players connect from smartphones over Wi-Fi/LAN as private **Betting Terminals**.

---

## Key Features

- **Server-Authoritative Game Engine**: Dice rolls are generated using Node.js `crypto.randomInt(1, 7)`. Official results, payouts, and countdowns are strictly decided on the server.
- **Visual Design Reference**: Faithful dark green felt table layout with gold/yellow betting areas and dice, matching the classic Sic Bo board (`SICBO.jpg`).
- **Real-Time Multiplayer Synchronization**: Low-latency Socket.IO communication synchronizing round phases, countdowns, rolling animations, table wagers, and glowing winning positions.
- **Double-Entry Transaction Ledger**: Every credit balance update (`INITIAL_CREDIT`, `BET`, `WIN`, `REFUND`, `ADMIN_CREDIT`, `ADMIN_DEBIT`) is tracked in SQLite with `balance_before` and `balance_after`.
- **Fault-Tolerant Crash Recovery**: In the event of a sudden server restart, unfinished rounds are voided automatically and all outstanding wagers refunded to players.
- **Mobile-First Responsive Terminal**: Optimized for portrait mobile screens (360px–430px+), featuring chip denomination selectors (1, 5, 10, 25, 50, 100, 500), undo/clear bet actions, bet drawers, and personal history logs.
- **QR Code & LAN Auto-Discovery**: The table display automatically detects the computer's local Wi-Fi/LAN IPv4 address and generates a QR code for players to scan and play instantly.
- **Zero-Dependency Web Audio Synthesizer**: Realistic casino sound effects (chip clacks, countdown alerts, betting closed chimes, dice rattling, landing clatters, win fanfare) generated natively via the Web Audio API with a persistent mute button.
- **Comprehensive Administration Portal**: Live game state controls (pause, resume, force round), player management, credit adjustments with mandatory audit reasons, password resets, and transaction audit trails.

---

## Directory Structure

```
├── data/
│   └── sicbo.db               # SQLite database (WAL mode)
├── public/
│   ├── css/
│   │   ├── admin.css          # Administration portal styles
│   │   ├── auth.css           # Login & registration styles
│   │   ├── main.css           # Main casino table felt board styles
│   │   └── player.css         # Mobile betting terminal styles
│   ├── js/
│   │   ├── admin.js           # Admin controller
│   │   ├── audio.js           # Web Audio API synthesizer
│   │   ├── auth.js            # Authentication client
│   │   ├── common.js          # Shared dice renderers & formatters
│   │   ├── main.js            # Main table animation & socket sync
│   │   └── player.js          # Player terminal controller
│   ├── admin.html             # Administration dashboard (/admin)
│   ├── login.html             # Player login & signup (/login)
│   ├── main.html              # Shared table display (/table)
│   └── player.html            # Mobile player terminal (/player)
├── test/
│   └── sicboRules.test.js     # Automated unit tests for rule engine
├── database.js                # SQLite schema, atomic transactions, ledger
├── gameEngine.js              # Authoritative game loop & state machine
├── package.json               # Node.js dependencies and scripts
├── README.md                  # Documentation and setup guide
├── server.js                  # Express HTTP & Socket.IO server
├── sicboRules.js              # Pure function Sic Bo rule & payout engine
└── SICBO.jpg                  # Visual reference board asset
```

---

## Prerequisites

- **Node.js**: Version 18.0.0 or later (tested on Node v22.11.0).
- **Operating System**: Windows 10/11, macOS, or Linux.
- **Local Network**: Wi-Fi router or hotspot allowing device-to-device communication on port 3000.

---

## Installation & Setup

### 1. Install Dependencies
Open PowerShell or Command Prompt in the project folder and run:

```powershell
npm install
```

### 2. Run Automated Rule Engine Tests
Verify that all betting rules, boundary cases, triples, and payout calculations pass:

```powershell
npm test
```

### 3. Start the Server
For production / normal mode:
```powershell
npm start
```

For development mode (with auto-reload via nodemon):
```powershell
npm run dev
```

Upon startup, the console displays:
```
=================================================
            SIC BO MULTIPLAYER SERVER            
=================================================
Sic Bo server running
Player:     http://localhost:3000
Main Table: http://localhost:3000/table
Admin:      http://localhost:3000/admin
LAN access: http://192.168.x.x:3000
=================================================
[SECURITY] Initial Administrator account provisioned:
   Username: admin
   Password: AdminSicBo2026!
   (Please log in at /admin and update your password)
=================================================
```

---

## Connecting Players & Phones

1. **Host Computer / Main Table**:
   - Open Chrome or Edge on the host computer / TV and navigate to:
     `http://localhost:3000/table`
   - The dark green felt table will display the active round, 3D animated dice shaker, betting volumes, recent history, and a **QR Code**.

2. **Smartphones over Wi-Fi / LAN**:
   - Ensure the smartphone is connected to the same Wi-Fi network as the host computer.
   - Scan the QR code displayed on `/table` using the phone's camera, or type the printed LAN URL into the phone browser (e.g. `http://192.168.0.165:3000`).
   - Register a new player account (each new account starts with 1,000 virtual credits).

> [!NOTE]
> **Windows Firewall Configuration**: If smartphones cannot connect to the LAN IP, make sure Windows Firewall allows inbound connections on port 3000, or run:
> ```powershell
> New-NetFirewallRule -DisplayName "SicBo Game Server" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
> ```

---

## Game Rules & Payout Odds

| Bet Category | Description | Payout Ratio (Profit) | Total Return on \$100 Bet |
| :--- | :--- | :--- | :--- |
| **SMALL** | Total 4 to 10 inclusive (**triples lose**) | 1 : 1 | \$200 |
| **BIG** | Total 11 to 17 inclusive (**triples lose**) | 1 : 1 | \$200 |
| **Specific Totals: 4 or 17** | Total equals exactly 4 or 17 | 60 : 1 | \$6,100 |
| **Specific Totals: 5 or 16** | Total equals exactly 5 or 16 | 30 : 1 | \$3,100 |
| **Specific Totals: 6 or 15** | Total equals exactly 6 or 15 | 17 : 1 | \$1,800 |
| **Specific Totals: 7 or 14** | Total equals exactly 7 or 14 | 12 : 1 | \$1,300 |
| **Specific Totals: 8 or 13** | Total equals exactly 8 or 13 | 8 : 1 | \$900 |
| **Specific Totals: 9, 10, 11, 12** | Total equals 9, 10, 11, or 12 | 6 : 1 | \$700 |
| **Double Bets (1 to 6)** | At least two dice show the number | 10 : 1 | \$1,100 |
| **Specific Triple (1 to 6)** | All three dice show that specific number | 180 : 1 | \$18,100 |
| **Any Triple** | Any three identical dice (1-1-1 through 6-6-6) | 30 : 1 | \$3,100 |
| **Combinations (15 Pairs)** | Both selected distinct numbers appear | 5 : 1 | \$600 |
| **Single Number: 1 Match** | Selected number appears on 1 die | 1 : 1 | \$200 |
| **Single Number: 2 Matches**| Selected number appears on 2 dice | 2 : 1 | \$300 |
| **Single Number: 3 Matches**| Selected number appears on 3 dice | 3 : 1 | \$400 |

*Triples Rule*: When a triple occurs (e.g. 3-3-3 = 9), both SMALL and BIG bets lose, preserving the house rule of traditional Sic Bo.

---

## Administrator Portal

Access the admin dashboard at `http://localhost:3000/admin`.
Default credentials on initial startup:
- **Username**: `admin`
- **Password**: `AdminSicBo2026!`

### Admin Capabilities:
- **Game Controls**: Pause the game loop, resume game, or force start a new round immediately.
- **Player Management**: View player balances, create new accounts, suspend or reactivate players, reset passwords.
- **Credit Adjustments**: Add or deduct credits with a **mandatory audit reason** entered directly into the SQLite ledger.
- **Rounds Audit**: View full roll history, dice combinations, and totals.
- **Transaction Ledger**: Complete immutable audit trail of every credit transfer across all players.

---

## Resetting the Database

To start with a fresh clean database:
1. Stop the server (`Ctrl + C`).
2. Delete the file `data/sicbo.db` (and `data/sicbo.db-wal`, `data/sicbo.db-shm` if present).
3. Restart the server with `npm start`. All tables and default admin account will be automatically recreated.

---

## Virtual Credits Policy

This application is strictly for entertainment and educational purposes using virtual game credits. It does not support or process real-money transactions, deposits, withdrawals, or cash prizes.
