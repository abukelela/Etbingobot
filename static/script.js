// ===== Telegram init =====
let roomId = '';
let userId = 0;
let userName = 'ተጫዋች';

function initTelegram() {
  // 1. URL param (room) — ቅድሚያ
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');
  if (urlRoom) {
    roomId = urlRoom;
  }

  // 2. Telegram init
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    const initData = tg.initDataUnsafe || {};

    if (initData.user && initData.user.id) {
      userId = initData.user.id;
      userName = initData.user.first_name || 'ተጫዋች';
    }

    // Room fallback — Telegram chat ወይም user
    if (!roomId) {
      if (initData.chat && initData.chat.id) {
        roomId = 'c' + initData.chat.id;
      } else if (userId) {
        roomId = 'u' + userId;
      }
    }
  }

  // 3. URL fallbacks
  if (!userId) userId = parseInt(params.get('user') || '0');
  if (!roomId && userId) roomId = 'u' + userId;

  console.log('Room:', roomId, 'User:', userId, 'Name:', userName);
}

initTelegram();

// ===== State =====
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let currentScreen = 'loading';
let lastRound = 0;

// ===== Screens =====
function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  const noGame = document.getElementById('noGameScreen');
  const pick = document.getElementById('pickScreen');
  const game = document.getElementById('gameScreen');
  if (noGame) noGame.style.display = 'none';
  if (pick) pick.style.display = 'none';
  if (game) game.style.display = 'none';

  if (name === 'noGame' && noGame) noGame.style.display = 'block';
  else if (name === 'pick' && pick) pick.style.display = 'block';
  else if (name === 'game' && game) game.style.display = 'block';
}

function showMessage(msg) {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.style.color = '#ff9500';
    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.style.color = '';
    }, 2500);
  }
}

// ===== Invite =====
function inviteFriends() {
  const botUsername = 'Afbingobot';
  const roomUrl = 'https://t.me/' + botUsername + '?start=room_' + roomId;
  const inviteText = '🎱 Etbingo ተጫወት! አብረን እንጫወት 🎉\n\n' + roomUrl;

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      const shareUrl = 'https://t.me/share/url?url=' +
        encodeURIComponent(roomUrl) +
        '&text=' + encodeURIComponent('🎱 Etbingo ተጫወት! አብረን እንጫወት 🎉');
      tg.openTelegramLink(shareUrl);
      return;
    } catch (e) {}
  }

  if (navigator.share) {
    navigator.share({
      title: 'Etbingo',
      text: inviteText
    }).catch(() => copyToClipboard(inviteText));
  } else {
    copyToClipboard(inviteText);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showMessage('✅ ሊንኩ ተቀድቷል!');
    }).catch(() => showMessage('📤 t.me/Afbingobot'));
  } else {
    showMessage('📤 t.me/Afbingobot');
  }
}

// ===== API Calls =====
async function createGame() {
  if (!roomId) { showMessage('⚠️ ከ Telegram ውስጥ ይክፈቱ'); return; }
  try {
    const r = await fetch('/api/newgame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    if (r.ok) await fetchState();
    else showMessage('⚠️ ጨዋታ መፍጠር አልተቻለም');
  } catch (e) { showMessage('⚠️ የኢንተርኔት ችግር'); }
}

async function joinGame(cardNum = 0) {
  if (!roomId || !userId) { showMessage('⚠️ ከ Telegram ውስጥ ይክፈቱ'); return; }
  try {
    const r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, name: userName, card_num: cardNum })
    });
    if (r.ok) await fetchState();
    else showMessage('⚠️ መቀላቀል አልተቻለም');
  } catch (e) { showMessage('⚠️ የኢንተርኔት ችግር'); }
}

function joinWithRandom() { joinGame(0); }

function openPicker() {
  renderPicker();
  const modal = document.getElementById('pickerModal');
  if (modal) modal.classList.add('open');
}

function closePicker(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('pickerModal');
  if (modal) modal.classList.remove('open');
}

function renderPicker() {
  const grid = document.getElementById('pickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 1; i <= 144; i++) {
    const cell = document.createElement('div');
    cell.className = 'picker-cell';
    cell.textContent = i;
    cell.onclick = () => {
      closePicker();
      joinGame(i);
    };
    grid.appendChild(cell);
  }
}

async function drawNumber() {
  if (!roomId) return;
  try {
    await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    await fetchState();
  } catch (e) {}
}

