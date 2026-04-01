/* ══════════════════════════════════════════════════════════════════════
   BUSINESS — Indian Board Game  |  game.js
   WebSocket client + full game UI
   ══════════════════════════════════════════════════════════════════════ */

// ── CONFIG ────────────────────────────────────────────────────────────────
const WS_URL   = 'https://business-game-backend-production.up.railway.app/ws';  // change to your server URL
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

const BOARD_TILES = [
  { pos:0,  type:'corner',   label:'GO',          icon:'🚦', corner:'go' },
  { pos:1,  type:'prop',     name:'Ludhiana',      price:140, color:'BROWN' },
  { pos:2,  type:'chest',    label:'CHEST',        icon:'📦' },
  { pos:3,  type:'prop',     name:'Agra',          price:100, color:'BROWN' },
  { pos:4,  type:'tax',      label:'INCOME TAX',   icon:'💸', value:200 },
  { pos:5,  type:'railroad', name:'Station',       price:200, color:'RAILROAD' },
  { pos:6,  type:'prop',     name:'Bhubaneswar',   price:100, color:'LIGHT_BLUE' },
  { pos:7,  type:'chance',   label:'CHANCE',       icon:'🎴' },
  { pos:8,  type:'prop',     name:'Panaji',        price:100, color:'LIGHT_BLUE' },
  { pos:9,  type:'prop',     name:'Vadodara',      price:120, color:'LIGHT_BLUE' },
  { pos:10, type:'corner',   label:'JAIL',         icon:'🔒', corner:'jail' },
  { pos:11, type:'prop',     name:'Patna',         price:140, color:'PINK' },
  { pos:12, type:'utility',  name:'Electric',      price:150, color:'UTILITY' },
  { pos:13, type:'prop',     name:'Bhopal',        price:140, color:'PINK' },
  { pos:14, type:'prop',     name:'Indore',        price:160, color:'PINK' },
  { pos:15, type:'railroad', name:'Station',       price:200, color:'RAILROAD' },
  { pos:16, type:'prop',     name:'Nagpur',        price:180, color:'ORANGE' },
  { pos:17, type:'chest',    label:'CHEST',        icon:'📦' },
  { pos:18, type:'prop',     name:'Kochi',         price:180, color:'ORANGE' },
  { pos:19, type:'prop',     name:'Lucknow',       price:200, color:'ORANGE' },
  { pos:20, type:'corner',   label:'FREE PARKING', icon:'🅿️', corner:'park' },
  { pos:21, type:'prop',     name:'Ahmedabad',     price:220, color:'RED' },
  { pos:22, type:'chance',   label:'CHANCE',       icon:'🎴' },
  { pos:23, type:'prop',     name:'Hyderabad',     price:220, color:'RED' },
  { pos:24, type:'prop',     name:'Pune',          price:240, color:'RED' },
  { pos:25, type:'railroad', name:'Station',       price:200, color:'RAILROAD' },
  { pos:26, type:'prop',     name:'Jaipur',        price:260, color:'YELLOW' },
  { pos:27, type:'prop',     name:'Chandigarh',    price:260, color:'YELLOW' },
  { pos:28, type:'utility',  name:'Water Works',   price:150, color:'UTILITY' },
  { pos:29, type:'prop',     name:'Lucknow',       price:280, color:'YELLOW' },
  { pos:30, type:'corner',   label:'GO TO JAIL',   icon:'👮', corner:'gotojail' },
  { pos:31, type:'prop',     name:'Chennai',       price:300, color:'GREEN' },
  { pos:32, type:'prop',     name:'Kolkata',       price:300, color:'GREEN' },
  { pos:33, type:'chest',    label:'CHEST',        icon:'📦' },
  { pos:34, type:'prop',     name:'Bengaluru',     price:320, color:'GREEN' },
  { pos:35, type:'railroad', name:'Station',       price:200, color:'RAILROAD' },
  { pos:36, type:'chance',   label:'CHANCE',       icon:'🎴' },
  { pos:37, type:'prop',     name:'Delhi',         price:350, color:'DARK_BLUE' },
  { pos:38, type:'tax',      label:'SUPER TAX',    icon:'💰', value:75 },
  { pos:39, type:'prop',     name:'Mumbai',        price:400, color:'DARK_BLUE' },
];

