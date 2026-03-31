/* ══════════════════════════════════════════════════════════════════════
   BUSINESS — Indian Board Game  |  game.js
   WebSocket client + full game UI
   ══════════════════════════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────────────────────────────
const WS_URL   = 'http://business-game-backend-production.up.railway.app/ws';  // change to your server URL
const APP_PRE  = '/app';
const TOPIC    = '/topic';

// ── PLAYER COLORS ─────────────────────────────────────────────────────────
const PLAYER_COLORS = [
  '#E53935','#1E88E5','#43A047','#FB8C00',
  '#8E24AA','#00ACC1','#F4511E','#6D4C41'
];

// ── BOARD DATA (matching backend) ─────────────────────────────────────────
const COLOR_MAP = {
  BROWN:'#8B4513', LIGHT_BLUE:'#03A9F4', PINK:'#E91E8C',
  ORANGE:'#FF6D00', RED:'#B71C1C', YELLOW:'#F9A825',
  GREEN:'#2E7D32', DARK_BLUE:'#0D47A1',
  RAILROAD:'#37474F', UTILITY:'#607D8B'
};

/*
  40 tiles, positions 0-39.
  Layout: bottom row right→left (0-10), left col bottom→top (11-19),
  top row left→right (20-30), right col top→bottom (31-39)
*/
const BOARD_TILES = [
  // BOTTOM ROW: pos 0-10 (right to left)
  { pos:0,  type:'corner', label:'GO', icon:'🚦',     corner:'go' },
  { pos:1,  type:'prop',   name:'Ludhiana',  price:140, color:'BROWN' },
  { pos:2,  type:'chest',  label:'CHEST',  icon:'📦' },
  { pos:3,  type:'prop',   name:'Agra',      price:100, color:'BROWN' },
  { pos:4,  type:'tax',    label:'INCOME TAX',icon:'💸', value:200 },
  { pos:5,  type:'railroad',name:'Station',  price:200, color:'RAILROAD' },
  { pos:6,  type:'prop',   name:'Bhubaneswar',price:100,color:'LIGHT_BLUE'},
  { pos:7,  type:'chance', label:'CHANCE',  icon:'🎴' },
  { pos:8,  type:'prop',   name:'Panaji',    price:100, color:'LIGHT_BLUE'},
  { pos:9,  type:'prop',   name:'Vadodara',  price:120, color:'LIGHT_BLUE'},
  { pos:10, type:'corner', label:'JAIL',    icon:'🔒',  corner:'jail' },

  // LEFT COL: pos 11-19 (bottom to top)
  { pos:11, type:'prop',   name:'Patna',     price:140, color:'PINK' },
  { pos:12, type:'utility',name:'Electric',  price:150, color:'UTILITY'},
  { pos:13, type:'prop',   name:'Bhopal',    price:140, color:'PINK' },
  { pos:14, type:'prop',   name:'Indore',    price:160, color:'PINK' },
  { pos:15, type:'railroad',name:'Station',  price:200, color:'RAILROAD'},
  { pos:16, type:'prop',   name:'Nagpur',    price:180, color:'ORANGE' },
  { pos:17, type:'chest',  label:'CHEST',   icon:'📦' },
  { pos:18, type:'prop',   name:'Kochi',     price:180, color:'ORANGE' },
  { pos:19, type:'prop',   name:'Lucknow',   price:200, color:'ORANGE' },
  // WAIT - pos 20 is top-left corner, included in top row below

  // TOP ROW: pos 20-30 (left to right)
  { pos:20, type:'corner', label:'FREE PARKING',icon:'🅿️',corner:'park' },
  { pos:21, type:'prop',   name:'Ahmedabad',  price:220, color:'RED' },
  { pos:22, type:'chance', label:'CHANCE',   icon:'🎴' },
  { pos:23, type:'prop',   name:'Hyderabad',  price:220, color:'RED' },
  { pos:24, type:'prop',   name:'Pune',       price:240, color:'RED' },
  { pos:25, type:'railroad',name:'Station',   price:200, color:'RAILROAD'},
  { pos:26, type:'prop',   name:'Jaipur',     price:260, color:'YELLOW' },
  { pos:27, type:'prop',   name:'Chandigarh', price:260, color:'YELLOW' },
  { pos:28, type:'utility',name:'Water Works',price:150, color:'UTILITY' },
  { pos:29, type:'prop',   name:'Lucknow',    price:280, color:'YELLOW' },
  { pos:30, type:'corner', label:'GO TO JAIL',icon:'👮', corner:'gotojail'},

  // RIGHT COL: pos 31-39 (top to bottom)
  { pos:31, type:'prop',   name:'Chennai',    price:300, color:'GREEN' },
  { pos:32, type:'prop',   name:'Kolkata',    price:300, color:'GREEN' },
  { pos:33, type:'chest',  label:'CHEST',    icon:'📦' },
  { pos:34, type:'prop',   name:'Bengaluru',  price:320, color:'GREEN' },
  { pos:35, type:'railroad',name:'Station',   price:200, color:'RAILROAD'},
  { pos:36, type:'chance', label:'CHANCE',   icon:'🎴' },
  { pos:37, type:'prop',   name:'Delhi',      price:350, color:'DARK_BLUE'},
  { pos:38, type:'tax',    label:'SUPER TAX', icon:'💰', value:75 },
  { pos:39, type:'prop',   name:'Mumbai',     price:400, color:'DARK_BLUE'},
];

