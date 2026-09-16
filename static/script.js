// ===== Telegram init =====
let chatId = 0;
let userId = 0;
let userName = 'ተጫዋች';

function initTelegram() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    const initData = tg.initDataUnsafe || {};
    console.log('TG initData:', JSON.stringify(initData));

    if (initData.user && initData.user.id) {
      userId = initData.user.id;
      userName = initData.user.first_name || 'ተጫዋች';
    }

    if (initData.chat && initData.chat.id) {
      chatId = initData.chat.id;
    }
  }

  // Fallback URL params
  const params = new URLSearchParams(window.location.search);
  const urlChat = parseInt(params.get('chat') || '0');
  const urlUser = parseInt(params.get('user') || '0');
  if (!chatId && urlChat) chatId = urlChat;
  if (!userId && urlUser) userId = urlUser;

  // Fallback: ከ BotFather ከተከፈተ — userId ን chatId አድርገው
  if (!chatId && userId) {
    chatId = userId;
  }

  console.log('Final chatId:', chatId, 'userId:', userId);
}

initTelegram();

// ===== State =====
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let currentScreen = 'loading';

// ===== Screens =====
function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  document.getElementById('noGameScreen').style.display = 'none';
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'none';

  if (name === 'noGame') document.getElementById('noGameScreen').style.display = 'block';
  else if (name === 'join') document.getElementById('joinScreen').style.display = 'block';
  else if (name === 'game') document.getElementById('gameScreen').style.display = 'block';
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

// ===== Actions =====
async function createGame() {
  if (!chatId) {
    showMessage('⚠️ ከ Telegram ውስጥ ይክፈቱ');
    return;
  }
  try {
    const r = await fetch('/api/newgame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: chatId })
    });
    if (r.ok) {
      await fetchState();
    } else {
      showMessage('⚠️ ጨዋታ መፍጠር አልተቻለም');
    }
  } catch (e) {
    showMessage('⚠️ የኢንተርኔት ችግር');
  }
}

async function joinGame() {
  if (!chatId || !userId) {
    showMessage('⚠️ ከ Telegram ውስጥ ይክፈቱ');
    return;
  }
  try {
    const r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: chatId, user: userId, name: userName })
    });
    if (r.ok) await fetchState();
    else showMessage('⚠️ መቀላቀል አልተቻለም');
  } catch (e) {
    showMessage('⚠️ የኢንተርኔት ችግር');
  }
}

async function drawNumber() {
  if (!chatId) return;
  try {
    await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: chatId })
    });
    await fetchState();
  } catch (e) {
    console.error('Draw error:', e);
  }
}

async function toggleAuto() {
  if (!chatId) return;
  try {
    await fetch('/api/toggle_auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: chatId })
    });
    await fetchState();
  } catch (e) {
    console.error('Auto error:', e);
  }
}

function confirmNewGame() {
  if (confirm('አዲስ ጨዋታ ጀምር? ሁሉም ተጫዋቾች ይወገዳሉ!')) {
    createGame();
  }
}

// ===== State sync =====
async function fetchState() {
  if (!chatId) {
    showScreen('noGame');
    return;
  }

  try {
    const r = await fetch(`/api/state?chat=${chatId}&user=${userId}`);
    const data = await r.json();

    if (data.error === 'no_game') {
      showScreen('noGame');
      return;
    }
    if (data.error) return;

    // Update header
    document.getElementById('playerCount').textContent = '👥 ' + data.player_count;
    document.getElementById('calledBadge').textContent = '📢 ' + data.called_count + '/75';

    // Need join?
    if (data.needs_join) {
      document.getElementById('joinPlayerCount').textContent = data.player_count;
      showScreen('join');
      return;
    }

    // In game
    showScreen('game');

    document.getElementById('playerInfo').textContent = '👤 ' + (data.player_name || 'ተጫዋች');

    // Card
    card = data.card;
    markedSet = new Set(data.marked.map(pair => pair[0] + '-' + pair[1]));

    // Last called
    if (data.last && data.last !== lastCalled) {
      lastCalled = data.last;
      const el = document.getElementById('lastCalled');
      el.textContent = data.last;
      el.classList.remove('pulse');
      void el.offsetWidth;
      el.classList.add('pulse');
    } else if (!data.last) {
      document.getElementById('lastCalled').textContent = '—';
    }

    // Auto status
    const autoBtn = document.getElementById('autoBtn');
    if (data.auto) {
      autoBtn.classList.add('running');
      document.getElementById('autoIcon').textContent = '⏸️';
      document.getElementById('autoText').textContent = 'አቁም';
      document.getElementById('autoStatus').textContent = '🤖 ራስ-ሰር እየሰራ ነው';
    } else {
      autoBtn.classList.remove('running');
      document.getElementById('autoIcon').textContent = '▶️';
      document.getElementById('autoText').textContent = 'ራስ-ሰር';
      document.getElementById('autoStatus').textContent = '';
    }

    // History
    if (data.called.length !== calledHistory.length) {
      const hist = document.getElementById('history');
      hist.innerHTML = '';
      data.called.forEach(n => {
        const span = document.createElement('span');
        span.textContent = n;
        hist.appendChild(span);
      });
      hist.scrollTop = hist.scrollHeight;
      calledHistory = data.called;
    }

    // Winner
    if (data.winner && !gameOver) {
      gameOver = true;
      const statusEl = document.getElementById('status');
      statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
      statusEl.classList.add('bingo');
      launchConfetti();
    }

    renderBoard();
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

// ===== Render =====
function renderBoard() {
  if (!card) return;
  const boardEl = document.getElementById('board');
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
      body: JSON.stringify({ chat: chatId, user: userId, r: r, c: c })
    });
    const data = await resp.json();
    if (data.error) {
      if (data.error === 'not_called') {
        showMessage('⚠️ ገና አልተጠራም!');
      }
      return;
    }

    markedSet = new Set(data.marked.map(pair => pair[0] + '-' + pair[1]));
    renderBoard();

    if (data.winner && !gameOver) {
      gameOver = true;
      const statusEl = document.getElementById('status');
      statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
      statusEl.classList.add('bingo');
      launchConfetti();
    }
  } catch (e) {
    console.error('Mark error:', e);
  }
}

function launchConfetti() {
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da'];
  const container = document.getElementById('confetti');
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