// ── STATE ─────────────────────────────────────────────────────────────────
let stompClient    = null;
let myPlayerId     = '';
let myPlayerName   = '';
let currentGameId  = '';
let gameState      = null;
let pendingTradeId = null;
const previousPositions = {};

// ── AUTO-SKIP TIMER STATE ─────────────────────────────────────────────────
let skipTimerInterval  = null;
let skipTimerCountdown = 0;
let skipAlreadySent    = false;
let skipTargetPlayerId = null;

// ── PHASE MODAL STATE ─────────────────────────────────────────────────────
let lastShownPhaseEvent = null;
let lastEventText       = null;

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

// ── RECONNECT ON PAGE LOAD ────────────────────────────────────────────────
(function attemptReconnect() {
  const savedGameId  = localStorage.getItem('reconnectGameId');
  const savedToken   = localStorage.getItem('reconnectToken');
  const savedPlayer  = localStorage.getItem('reconnectPlayerId');
  const savedName    = localStorage.getItem('reconnectPlayerName');

  if (!savedGameId || !savedToken || !savedPlayer) return;

  myPlayerId    = savedPlayer;
  myPlayerName  = savedName || savedPlayer;
  currentGameId = savedGameId;

  connectWS(() => {
    subscribe(savedGameId);
    send('/join', {
      gameId:         savedGameId,
      playerId:       savedPlayer,
      reconnectToken: savedToken
    });
    showScreen('lobby');
    document.getElementById('lobby-game-id').textContent = savedGameId;
    document.getElementById('topbar-room').textContent   = 'Room: ' + savedGameId;
    showToast('🔄 Reconnecting to game…');
  });
})();

// ── STORE RECONNECT TOKEN ─────────────────────────────────────────────────
function storeReconnectToken(state) {
  const me = state.players?.find(p => p.id === myPlayerId);
  if (me && me.reconnectToken) {
    localStorage.setItem('reconnectGameId',     currentGameId);
    localStorage.setItem('reconnectPlayerId',   myPlayerId);
    localStorage.setItem('reconnectPlayerName', myPlayerName);
    localStorage.setItem('reconnectToken',      me.reconnectToken);
  }
}

// ── DISCONNECT ON UNLOAD / VISIBILITY CHANGE ──────────────────────────────
window.addEventListener('beforeunload', sendDisconnect);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sendDisconnect();
});

function sendDisconnect() {
  if (stompClient && stompClient.connected && currentGameId && myPlayerId) {
    send('/disconnect', { gameId: currentGameId, playerId: myPlayerId });
  }
}

// ── CREATE GAME ───────────────────────────────────────────────────────────
function createGame() {
  const name   = document.getElementById('create-player-name').value.trim();
  const gameId = document.getElementById('create-game-id').value.trim().toUpperCase();
  if (!name)   { showToast('Enter your name'); return; }
  if (!gameId) { showToast('Enter a game ID'); return; }

  myPlayerName  = name;
  myPlayerId    = name.toLowerCase().replace(/\s+/g,'_') + '_' + Math.floor(Math.random()*1000);
  currentGameId = gameId;

  connectWS(() => {
    // One-shot subscription to check the /create response
    let checkSub;
    checkSub = stompClient.subscribe(`${TOPIC}/${gameId}`, msg => {
      const state = JSON.parse(msg.body);
      checkSub.unsubscribe();

      if (state.started === true) {
        showToast('⚠️ That game is already in progress.');
        return;
      }

      if (state.players && state.players.length > 0) {
        // Code taken — offer to join instead
        showDuplicateGamePrompt(gameId);
        // Re-subscribe for real updates if they choose to join
        subscribe(gameId);
      } else {
        // Fresh game — set up main subscription then join
        subscribe(gameId);
        send('/join', { gameId, playerId: myPlayerId });
        showScreen('lobby');
        document.getElementById('lobby-game-id').textContent = gameId;
        document.getElementById('topbar-room').textContent   = 'Room: ' + gameId;
      }
    });

    send('/create', {}, gameId);
  });
}