async function toggleAuto() {
  if (!roomId) return;
  try {
    await fetch('/api/toggle_auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    await fetchState();
  } catch (e) {}
}

function confirmNewGame() {
  if (confirm('አዲስ ጨዋታ ጀምር? ሁሉም ተጫዋቾች ይወገዳሉ!')) createGame();
}

// ===== State sync =====
async function fetchState() {
  if (!roomId) { showScreen('noGame'); return; }
  try {
    const r = await fetch('/api/state?chat=' + encodeURIComponent(roomId) + '&user=' + userId);
    const data = await r.json();

    if (data.error === 'no_game') { showScreen('noGame'); return; }
    if (data.error) return;

    // Header
    const pc = document.getElementById('playerCount');
    if (pc) pc.textContent = '👥 ' + data.player_count;
    const cb = document.getElementById('calledBadge');
    if (cb) cb.textContent = '📢 ' + data.called_count + '/75';

    // Round (ካሉ ብቻ)
    const roundNumEl = document.getElementById('roundNum');
    if (roundNumEl) roundNumEl.textContent = '🔄 Round ' + data.round_number;
    const roundTimerEl = document.getElementById('roundTimer');
    if (roundTimerEl) updateRoundTimer(data.round_remaining);

    // Need join?
    if (data.needs_join) { showScreen('pick'); return; }

    // In game
    showScreen('game');
    const pi = document.getElementById('playerInfo');
    if (pi) pi.textContent = '👤 ' + (data.player_name || 'ተጫዋች');

    // Round changed?
    if (data.round_number !== lastRound) {
      lastRound = data.round_number;
      gameOver = false;
      lastCalled = null;
      const st = document.getElementById('status');
      if (st) { st.textContent = ''; st.classList.remove('bingo'); }
      const lc = document.getElementById('lastCalled');
      if (lc) lc.textContent = '—';
      const hist = document.getElementById('history');
      if (hist) hist.innerHTML = '';
      calledHistory = [];
      const cf = document.getElementById('confetti');
      if (cf) cf.innerHTML = '';
    }

    card = data.card;
    markedSet = new Set(data.marked.map(pair => pair[0] + '-' + pair[1]));

    if (data.last && data.last !== lastCalled) {
      lastCalled = data.last;
      const el = document.getElementById('lastCalled');
      if (el) {
        el.textContent = data.last;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    } else if (!data.last) {
      const el = document.getElementById('lastCalled');
      if (el) el.textContent = '—';
    }

    // Auto button
    const autoBtn = document.getElementById('autoBtn');
    const autoIcon = document.getElementById('autoIcon');
    const autoText = document.getElementById('autoText');
    const autoStatus = document.getElementById('autoStatus');
    if (autoBtn) {
      if (data.auto) {
        autoBtn.classList.add('running');
        if (autoIcon) autoIcon.textContent = '⏸️';
        if (autoText) autoText.textContent = 'አቁም';
        if (autoStatus) autoStatus.textContent = '🤖 ራስ-ሰር እየሰራ ነው';
      } else {
        autoBtn.classList.remove('running');
        if (autoIcon) autoIcon.textContent = '▶️';
        if (autoText) autoText.textContent = 'ራስ-ሰር';
        if (autoStatus) autoStatus.textContent = '';
      }
    }

    // History
    if (data.called.length !== calledHistory.length) {
      const hist = document.getElementById('history');
      if (hist) {
        hist.innerHTML = '';
        data.called.forEach(n => {
          const span = document.createElement('span');
          span.textContent = n;
          hist.appendChild(span);
        });
        hist.scrollTop = hist.scrollHeight;
      }
      calledHistory = data.called;
    }

    // Winner
    if (data.winner && !gameOver) {
      gameOver = true;
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
        statusEl.classList.add('bingo');
      }
      launchConfetti();
    }

    renderBoard();
  } catch (e) { console.error('Fetch error:', e); }
}

function updateRoundTimer(seconds) {
  const el = document.getElementById('roundTimer');
  if (!el) return;
  if (seconds === undefined || seconds === null) {
    el.textContent = '⏰ --:--';
    return;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  el.textContent = '⏰ ' + m + ':' + (s < 10 ? '0' : '') + s;
  if (seconds <= 30) el.classList.add('urgent');
  else el.classList.remove('urgent');
}

// ===== Render =====
function renderBoard() {
  if (!card) return;
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  boardEl.innerHTML = '';

  const headers = ['B', 'I', 'N', 'G', 'O'];
  headers.forEach(letter => {
    const h = document.createElement('div');
    h.className = 'header';
    h.textContent = letter;
    boardEl.appendChild(h);
  });

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const num = card[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (num === 'FREE') {
        cell.textContent = 'FREE';
        cell.classList.add('free');
      } else {
        cell.textContent = num;
      }
      if (markedSet.has(r + '-' + c)) cell.classList.add('marked');
      cell.onclick = () => clickCell(r, c);
      boardEl.appendChild(cell);
    }
  }
}

async function clickCell(r, c) {
  if (!card || gameOver) return;
  if (card[r][c] === 'FREE') return;
  try {
    const resp = await fetch('/api/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, r: r, c: c })
    });
    const data = await resp.json();
    if (data.error) {
      if (data.error === 'not_called') showMessage('⚠️ ገና አልተጠራም!');
      return;
    }
    markedSet = new Set(data.marked.map(pair => pair[0] + '-' + pair[1]));
    renderBoard();
    if (data.winner && !gameOver) {
      gameOver = true;
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
        statusEl.classList.add('bingo');
      }
      launchConfetti();
    }
  } catch (e) {}
}

function launchConfetti() {
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da'];
  const container = document.getElementById('confetti');
  if (!container) return;
  for (let i = 0; i < 100; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.top = '-10px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 0.5 + 's';
    piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    container.appendChild(piece);
  }
}

// ===== Start =====
fetchState();
setInterval(fetchState, 2000);