// ── STATE ─────────────────────────────────────────────────────────────────
let stompClient  = null;
let myPlayerId   = '';
let myPlayerName = '';
let currentGameId= '';
let gameState    = null;
let pendingTradeId = null;

// ── SCREEN ROUTING ────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── TABS (landing) ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

function genId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('create-game-id').value = id;
}

// ── WEBSOCKET ─────────────────────────────────────────────────────────────
function connectWS(onConnected) {
  const sock = new SockJS(WS_URL);
  stompClient = Stomp.over(sock);
  stompClient.debug = null;
  stompClient.connect({}, () => onConnected(), err => {
    showToast('❌ Could not connect to server');
    console.error(err);
  });
}

function subscribe(gameId) {
  stompClient.subscribe(`${TOPIC}/${gameId}`, msg => {
    const state = JSON.parse(msg.body);
    handleStateUpdate(state);
  });
}

function send(dest, headers, body) {
  stompClient.send(`${APP_PRE}${dest}`, headers, body || '');
}

// ── CREATE GAME ───────────────────────────────────────────────────────────
function createGame() {
  const name   = document.getElementById('create-player-name').value.trim();
  const gameId = document.getElementById('create-game-id').value.trim().toUpperCase();
  if (!name)   { showToast('Enter your name'); return; }
  if (!gameId) { showToast('Enter a game ID'); return; }

  myPlayerName = name;
  myPlayerId   = name.toLowerCase().replace(/\s+/g,'_') + '_' + Math.floor(Math.random()*1000);
  currentGameId = gameId;

  connectWS(() => {
    subscribe(gameId);
    send('/create', {}, gameId);
    // After create, join
    setTimeout(() => {
      send('/join', { gameId, playerId: myPlayerId });
    }, 300);
    showScreen('lobby');
    document.getElementById('lobby-game-id').textContent = gameId;
    document.getElementById('topbar-room').textContent = 'Room: ' + gameId;
  });
}

// ── JOIN GAME ─────────────────────────────────────────────────────────────
function joinGame() {
  const name   = document.getElementById('join-player-name').value.trim();
  const gameId = document.getElementById('join-game-id').value.trim().toUpperCase();
  if (!name)   { showToast('Enter your name'); return; }
  if (!gameId) { showToast('Enter a game ID'); return; }

  myPlayerName = name;
  myPlayerId   = name.toLowerCase().replace(/\s+/g,'_') + '_' + Math.floor(Math.random()*1000);
  currentGameId = gameId;

  connectWS(() => {
    subscribe(gameId);
    send('/join', { gameId, playerId: myPlayerId });
    showScreen('lobby');
    document.getElementById('lobby-game-id').textContent = gameId;
    document.getElementById('topbar-room').textContent = 'Room: ' + gameId;
  });
}