function showDuplicateGamePrompt(gameId) {
  const panel = document.getElementById('tab-create');
  let notice  = document.getElementById('duplicate-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'duplicate-notice';
    notice.style.cssText = [
      'background:#1a0f04',
      'border:1px solid var(--saffron)',
      'border-radius:8px',
      'padding:12px 14px',
      'margin-top:12px',
      'color:#ffe5b4',
      'font-size:14px',
      'line-height:1.6'
    ].join(';');
    panel.appendChild(notice);
  }
  notice.innerHTML = `
    A game with this code already exists. Join it instead?
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn-primary" style="padding:8px 18px;font-size:13px"
        onclick="joinExistingGame('${gameId}')">JOIN GAME</button>
      <button class="btn-modal btn-cancel"
        onclick="document.getElementById('duplicate-notice').remove()">CANCEL</button>
    </div>
  `;
}

function joinExistingGame(gameId) {
  const notice = document.getElementById('duplicate-notice');
  if (notice) notice.remove();
  send('/join', { gameId, playerId: myPlayerId });
  showScreen('lobby');
  document.getElementById('lobby-game-id').textContent = gameId;
  document.getElementById('topbar-room').textContent   = 'Room: ' + gameId;
}

// ── JOIN GAME ─────────────────────────────────────────────────────────────
function joinGame() {
  const name   = document.getElementById('join-player-name').value.trim();
  const gameId = document.getElementById('join-game-id').value.trim().toUpperCase();
  if (!name)   { showToast('Enter your name'); return; }
  if (!gameId) { showToast('Enter a game ID'); return; }

  myPlayerName  = name;
  myPlayerId    = name.toLowerCase().replace(/\s+/g,'_') + '_' + Math.floor(Math.random()*1000);
  currentGameId = gameId;

  connectWS(() => {
    subscribe(gameId);
    send('/join', { gameId, playerId: myPlayerId });
    showScreen('lobby');
    document.getElementById('lobby-game-id').textContent = gameId;
    document.getElementById('topbar-room').textContent   = 'Room: ' + gameId;
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

  // Persist reconnect token after first join
  if (state.players) storeReconnectToken(state);

  if (!state.started) {
    renderLobby(state);
    return;
  }

  if (document.getElementById('lobby').classList.contains('active') ||
      !document.getElementById('game-screen').classList.contains('active')) {
    showScreen('game-screen');
    buildBoard();
  }

  renderGame(state);
  manageAutoSkipTimer(state);

  if (state.finished) {
    document.getElementById('win-player-name').textContent =
      getPlayerName(state.winner, state);
    openModal('modal-win');
  }
}

function getPlayerName(id, state) {
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

  const msg      = document.getElementById('lobby-msg');
  const startBtn = document.getElementById('start-btn');
  if ((state.players || []).length >= 2) {
    msg.textContent        = `${state.players.length} players ready!`;
    startBtn.style.display = 'block';
  } else {
    msg.textContent        = `Waiting for players… (${(state.players||[]).length}/2 minimum)`;
    startBtn.style.display = 'none';
  }
}

// ── BOARD BUILD (once) ────────────────────────────────────────────────────
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  const tileGrid = {};
  for (let i = 0; i <= 10; i++) tileGrid[i] = [11, 11 - i];
  for (let i = 11; i <= 19; i++) tileGrid[i] = [11 - (i - 10), 1];
  for (let i = 20; i <= 30; i++) tileGrid[i] = [1, i - 19];
  for (let i = 31; i <= 39; i++) tileGrid[i] = [i - 29, 11];

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
    el.id        = 'tile-' + tile.pos;
    el.style.gridRow    = row;
    el.style.gridColumn = col;

    if (tile.type === 'corner') {
      el.classList.add('corner-tile');
      el.innerHTML = `
        <div class="corner-icon">${tile.icon}</div>
        <div class="corner-label">${tile.label}</div>
        <div class="tile-tokens" id="tokens-${tile.pos}"></div>
      `;
    } else {
      el.classList.add(getSide(tile.pos));
      let colorBarHtml = '';
      let extraClass   = '';
      const color = tile.color ? COLOR_MAP[tile.color] : null;

      if (tile.type === 'chance') extraClass = 'tile-chance';
      else if (tile.type === 'chest') extraClass = 'tile-chest';
      else if (tile.type === 'tax')   extraClass = 'tile-tax';

      if (extraClass) el.classList.add(extraClass);
      if (color) colorBarHtml = `<div class="tile-color-bar" style="background:${color}"></div>`;

      let nameHtml = '', priceHtml = '', iconHtml = '';
      if (tile.type === 'prop' || tile.type === 'railroad' || tile.type === 'utility') {
        nameHtml  = `<div class="tile-name">${tile.name}</div>`;
        priceHtml = `<div class="tile-price">₹${tile.price}</div>`;
      } else {
        iconHtml = `<div class="tile-icon">${tile.icon}</div>`;
        nameHtml = `<div class="tile-name">${tile.label}</div>`;
      }

      el.innerHTML = `
        ${colorBarHtml}
        <div class="tile-buildings" id="buildings-${tile.pos}"></div>
        <div class="tile-inner">${iconHtml}${nameHtml}${priceHtml}</div>
        <div class="tile-owned-strip" id="owned-${tile.pos}"></div>
        <div class="tile-tokens" id="tokens-${tile.pos}"></div>
      `;
    }
    board.appendChild(el);
  });

  const center = document.createElement('div');
  center.className     = 'board-center';
  center.style.gridRow    = '2 / 11';
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
  handlePhaseModals(state, isMyTurn);
  updateEventLog(state);
}

