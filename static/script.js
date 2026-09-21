let roomId = '';
let userId = 0;
let userName = 'ተጫዋች';

function initTelegram() {
  const params = new URLSearchParams(window.location.search);
  const urlRoom = params.get('room');
  const urlUser = params.get('user');
  if (urlRoom) roomId = urlRoom;
  if (urlUser) userId = parseInt(urlUser);

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    const initData = tg.initDataUnsafe || {};
    if (!userId && initData.user && initData.user.id) {
      userId = initData.user.id;
      userName = initData.user.first_name || 'ተጫዋች';
    }
    if (!roomId) {
      if (initData.chat && initData.chat.id) roomId = 'c' + initData.chat.id;
      else if (userId) roomId = 'u' + userId;
    }
  }
  if (roomId && !userId && roomId.startsWith('u')) {
    const id = parseInt(roomId.substring(1));
    if (!isNaN(id) && id < 9007199254740991) userId = id;
  }
  if (!userId) {
    userId = 100000 + Math.floor(Math.random() * 899999);
  }
  if (!roomId) roomId = 'u' + userId;
  if (roomId.length > 50) roomId = roomId.substring(0, 50);
  console.log('✅ Final — Room:', roomId, 'User:', userId);
}

initTelegram();

let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let currentScreen = 'loading';
let lastRound = 0;
let userBalance = 0;
let cardPrice = 10.0;

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast show';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}
function showMessage(msg) { showToast(msg); }

function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  ['noGameScreen', 'pickScreen', 'gameScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (name === 'noGame') { const e = document.getElementById('noGameScreen'); if (e) e.style.display = 'block'; }
  else if (name === 'pick') { const e = document.getElementById('pickScreen'); if (e) e.style.display = 'block'; }
  else if (name === 'game') { const e = document.getElementById('gameScreen'); if (e) e.style.display = 'block'; }
}

async function fetchBalance() {
  if (!userId) return;
  try {
    const r = await fetch('/api/user/balance?user=' + userId);
    const data = await r.json();
    if (data.balance !== undefined) {
      userBalance = data.balance;
      updateBalanceDisplay();
    }
  } catch (e) {}
}

function updateBalanceDisplay() {
  const el = document.getElementById('balanceAmount');
  if (el) {
    el.textContent = userBalance.toFixed(2) + ' ETB';
    el.style.color = userBalance < cardPrice ? '#e74c3c' : '#27ae60';
  }
}

async function registerUser() {
  if (!userId) return;
  try {
    await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userId, name: userName })
    });
  } catch (e) {}
}

async function addTestBalance() {
  if (!userId) return;
  if (!confirm('1000 ETB ለሙከራ ይጨመር?')) return;
  try {
    showToast('⏳ ገንዘብ እየተጨመረ...');
    const r = await fetch('/api/user/test_balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userId, amount: 1000 })
    });
    const data = await r.json();
    if (data.ok) {
      userBalance = data.balance;
      updateBalanceDisplay();
      showToast('✅ 1000 ETB ተጨምሯል!');
      closeDeposit();
    } else {
      showToast('⚠️ ' + (data.error || 'ስህተት'));
    }
  } catch (e) {
    showToast('⚠️ የኢንተርኔት ችግር');
  }
}

function showDeposit() {
  const modal = document.getElementById('depositModal');
  if (modal) modal.classList.add('open');
}
function closeDeposit(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('depositModal');
  if (modal) modal.classList.remove('open');
}