function copyGameId() {
  navigator.clipboard.writeText(currentGameId).then(() => showToast('Game ID copied!'));
}

// ── START GAME ────────────────────────────────────────────────────────────
function startGame() {
  send('/start', { gameId: currentGameId });
}

// ── STATE HANDLER ─────────────────────────────────────────────────────────
function handleStateUpdate(state) {
  gameState = state;

  if (!state.started) {
    // Still in lobby
    renderLobby(state);
    return;
  }

  // Switch to game screen once started
  if (!document.getElementById('game-screen').classList.contains('active') &&
      !document.getElementById('game-screen').style.display) {
    showScreen('game-screen');
    buildBoard();
  }
  if (document.getElementById('lobby').classList.contains('active')) {
    showScreen('game-screen');
    buildBoard();
  }

  renderGame(state);

  if (state.finished) {
    document.getElementById('win-player-name').textContent =
      getPlayerName(state.winner, state);
    openModal('modal-win');
  }
}

function getPlayerName(id, state) {
  // We store names only for self; others just show id
  if (id === myPlayerId) return myPlayerName;
  return id.replace(/_\d+$/, '').replace(/_/g,' ');
}

// ── LOBBY RENDER ──────────────────────────────────────────────────────────
function renderLobby(state) {
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  (state.players || []).forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'lobby-player-chip';
    chip.innerHTML = `
      <div class="player-token-dot" style="background:${PLAYER_COLORS[i % 8]}"></div>
      ${getPlayerName(p.id, state)}${p.id === myPlayerId ? ' <em>(you)</em>' : ''}
    `;
    list.appendChild(chip);
  });

  const msg = document.getElementById('lobby-msg');
  const startBtn = document.getElementById('start-btn');
  if ((state.players || []).length >= 2) {
    msg.textContent = `${state.players.length} players ready!`;
    startBtn.style.display = 'block';
  } else {
    msg.textContent = `Waiting for players… (${(state.players||[]).length}/2 minimum)`;
    startBtn.style.display = 'none';
  }
}