function isCurrentPlayer(state) {
  if (!state.players || state.players.length === 0) return false;
  return state.players[state.current]?.id === myPlayerId;
}

function currentPlayer(state) { return state.players?.[state.current] ?? null; }
function myPlayer(state)       { return state.players?.find(p => p.id === myPlayerId) ?? null; }

// ── PHASE MODALS: CHANCE & TAX ────────────────────────────────────────────
function handlePhaseModals(state, isMyTurn) {
  const phase    = state.phase;
  const eventKey = `${state.current}-${phase}-${state.lastEvent}`;

  if (phase === 'CHANCE' || phase === 'TAX') {
    if (lastShownPhaseEvent === eventKey) return;
    lastShownPhaseEvent = eventKey;
    showEventModal(phase, state.lastEvent, isMyTurn);
  } else {
    closeModal('modal-event');
  }
}

function showEventModal(phase, eventText, isMyTurn) {
  const modal = document.getElementById('modal-event');
  if (!modal) return;

  const icon  = phase === 'CHANCE' ? '🎴' : '💸';
  const title = phase === 'CHANCE' ? 'CHANCE CARD' : 'TAX NOTICE';
  const color = phase === 'CHANCE' ? '#1565C0' : '#B71C1C';

  document.getElementById('event-modal-icon').textContent  = icon;
  document.getElementById('event-modal-title').textContent = title;
  document.getElementById('event-modal-title').style.color = color;
  document.getElementById('event-modal-text').textContent  = eventText || '—';

  const btn = document.getElementById('event-modal-dismiss-btn');
  btn.style.display = isMyTurn ? 'block' : 'none';
  btn.disabled      = !isMyTurn;

  openModal('modal-event');
}

