// ===== Telegram WebApp init =====
let chatId = 0;
let userId = 0;

function initTelegramIds() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();

    const initData = tg.initDataUnsafe || {};

    // User ID from Telegram
    if (initData.user && initData.user.id) {
      userId = initData.user.id;
    }

    // Chat ID from the chat we are in
    if (initData.chat && initData.chat.id) {
      chatId = initData.chat.id;
    }
  }

  // Fallback: URL params (for testing in browser)
  const params = new URLSearchParams(window.location.search);
  if (!chatId) chatId = parseInt(params.get('chat') || '0');
  if (!userId) userId = parseInt(params.get('user') || '0');
}

initTelegramIds();

// ===== State =====
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let playerName = '';

async function fetchState() {
  if (!chatId || !userId) {
    document.getElementById('status').textContent = '⚠️ ከ Telegram ቡድን ውስጥ ይክፈቱ';
    return;
  }
  try {
    const r = await fetch(`/api/state?chat=${chatId}&user=${userId}`);
    const data = await r.json();
    if (data.error === 'no_game') {
      document.getElementById('status').textContent = '⚠️ ጨዋታ የለም — /newgame ይላኩ';
      return;
    }
    if (data.error === 'no_player') {
      document.getElementById('status').textContent = '⚠️ አልተቀላቀሉም — /join ይላኩ';
      return;
    }
    if (data.error) {
      document.getElementById('status').textContent = '⚠️ ስህተት: ' + data.error;
      return;
    }

    card = data.card;
    playerName = data.player_name || 'ተጫዋች';

    document.getElementById('playerInfo').textContent = '👤 ' + playerName;
    document.getElementById('playerCount').textContent = '👥 ' + data.player_count + ' ተጫዋቾች';
    document.getElementById('calledBadge').textContent = '📢 ' + data.called_count + '/75';
    document.getElementById('autoStatus').textContent = data.auto ? '🤖 ራስ-ሰር እየሰራ ነው' : '';

    // Marked set
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
        const statusEl = document.getElementById('status');
        const orig = statusEl.textContent;
        statusEl.textContent = '⚠️ ገና አልተጠራም!';
        setTimeout(() => { statusEl.textContent = orig; }, 1200);
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

// Initial fetch
fetchState();

// Poll every 2 seconds
setInterval(fetchState, 2000);