// ── BOARD BUILD (once) ────────────────────────────────────────────────────
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // Grid positions: 11×11, corners at (1,1),(1,11),(11,1),(11,11)
  // Bottom row: row 11, col 11→1  (pos 0-10)
  // Left col:   col 1,  row 10→2  (pos 11-19) -- wait, 19 tiles on sides
  // We have 40 tiles: 4 corners + 9 per side

  // Mapping: tile pos → [row, col]
  const tileGrid = {};

  // Bottom row (row=11): pos 0 at col=11, pos 1 at col=10 … pos 10 at col=1
  for (let i = 0; i <= 10; i++) {
    tileGrid[i] = [11, 11 - i];
  }
  // Left col (col=1): pos 11 at row=10 … pos 19 at row=2
  for (let i = 11; i <= 19; i++) {
    tileGrid[i] = [11 - (i - 10), 1];
  }
  // Top row (row=1): pos 20 at col=1 … pos 30 at col=11
  for (let i = 20; i <= 30; i++) {
    tileGrid[i] = [1, i - 19];
  }
  // Right col (col=11): pos 31 at row=2 … pos 39 at row=10
  for (let i = 31; i <= 39; i++) {
    tileGrid[i] = [i - 29, 11];
  }

  // Determine side for each non-corner tile
  function getSide(pos) {
    if (pos >= 1  && pos <= 9)  return 'side-bottom';
    if (pos >= 11 && pos <= 19) return 'side-left';
    if (pos >= 21 && pos <= 29) return 'side-top';
    if (pos >= 31 && pos <= 39) return 'side-right';
    return '';
  }

  BOARD_TILES.forEach(tile => {
    const [row, col] = tileGrid[tile.pos];
    const el = document.createElement('div');
    el.className = 'tile';
    el.id = 'tile-' + tile.pos;
    el.style.gridRow = row;
    el.style.gridColumn = col;

    if (tile.type === 'corner') {
      el.classList.add('corner-tile');
      el.innerHTML = `
        <div class="corner-icon">${tile.icon}</div>
        <div class="corner-label">${tile.label}</div>
      `;
    } else {
      const side = getSide(tile.pos);
      el.classList.add(side);

      let colorBarHtml = '';
      let extraClass = '';
      const color = tile.color ? COLOR_MAP[tile.color] : null;

      if (tile.type === 'chance') extraClass = 'tile-chance';
      else if (tile.type === 'chest') extraClass = 'tile-chest';
      else if (tile.type === 'tax') extraClass = 'tile-tax';

      if (extraClass) el.classList.add(extraClass);

      if (color) {
        colorBarHtml = `<div class="tile-color-bar" style="background:${color}"></div>`;
      }

      let nameHtml = '', priceHtml = '', iconHtml = '';
      if (tile.type === 'prop' || tile.type === 'railroad' || tile.type === 'utility') {
        nameHtml  = `<div class="tile-name">${tile.name}</div>`;
        priceHtml = `<div class="tile-price">₹${tile.price}</div>`;
      } else {
        iconHtml  = `<div class="tile-icon">${tile.icon}</div>`;
        nameHtml  = `<div class="tile-name">${tile.label}</div>`;
      }

      el.innerHTML = `
        ${colorBarHtml}
        <div class="tile-buildings" id="buildings-${tile.pos}"></div>
        <div class="tile-inner">
          ${iconHtml}${nameHtml}${priceHtml}
        </div>
        <div class="tile-owned-strip" id="owned-${tile.pos}"></div>
        <div class="tile-tokens" id="tokens-${tile.pos}"></div>
      `;
    }

    board.appendChild(el);
  });

  // Center panel
  const center = document.createElement('div');
  center.className = 'board-center';
  center.style.gridRow = '2 / 11';
  center.style.gridColumn = '2 / 11';
  center.innerHTML = `
    <div class="board-rupee-bg">₹</div>
    <div class="board-center-title">BUSINESS</div>
  `;
  board.appendChild(center);
}

// ── GAME RENDER ────────────────────────────────────────────────────────────
function renderGame(state) {
  const isMyTurn = isCurrentPlayer(state);
  const phase    = state.phase;

  updatePhaseIndicator(state, isMyTurn);
  renderPlayerCards(state);
  renderBoardTokens(state);
  renderBoardOwnership(state);
  renderBoardBuildings(state);
  updateActionButtons(state, isMyTurn, phase);
  checkIncomingTrades(state);
}

function isCurrentPlayer(state) {
  if (!state.players || state.players.length === 0) return false;
  return state.players[state.current]?.id === myPlayerId;
}

function currentPlayer(state) {
  return state.players?.[state.current] ?? null;
}

function myPlayer(state) {
  return state.players?.find(p => p.id === myPlayerId) ?? null;
}

function updatePhaseIndicator(state, isMyTurn) {
  const chip = document.querySelector('.phase-chip');
  if (!chip) return;
  if (state.finished) { chip.textContent = 'GAME OVER'; chip.style.background = '#880E4F'; return; }
  if (isMyTurn) {
    chip.textContent = `YOUR TURN — ${state.phase}`;
    chip.style.background = 'var(--saffron)';
  } else {
    const cur = currentPlayer(state);
    const name = cur ? getPlayerName(cur.id, state) : '?';
    chip.textContent = `${name}'s TURN`;
    chip.style.background = '#444';
  }
}