async function showHistory() {
  const modal = document.getElementById('historyModal');
  const list = document.getElementById('txList');
  if (!modal || !list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  modal.classList.add('open');
  try {
    const r = await fetch('/api/user/transactions?user=' + userId);
    const data = await r.json();
    const txs = data.transactions || [];
    if (txs.length === 0) {
      list.innerHTML = '<div class="tx-empty">📭 እስካሁን ምንም ግብይት የለም</div>';
      return;
    }
    list.innerHTML = '';
    txs.forEach(tx => {
      const div = document.createElement('div');
      const isPositive = tx.amount > 0;
      div.className = 'tx-item ' + (isPositive ? 'positive' : 'negative');
      let icon = '💵', label = tx.type;
      if (tx.type === 'deposit') { icon = '⬇️'; label = 'ገንዘብ ማስገባት'; }
      else if (tx.type === 'withdraw') { icon = '⬆️'; label = 'ገንዘብ ማውጣት'; }
      else if (tx.type === 'bet') { icon = '🎫'; label = 'ካርድ ግዢ'; }
      else if (tx.type === 'win') { icon = '🏆'; label = 'BINGO ድል'; }
      else if (tx.type === 'refund') { icon = '↩️'; label = 'ተመላሽ'; }
      else if (tx.type === 'bonus') { icon = '🎁'; label = 'ቦነስ'; }
      const date = tx.created_at ? new Date(tx.created_at).toLocaleString('am-ET', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      div.innerHTML = `
        <div class="tx-icon">${icon}</div>
        <div class="tx-info">
          <div class="tx-label">${label}</div>
          <div class="tx-date">${date}</div>
        </div>
        <div class="tx-amount">${isPositive ? '+' : ''}${tx.amount.toFixed(2)}</div>
      `;
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}
function closeHistory(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
}

function inviteFriends() {
  const botUsername = 'Afbingobot';
  const roomUrl = 'https://t.me/' + botUsername;
  const inviteText = '🎱 Etbingo ተጫወት! አብረን እንጫወት 🎉';
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    try {
      const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(roomUrl) +
        '&text=' + encodeURIComponent(inviteText);
      tg.openTelegramLink(shareUrl);
      return;
    } catch (e) {}
  }
  if (navigator.share) {
    navigator.share({ title: 'Etbingo', text: inviteText + '\n\n' + roomUrl })
      .catch(() => copyToClipboard(inviteText + '\n\n' + roomUrl));
  } else {
    copyToClipboard(inviteText + '\n\n' + roomUrl);
  }
}
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('✅ ሊንኩ ተቀድቷል!'))
      .catch(() => showToast('📤 t.me/Afbingobot'));
  } else showToast('📤 t.me/Afbingobot');
}

async function createGame() {
  if (!roomId) { showToast('⚠️ ክፍል አልተገኘም'); return; }
  try {
    showToast('⏳ ጨዋታ እየተፈጠረ...');
    const r = await fetch('/api/newgame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    if (r.ok) { await fetchState(); showToast('✅ ጨዋታ ተፈጠረ!'); }
    else showToast('⚠️ ጨዋታ መፍጠር አልተቻለም');
  } catch (e) { showToast('⚠️ የኢንተርኔት ችግር'); }
}

async function joinGame(cardNum = 0) {
  if (!roomId || !userId) { showToast('⚠️ ክፍል አልተገኘም'); return; }
  if (userBalance < cardPrice) {
    showToast('💰 ሂሳብ አይበቃም! የሚያስፈልግ: ' + cardPrice.toFixed(2) + ' ETB');
    showDeposit();
    return;
  }
  try {
    showToast('⏳ በመቀላለል ላይ...');
    const r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, name: userName, card_num: cardNum })
    });
    const data = await r.json();
    if (data.error) {
      if (data.error === 'insufficient_balance') {
        showToast('💰 ሂሳብ አይበቃም! የሚያስፈልግ: ' + (data.needed || cardPrice).toFixed(2) + ' ETB');
        showDeposit();
      } else showToast('⚠️ ' + data.error);
      return;
    }
    showToast('✅ ተቀላቅለሃል!');
    if (data.balance !== undefined) {
      userBalance = data.balance;
      updateBalanceDisplay();
    }
    await fetchState();
  } catch (e) { showToast('⚠️ የኢንተርኔት ችግር'); }
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
    cell.onclick = () => { closePicker(); joinGame(i); };
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

async function fetchState() {
  if (!roomId) { showScreen('noGame'); return; }
  try {
    const r = await fetch('/api/state?chat=' + encodeURIComponent(roomId) + '&user=' + userId);
    const data = await r.json();
    if (data.error === 'no_game') { showScreen('noGame'); return; }
    if (data.error) return;

    if (data.card_price) {
      cardPrice = data.card_price;
      const cpEl = document.getElementById('cardPrice');
      if (cpEl) cpEl.textContent = cardPrice.toFixed(2);
    }

    const pc = document.getElementById('playerCount');
    if (pc) pc.textContent = '👥 ' + data.player_count;
    const cb = document.getElementById('calledBadge');
    if (cb) cb.textContent = '📢 ' + data.called_count + '/75';
    const rn = document.getElementById('roundNum');
    if (rn) rn.textContent = '🔄 Round ' + data.round_number;
    const rt = document.getElementById('roundTimer');
    if (rt) updateRoundTimer(data.round_remaining);

    if (data.needs_join) { showScreen('pick'); return; }

    showScreen('game');
    const pi = document.getElementById('playerInfo');
    if (pi) pi.textContent = '👤 ' + (data.player_name || 'ተጫዋች');

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

    if (data.winner && !gameOver) {
      gameOver = true;
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
        statusEl.classList.add('bingo');
      }
      launchConfetti();
      setTimeout(fetchBalance, 1000);
    }

    renderBoard();
    if (Math.random() < 0.25) fetchBalance();
  } catch (e) {}
}

function updateRoundTimer(seconds) {
  const el = document.getElementById('roundTimer');
  if (!el) return;
  if (seconds === undefined || seconds === null) { el.textContent = '⏰ --:--'; return; }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  el.textContent = '⏰ ' + m + ':' + (s < 10 ? '0' : '') + s;
  if (seconds <= 30) el.classList.add('urgent');
  else el.classList.remove('urgent');
}

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
      if (num === 'FREE') { cell.textContent = 'FREE'; cell.classList.add('free'); }
      else cell.textContent = num;
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
      if (data.error === 'not_called') showToast('⚠️ ገና አልተጠራም!');
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
      setTimeout(fetchBalance, 1000);
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

registerUser().then(() => fetchBalance());
fetchState();
setInterval(fetchState, 2000);
setInterval(fetchBalance, 10000);