function dismissEventModal() {
  closeModal('modal-event');
  lastShownPhaseEvent = null;
  doEnd();
}

// ── EVENT LOG ─────────────────────────────────────────────────────────────
function updateEventLog(state) {
  if (!state.lastEvent || state.lastEvent === lastEventText) return;
  lastEventText = state.lastEvent;

  addLog(`<span class="log-warn">📢 ${state.lastEvent}</span>`);

  // Show inside modal for CHANCE / TAX instead of toast
  if (state.phase === 'CHANCE' || state.phase === 'TAX') {
    const textEl = document.getElementById('event-modal-text');
    if (textEl) textEl.textContent = state.lastEvent;
  } else {
    showToast(state.lastEvent);
  }
}

// ── AUTO-SKIP TIMER ────────────────────────────────────────────────────────
function manageAutoSkipTimer(state) {
  const cur = currentPlayer(state);
  if (!cur) { clearSkipTimer(); return; }

  if (cur.disconnected) {
    if (skipTargetPlayerId !== cur.id) {
      skipTargetPlayerId = cur.id;
      skipAlreadySent    = false;
      startSkipTimer(cur.id, 60);
    }
  } else {
    clearSkipTimer();
  }
}

function startSkipTimer(targetId, seconds) {
  clearSkipTimer();
  skipTimerCountdown = seconds;
  renderSkipTimerBar(targetId, skipTimerCountdown);

  skipTimerInterval = setInterval(() => {
    skipTimerCountdown--;
    renderSkipTimerBar(targetId, skipTimerCountdown);

    if (skipTimerCountdown <= 0) {
      clearSkipTimer();
      if (!skipAlreadySent) {
        skipAlreadySent = true;
        send('/skipTurn', { gameId: currentGameId, targetPlayerId: targetId });
        addLog(`<span class="log-warn">⏭ Auto-skipped disconnected player's turn</span>`);
      }
    }
  }, 1000);
}

function clearSkipTimer() {
  if (skipTimerInterval) { clearInterval(skipTimerInterval); skipTimerInterval = null; }
  skipTargetPlayerId = null;
  skipTimerCountdown = 0;
  const bar = document.getElementById('skip-timer-bar');
  if (bar) bar.style.display = 'none';
}

function renderSkipTimerBar(targetId, seconds) {
  let bar = document.getElementById('skip-timer-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'skip-timer-bar';
    Object.assign(bar.style, {
      position: 'fixed', bottom: '70px', left: '50%',
      transform: 'translateX(-50%)',
      background: '#1a1a2e', border: '1px solid #ef5350',
      borderRadius: '10px', padding: '10px 20px',
      color: '#ef5350', fontSize: '14px', fontWeight: '700',
      zIndex: '9000', display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,.5)'
    });
    document.body.appendChild(bar);
  }
  const name = gameState ? getPlayerName(targetId, gameState) : targetId;
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span>⏳</span>
    <span><strong>${name}</strong> disconnected — auto-skip in <strong>${seconds}s</strong></span>
  `;
}

// ── PHASE INDICATOR ────────────────────────────────────────────────────────
function updatePhaseIndicator(state, isMyTurn) {
  const chip = document.querySelector('.phase-chip');
  if (!chip) return;
  if (state.finished) { chip.textContent = 'GAME OVER'; chip.style.background = '#880E4F'; return; }
  if (isMyTurn) {
    chip.textContent      = `YOUR TURN — ${state.phase}`;
    chip.style.background = 'var(--saffron)';
  } else {
    const cur  = currentPlayer(state);
    const name = cur ? getPlayerName(cur.id, state) : '?';
    const dcBadge = cur?.disconnected ? ' 🔌' : '';
    chip.textContent      = `${name}${dcBadge}'s TURN`;
    chip.style.background = '#444';
  }
}