function renderPlayerCards(state) {
  const list = document.getElementById('player-cards-list');
  list.innerHTML = '';
  (state.players || []).forEach((p, i) => {
    const isCur = i === state.current;
    const isMe  = p.id === myPlayerId;
    const color = PLAYER_COLORS[i % 8];

    const card = document.createElement('div');
    card.className = 'player-card' + (isCur ? ' active-turn' : '') + (p.bankrupt ? ' bankrupt' : '');
    card.innerHTML = `
      <div class="pc-header">
        <div class="pc-dot" style="background:${color}"></div>
        <div class="pc-name">${getPlayerName(p.id, state)}</div>
        ${isMe ? '<div class="pc-you-badge">YOU</div>' : ''}
      </div>
      <div class="pc-money">₹${p.money.toLocaleString()}</div>
      <div class="pc-pos">Position: ${p.pos} ${getTileName(p.pos)}</div>
      ${p.inJail ? '<div class="pc-jail-badge">🔒 IN JAIL</div>' : ''}
    `;
    list.appendChild(card);
  });
}

function getTileName(pos) {
  const tile = BOARD_TILES.find(t => t.pos === pos);
  if (!tile) return '';
  return tile.name || tile.label || '';
}

function renderBoardTokens(state) {
  // Clear all token containers
  document.querySelectorAll('.tile-tokens').forEach(el => el.innerHTML = '');
  (state.players || []).forEach((p, i) => {
    const container = document.getElementById('tokens-' + p.pos);
    if (!container) return;
    const token = document.createElement('div');
    token.className = 'token';
    token.style.background = PLAYER_COLORS[i % 8];
    token.title = getPlayerName(p.id, state);
    container.appendChild(token);
  });
}

function renderBoardOwnership(state) {
  if (!state.props) return;
  Object.values(state.props).forEach(prop => {
    const strip = document.getElementById('owned-' + prop.pos);
    if (!strip) return;
    if (prop.owner) {
      const ownerIdx = (state.players || []).findIndex(p => p.id === prop.owner);
      strip.style.background = ownerIdx >= 0 ? PLAYER_COLORS[ownerIdx % 8] : '#888';
    } else {
      strip.style.background = 'transparent';
    }
  });
}

function renderBoardBuildings(state) {
  if (!state.props) return;
  Object.values(state.props).forEach(prop => {
    const container = document.getElementById('buildings-' + prop.pos);
    if (!container) return;
    container.innerHTML = '';
    if (!prop.houses || prop.houses === 0) return;
    if (prop.houses === 5) {
      container.innerHTML = '<span class="house-icon">🏨</span>';
    } else {
      for (let i = 0; i < prop.houses; i++) {
        container.innerHTML += '<span class="house-icon">🏠</span>';
      }
    }
  });
}

function updateActionButtons(state, isMyTurn, phase) {
  const btnRoll  = document.getElementById('btn-roll');
  const btnBuy   = document.getElementById('btn-buy');
  const btnBuild = document.getElementById('btn-build');
  const btnTrade = document.getElementById('btn-trade');
  const btnEnd   = document.getElementById('btn-end');

  // Default: all disabled
  [btnRoll, btnBuy, btnBuild, btnTrade, btnEnd].forEach(b => b.disabled = true);

  if (!isMyTurn || state.finished) return;

  if (phase === 'ROLL') {
    btnRoll.disabled = false;
  }

  if (phase === 'ACTION') {
    // Show buy only if on an unowned, affordable property
    const me = myPlayer(state);
    if (me && state.props) {
      const prop = state.props[me.pos];
      if (prop && !prop.owner && me.money >= prop.price) {
        btnBuy.disabled = false;
        // Auto-show buy popup
        showBuyPopup(prop, me);
      }
    }
    btnBuild.disabled = false;
    btnTrade.disabled = false;
    btnEnd.disabled   = false; // allow ending after action
  }

  if (phase === 'END') {
    btnEnd.disabled = false;
  }
}

// ── BUY POPUP ─────────────────────────────────────────────────────────────
let buyPopupShown = false; // prevent re-showing same tile

function showBuyPopup(prop, player) {
  // Only auto-show once per land
  const popupKey = `${myPlayerId}-${prop.pos}-${gameState?.lastDice}`;
  if (buyPopupShown === popupKey) return;
  buyPopupShown = popupKey;

  const tile = BOARD_TILES.find(t => t.pos === prop.pos);
  const color = prop.colorGroup ? COLOR_MAP[prop.colorGroup] : '#ccc';

  document.getElementById('buy-color-bar').style.background = color;
  document.getElementById('buy-prop-name').textContent  = tile?.name || 'Property';
  document.getElementById('buy-prop-price').textContent = '₹ ' + prop.price;
  document.getElementById('buy-prop-rent').textContent  = '₹ ' + prop.baseRent;
  document.getElementById('buy-prop-group').textContent = (prop.colorGroup || '').replace('_',' ');
  document.getElementById('buy-confirm-price').textContent = prop.price;
  openModal('modal-buy');
}

function confirmBuy() {
  closeModal('modal-buy');
  doBuy();
}

// ── ACTIONS ────────────────────────────────────────────────────────────────
function doRoll() {
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  die1.classList.add('rolling');
  die2.classList.add('rolling');
  setTimeout(() => {
    die1.classList.remove('rolling');
    die2.classList.remove('rolling');
  }, 500);

  send('/roll', { gameId: currentGameId, playerId: myPlayerId });
}

function doBuy() {
  send('/buy', { gameId: currentGameId, playerId: myPlayerId });
  addLog(`<span class="log-player">${myPlayerName}</span> <span class="log-action">bought</span> <span class="log-prop">${getTileName(myPlayer(gameState)?.pos || 0)}</span>`);
}

function doEnd() {
  buyPopupShown = false;
  send('/end', { gameId: currentGameId, playerId: myPlayerId });
}

// ── BUILD MODAL ────────────────────────────────────────────────────────────
function openBuild() {
  if (!gameState) return;
  const me = myPlayer(gameState);
  if (!me) return;

  const buildList = document.getElementById('build-list');
  buildList.innerHTML = '';

  const myProps = (me.props || []).map(pos => gameState.props?.[pos]).filter(Boolean)
    .filter(p => p.colorGroup !== 'RAILROAD' && p.colorGroup !== 'UTILITY');

  if (myProps.length === 0) {
    buildList.innerHTML = '<div style="color:#888;padding:10px">No developable properties</div>';
    openModal('modal-build');
    return;
  }

  myProps.forEach(prop => {
    const tile  = BOARD_TILES.find(t => t.pos === prop.pos);
    const color = COLOR_MAP[prop.colorGroup] || '#ccc';
    const hasMonopoly = ownsFullGroup(me, prop.colorGroup);
    const housesLabel = prop.houses === 5 ? '🏨 Hotel' : `${'🏠'.repeat(prop.houses || 0)} ${prop.houses || 0} house${prop.houses !== 1 ? 's' : ''}`;

    const row = document.createElement('div');
    row.className = 'build-row';
    row.innerHTML = `
      <div class="build-prop-color" style="background:${color}"></div>
      <div class="build-prop-info">
        <div class="build-prop-name">${tile?.name || 'Property'}</div>
        <div class="build-prop-houses">${housesLabel} · ₹${prop.housePrice || 0}/house</div>
      </div>
      <div class="build-btns">
        <button class="btn-build-action btn-house-plus"
          ${!hasMonopoly || prop.houses >= 5 || me.money < (prop.housePrice||0) ? 'disabled' : ''}
          onclick="doBuild(${prop.pos},1)">+🏠</button>
        <button class="btn-build-action btn-house-minus"
          ${(prop.houses || 0) === 0 ? 'disabled' : ''}
          onclick="doBuild(${prop.pos},-1)">−</button>
      </div>
    `;
    buildList.appendChild(row);
  });

  openModal('modal-build');
}

function ownsFullGroup(player, colorGroup) {
  if (!gameState?.props || !colorGroup) return false;
  const groupTiles = Object.values(gameState.props)
    .filter(p => p.colorGroup === colorGroup);
  return groupTiles.every(p => p.owner === myPlayerId);
}