// ── PLAYER CARDS ──────────────────────────────────────────────────────────
function renderPlayerCards(state) {
  const list = document.getElementById('player-cards-list');
  list.innerHTML = '';
  (state.players || []).forEach((p, i) => {
    const isCur = i === state.current;
    const isMe  = p.id === myPlayerId;
    const color = PLAYER_COLORS[i % 8];

    const dcBadge = p.disconnected
      ? '<div class="pc-disconnected-badge">🔌 disconnected</div>'
      : '';

    const card = document.createElement('div');
    card.className = 'player-card' +
      (isCur      ? ' active-turn' : '') +
      (p.bankrupt ? ' bankrupt'    : '');

    card.innerHTML = `
      <div class="pc-header">
        <div class="pc-dot" style="background:${color}"></div>
        <div class="pc-name">${getPlayerName(p.id, state)}</div>
        ${isMe ? '<div class="pc-you-badge">YOU</div>' : ''}
        ${dcBadge}
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

// ── BOARD TOKENS ───────────────────────────────────────────────────────────
function renderBoardTokens(state) {
  // Clear all tokens first
  document.querySelectorAll('.tile-tokens').forEach(el => el.innerHTML = '');

  (state.players || []).forEach((p, i) => {
    const prev = previousPositions[p.id];

    // First render (no animation)
    if (prev === undefined || prev === p.pos) {
      placeTokenInstant(p, i, state);
    } else {
      animateMovement(p, i, prev, p.pos, state);
    }

    previousPositions[p.id] = p.pos;
  });
}


//Helper functions for pawn animation
function placeTokenInstant(p, i, state) {
  const container = document.getElementById('tokens-' + p.pos);
  if (!container) return;

  const token = document.createElement('div');
  token.className = 'token';
  token.style.background = PLAYER_COLORS[i % 8];
  container.appendChild(token);
}

function animateMovement(p, i, from, to, state) {
  let path = [];

  if (to >= from) {
    for (let pos = from + 1; pos <= to; pos++) path.push(pos);
  } else {
    // wrap around board
    for (let pos = from + 1; pos < 40; pos++) path.push(pos);
    for (let pos = 0; pos <= to; pos++) path.push(pos);
  }

  let step = 0;

  function moveStep() {
    if (step >= path.length) return;

    const pos = path[step];

    const container = document.getElementById('tokens-' + pos);
    if (!container) return;

    const token = document.createElement('div');
    token.className = 'token jumping';
    token.style.background = PLAYER_COLORS[i % 8];

    // Clear previous token for this player
    document.querySelectorAll('.token').forEach(t => {
      if (t.dataset.player === p.id) t.remove();
    });

    token.dataset.player = p.id;
    container.appendChild(token);

    step++;
    setTimeout(moveStep, 180); // speed control
  }

  moveStep();
}

// ── BOARD OWNERSHIP ────────────────────────────────────────────────────────
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

// ── BOARD BUILDINGS ────────────────────────────────────────────────────────
function renderBoardBuildings(state) {
  if (!state.props) return;
  Object.values(state.props).forEach(prop => {
    const container = document.getElementById('buildings-' + prop.pos);
    if (!container) return;
    container.innerHTML = '';
    if (!prop.houses || prop.houses === 0) return;
    container.innerHTML = prop.houses === 5
      ? '<span class="house-icon">🏨</span>'
      : '<span class="house-icon">🏠</span>'.repeat(prop.houses);
  });
}

// ── ACTION BUTTONS ─────────────────────────────────────────────────────────
function updateActionButtons(state, isMyTurn, phase) {
  const btnRoll  = document.getElementById('btn-roll');
  const btnBuy   = document.getElementById('btn-buy');
  const btnBuild = document.getElementById('btn-build');
  const btnTrade = document.getElementById('btn-trade');
  const btnEnd   = document.getElementById('btn-end');

  [btnRoll, btnBuy, btnBuild, btnTrade, btnEnd].forEach(b => b.disabled = true);

  if (!isMyTurn || state.finished) return;

  if (phase === 'ROLL') {
    btnRoll.disabled = false;
    return;
  }

  if (phase === 'ACTION') {
    const me = myPlayer(state);
    if (me && state.props) {
      const prop = state.props[me.pos];
      if (prop && !prop.owner && me.money >= prop.price) {
        btnBuy.disabled = false;
        showBuyPopup(prop, me);
      }
    }
    btnBuild.disabled = false;
    btnTrade.disabled = false;
    btnEnd.disabled   = false;
    return;
  }

  // CHANCE / TAX: no inline buttons — modal handles "Dismiss & End Turn"
  // END: just the end button
  if (phase === 'END') {
    btnEnd.disabled = false;
  }
}

// ── BUY POPUP ─────────────────────────────────────────────────────────────
let buyPopupShown = false;

function showBuyPopup(prop, player) {
  const popupKey = `${myPlayerId}-${prop.pos}-${gameState?.lastDice}`;
  if (buyPopupShown === popupKey) return;
  buyPopupShown = popupKey;

  const tile  = BOARD_TILES.find(t => t.pos === prop.pos);
  const color = prop.colorGroup ? COLOR_MAP[prop.colorGroup] : '#ccc';

  document.getElementById('buy-color-bar').style.background   = color;
  document.getElementById('buy-prop-name').textContent        = tile?.name || 'Property';
  document.getElementById('buy-prop-price').textContent       = '₹ ' + prop.price;
  document.getElementById('buy-prop-rent').textContent        = '₹ ' + prop.baseRent;
  document.getElementById('buy-prop-group').textContent       = (prop.colorGroup || '').replace('_',' ');
  document.getElementById('buy-confirm-price').textContent    = prop.price;
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
  setTimeout(() => { die1.classList.remove('rolling'); die2.classList.remove('rolling'); }, 500);
  send('/roll', { gameId: currentGameId, playerId: myPlayerId });
}

function doBuy() {
  send('/buy', { gameId: currentGameId, playerId: myPlayerId });
  addLog(`<span class="log-player">${myPlayerName}</span> <span class="log-action">bought</span> <span class="log-prop">${getTileName(myPlayer(gameState)?.pos || 0)}</span>`);
}

function doEnd() {
  buyPopupShown       = false;
  lastShownPhaseEvent = null;
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
    const tile        = BOARD_TILES.find(t => t.pos === prop.pos);
    const color       = COLOR_MAP[prop.colorGroup] || '#ccc';
    const hasMonopoly = ownsFullGroup(me, prop.colorGroup);
    const housesLabel = prop.houses === 5
      ? '🏨 Hotel'
      : `${'🏠'.repeat(prop.houses || 0)} ${prop.houses || 0} house${prop.houses !== 1 ? 's' : ''}`;

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
  return Object.values(gameState.props)
    .filter(p => p.colorGroup === colorGroup)
    .every(p => p.owner === myPlayerId);
}

function doBuild(pos, direction) {
  const endpoint = direction > 0 ? '/buildHouse' : '/sellHouse';
  send(endpoint, { gameId: currentGameId, playerId: myPlayerId, propertyPos: pos });
  closeModal('modal-build');
}

// ── TRADE MODAL ────────────────────────────────────────────────────────────
function openTrade() {
  if (!gameState) return;
  const me = myPlayer(gameState);
  if (!me) return;

  const sel = document.getElementById('trade-target-player');
  sel.innerHTML = '';
  gameState.players.filter(p => p.id !== myPlayerId).forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.id;
    opt.textContent = getPlayerName(p.id, gameState);
    sel.appendChild(opt);
  });

  populatePropChecks('trade-offer-props', me.props || [], true);

  sel.onchange = () => {
    const target = gameState.players.find(p => p.id === sel.value);
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
    const prop  = gameState?.props?.[pos];
    const tile  = BOARD_TILES.find(t => t.pos === pos);
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

  const offeredMoney   = parseInt(document.getElementById('trade-offer-money').value) || 0;
  const requestedMoney = parseInt(document.getElementById('trade-req-money').value)   || 0;
  const offeredProps   = [...document.querySelectorAll('[data-trade="offer"]:checked')].map(c => parseInt(c.value));
  const requestedProps = [...document.querySelectorAll('[data-trade="req"]:checked')].map(c => parseInt(c.value));

  send('/trade/propose', { gameId: currentGameId }, JSON.stringify({
    fromPlayerId: myPlayerId, toPlayerId: targetId,
    offeredMoney, requestedMoney, offeredProps, requestedProps
  }));
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

  const fmtProps = arr => arr.map(p => BOARD_TILES.find(t => t.pos === p)?.name || p).join(', ') || 'None';

  const body = document.getElementById('incoming-trade-body');
  body.innerHTML = `
    <p style="margin-bottom:12px"><strong>${from}</strong> wants to trade with you:</p>
    <div class="trade-detail">
      <div class="trade-side">
        <div class="trade-side-title">They Offer</div>
        ${incoming.offeredMoney > 0 ? `<div class="trade-item">₹${incoming.offeredMoney} cash</div>` : ''}
        ${incoming.offeredProps.length > 0 ? `<div class="trade-item">${fmtProps(incoming.offeredProps)}</div>` : ''}
        ${incoming.offeredMoney === 0 && incoming.offeredProps.length === 0 ? '<div class="trade-item" style="color:#aaa">Nothing</div>' : ''}
      </div>
      <div style="font-size:24px;align-self:center;text-align:center">⇄</div>
      <div class="trade-side">
        <div class="trade-side-title">They Want</div>
        ${incoming.requestedMoney > 0 ? `<div class="trade-item">₹${incoming.requestedMoney} cash</div>` : ''}
        ${incoming.requestedProps.length > 0 ? `<div class="trade-item">${fmtProps(incoming.requestedProps)}</div>` : ''}
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
  send(action === 'accept' ? '/trade/accept' : '/trade/reject', {
    gameId: currentGameId, playerId: myPlayerId, tradeId: pendingTradeId
  });
  pendingTradeId = null;
  closeModal('modal-trade-incoming');
  showToast(action === 'accept' ? '✅ Trade accepted!' : '❌ Trade rejected');
}

// ── DICE DISPLAY ────────────────────────────────────────────────────────────
function updateDiceDisplay(state) {
  if (!state.lastDice) return;
  const total = state.lastDice;
  const d1    = Math.floor(Math.random() * Math.min(total - 1, 6)) + 1;
  const d2    = total - d1;
  const die1  = document.getElementById('die1');
  const die2  = document.getElementById('die2');
  if (die1) die1.textContent = d1;
  if (die2) die2.textContent = Math.min(d2, 6);
  const totalEl = document.getElementById('dice-total');
  if (totalEl) totalEl.textContent = `Total: ${total}`;
}

const _origRenderGame = renderGame;
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
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

const originalHandleState = handleStateUpdate;
let lastCurrent = -1;

window.handleStateUpdate = function(state) {
  if (state.started && lastCurrent !== state.current) {
    const cur = state.players?.[state.current];
    if (cur) addLog(`<span class="log-player">${getPlayerName(cur.id, state)}</span> <span class="log-action">starts turn</span>`);
    lastCurrent = state.current;
  }
  if (state.lastDice && state.lastDice !== (gameState?.lastDice)) {
    const roller = gameState?.players?.[gameState?.current] || state.players?.[state.current];
    if (roller) addLog(`<span class="log-player">${getPlayerName(roller.id, state)}</span> <span class="log-action">rolled</span> <span class="log-money">${state.lastDice}</span>`);
  }
  originalHandleState(state);
};

// ── MODAL HELPERS ──────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      const id = overlay.id;
      // Win modal and event modal cannot be dismissed by clicking overlay
      if (id !== 'modal-win' && id !== 'modal-event') closeModal(id);
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
genId();