function doBuild(pos, direction) {
  if (direction > 0) {
    send('/buildHouse', {
      gameId: currentGameId,
      playerId: myPlayerId,
      propertyPos: pos
    });
  } else {
    send('/sellHouse', {
      gameId: currentGameId,
      playerId: myPlayerId,
      propertyPos: pos
    });
  }
  closeModal('modal-build');
}

// ── TRADE MODAL ────────────────────────────────────────────────────────────
function openTrade() {
  if (!gameState) return;
  const me = myPlayer(gameState);
  if (!me) return;

  // Populate target players
  const sel = document.getElementById('trade-target-player');
  sel.innerHTML = '';
  gameState.players.filter(p => p.id !== myPlayerId).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = getPlayerName(p.id, gameState);
    sel.appendChild(opt);
  });

  // Populate my properties
  populatePropChecks('trade-offer-props', me.props || [], true);

  // When target changes, update their props
  sel.onchange = () => {
    const targetId = sel.value;
    const target = gameState.players.find(p => p.id === targetId);
    populatePropChecks('trade-req-props', target?.props || [], false);
  };
  sel.dispatchEvent(new Event('change'));

  openModal('modal-trade');
}

function populatePropChecks(containerId, propPositions, isOffer) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (propPositions.length === 0) {
    container.innerHTML = '<div style="color:#aaa;font-size:12px">No properties</div>';
    return;
  }
  propPositions.forEach(pos => {
    const prop = gameState?.props?.[pos];
    const tile = BOARD_TILES.find(t => t.pos === pos);
    const color = prop?.colorGroup ? COLOR_MAP[prop.colorGroup] : '#ccc';
    const label = document.createElement('label');
    label.className = 'prop-check-label';
    label.innerHTML = `
      <input type="checkbox" value="${pos}" data-trade="${isOffer ? 'offer' : 'req'}">
      <div class="prop-check-dot" style="background:${color}"></div>
      <span>${tile?.name || pos}</span>
    `;
    container.appendChild(label);
  });
}

function submitTrade() {
  const targetId = document.getElementById('trade-target-player').value;
  if (!targetId) { showToast('Select a player'); return; }

  const offeredMoney    = parseInt(document.getElementById('trade-offer-money').value) || 0;
  const requestedMoney  = parseInt(document.getElementById('trade-req-money').value) || 0;
  const offeredProps    = [...document.querySelectorAll('[data-trade="offer"]:checked')].map(c => parseInt(c.value));
  const requestedProps  = [...document.querySelectorAll('[data-trade="req"]:checked')].map(c => parseInt(c.value));

  const offer = {
    fromPlayerId: myPlayerId,
    toPlayerId:   targetId,
    offeredMoney, requestedMoney,
    offeredProps, requestedProps
  };

  send('/trade/propose', { gameId: currentGameId }, JSON.stringify(offer));
  closeModal('modal-trade');
  showToast('Trade offer sent!');
}

// ── INCOMING TRADE ─────────────────────────────────────────────────────────
function checkIncomingTrades(state) {
  if (!state.pendingTrades) return;
  const incoming = Object.values(state.pendingTrades)
    .find(t => t.toPlayerId === myPlayerId && t.status === 'PENDING');
  if (!incoming) return;

  pendingTradeId = incoming.tradeId;
  const from = getPlayerName(incoming.fromPlayerId, state);

  const offerPropsText = incoming.offeredProps.map(p => {
    const tile = BOARD_TILES.find(t => t.pos === p);
    return tile?.name || p;
  }).join(', ') || 'None';

  const reqPropsText = incoming.requestedProps.map(p => {
    const tile = BOARD_TILES.find(t => t.pos === p);
    return tile?.name || p;
  }).join(', ') || 'None';

  const body = document.getElementById('incoming-trade-body');
  body.innerHTML = `
    <p style="margin-bottom:12px"><strong>${from}</strong> wants to trade with you:</p>
    <div class="trade-detail">
      <div class="trade-side">
        <div class="trade-side-title">They Offer</div>
        ${incoming.offeredMoney > 0 ? `<div class="trade-item">₹${incoming.offeredMoney} cash</div>` : ''}
        ${incoming.offeredProps.length > 0 ? `<div class="trade-item">${offerPropsText}</div>` : ''}
        ${incoming.offeredMoney === 0 && incoming.offeredProps.length === 0 ? '<div class="trade-item" style="color:#aaa">Nothing</div>' : ''}
      </div>
      <div style="font-size:24px;align-self:center;text-align:center">⇄</div>
      <div class="trade-side">
        <div class="trade-side-title">They Want</div>
        ${incoming.requestedMoney > 0 ? `<div class="trade-item">₹${incoming.requestedMoney} cash</div>` : ''}
        ${incoming.requestedProps.length > 0 ? `<div class="trade-item">${reqPropsText}</div>` : ''}
        ${incoming.requestedMoney === 0 && incoming.requestedProps.length === 0 ? '<div class="trade-item" style="color:#aaa">Nothing</div>' : ''}
      </div>
    </div>
  `;

  if (!document.getElementById('modal-trade-incoming').classList.contains('open')) {
    openModal('modal-trade-incoming');
  }
}

function respondTrade(action) {
  if (!pendingTradeId) return;
  const dest = action === 'accept' ? '/trade/accept' : '/trade/reject';
  send(dest, {
    gameId:   currentGameId,
    playerId: myPlayerId,
    tradeId:  pendingTradeId
  });
  pendingTradeId = null;
  closeModal('modal-trade-incoming');
  showToast(action === 'accept' ? '✅ Trade accepted!' : '❌ Trade rejected');
}

// ── DICE DISPLAY UPDATE ────────────────────────────────────────────────────
// Called when new state arrives with lastDice set
function updateDiceDisplay(state) {
  if (!state.lastDice) return;
  const total = state.lastDice;
  // Split into two reasonable dice (random split)
  const d1 = Math.floor(Math.random() * Math.min(total - 1, 6)) + 1;
  const d2 = total - d1;
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  if (die1) die1.textContent = d1;
  if (die2) die2.textContent = Math.min(d2, 6);
  const total_el = document.getElementById('dice-total');
  if (total_el) total_el.textContent = `Total: ${total}`;
}

// Patch renderGame to also update dice
const _origRenderGame = renderGame;
// eslint-disable-next-line no-global-assign
window.renderGame = function(state) {
  _origRenderGame(state);
  updateDiceDisplay(state);
};

// ── GAME LOG ────────────────────────────────────────────────────────────────
function addLog(html) {
  const log = document.getElementById('game-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = html;
  log.prepend(entry);
  // Keep max 50 entries
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

// Intercept state updates for log entries
const originalHandleState = handleStateUpdate;
let lastPhase = null, lastCurrent = -1;

window.handleStateUpdate = function(state) {
  // Log turn changes
  if (state.started && lastCurrent !== state.current) {
    const cur = state.players?.[state.current];
    if (cur) {
      const name = getPlayerName(cur.id, state);
      addLog(`<span class="log-player">${name}</span> <span class="log-action">starts turn</span>`);
    }
    lastCurrent = state.current;
  }
  // Log dice
  if (state.lastDice && state.lastDice !== (gameState?.lastDice)) {
    const cur = state.players?.[state.current];
    const curPrev = gameState?.players?.[gameState?.current];
    const roller = curPrev || cur;
    if (roller) {
      addLog(`<span class="log-player">${getPlayerName(roller.id, state)}</span> <span class="log-action">rolled</span> <span class="log-money">${state.lastDice}</span>`);
    }
  }
  originalHandleState(state);
};

// ── MODAL HELPERS ──────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      const id = overlay.id;
      if (id !== 'modal-win') closeModal(id);
    }
  });
});

// ── TOAST ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── INIT ───────────────────────────────────────────────────────────────────
genId(); // pre-fill a random game ID
