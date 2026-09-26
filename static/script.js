let roomId = '';
let userId = 0;
let userName = 'ተጫዋች';
let userBalance = 0;
let cardPrice = 10;
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let currentScreen = 'loading';
let lastRound = 0;
let depAccounts = {};
let depSelectedMethod = null;
let wdSelectedMethod = null;

// ===== Init Telegram =====
function initTelegram() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('room')) roomId = params.get('room');
  if (params.get('user')) userId = parseInt(params.get('user'));

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    const d = tg.initDataUnsafe || {};
    if (!userId && d.user && d.user.id) {
      userId = d.user.id;
      userName = d.user.first_name || 'ተጫዋች';
    }
    if (!roomId) {
      if (d.chat && d.chat.id) roomId = 'c' + d.chat.id;
      else if (userId) roomId = 'u' + userId;
    }
  }
  if (roomId && !userId && roomId.startsWith('u')) {
    const id = parseInt(roomId.substring(1));
    if (!isNaN(id)) userId = id;
  }
  if (!userId) userId = 100000 + Math.floor(Math.random() * 899999);
  if (!roomId) roomId = 'u' + userId;
}
initTelegram();

// ===== Toast =====
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'show';
  clearTimeout(window._tt);
  window._tt = setTimeout(() => { t.className = ''; }, 3000);
}

// ===== Screens =====
function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  ['noGameScreen','pickScreen','gameScreen'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
  });
  if (name === 'noGame') { const e = document.getElementById('noGameScreen'); if (e) e.style.display = 'block'; }
  if (name === 'pick') { const e = document.getElementById('pickScreen'); if (e) e.style.display = 'block'; }
  if (name === 'game') { const e = document.getElementById('gameScreen'); if (e) e.style.display = 'block'; }
}

// ===== Balance =====
async function fetchBalance() {
  if (!userId) return;
  try {
    const r = await fetch('/api/user/balance?user=' + userId);
    const d = await r.json();
    if (d.balance !== undefined) {
      userBalance = d.balance;
      const el = document.getElementById('balanceAmount');
      if (el) {
        el.textContent = userBalance.toFixed(2) + ' ETB';
        el.style.color = userBalance < cardPrice ? '#e74c3c' : '#27ae60';
      }
      const wd = document.getElementById('wdBalance');
      if (wd) wd.textContent = userBalance.toFixed(2) + ' ETB';
    }
  } catch (e) {}
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

// ===== Deposit =====
async function showDeposit() {
  const m = document.getElementById('depositModal');
  if (!m) { showToast('⚠️ Modal የለም'); return; }
  depSelectedMethod = null;
  const s1 = document.getElementById('depStep1');
  const s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  m.classList.add('open');
  await loadDepositAccounts();
}

function closeDeposit(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const m = document.getElementById('depositModal');
  if (m) m.classList.remove('open');
}

async function loadDepositAccounts() {
  const list = document.getElementById('methodList');
  if (!list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  try {
    const r = await fetch('/api/deposit/accounts');
    const d = await r.json();
    depAccounts = d.accounts || {};
    const keys = Object.keys(depAccounts);
    if (keys.length === 0) {
      list.innerHTML = '<div class="tx-empty">⚠️ ዘዴ አልተዘጋጀም</div>';
      return;
    }
    list.innerHTML = '';
    const names = { telebirr: '📱 Telebirr', cbe: '🏦 CBE Birr', awaash: '💳 Awaash' };
    keys.forEach(k => {
      const b = document.createElement('button');
      b.className = 'method-btn';
      b.textContent = names[k] || k;
      b.onclick = () => selectMethod(k);
      list.appendChild(b);
    });
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function selectMethod(method) {
  depSelectedMethod = method;
  const ai = document.getElementById('accountInfo');
  if (ai) ai.textContent = depAccounts[method] || '';
  const s1 = document.getElementById('depStep1');
  const s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
}

function depBack() {
  const s1 = document.getElementById('depStep1');
  const s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  depSelectedMethod = null;
}

function copyAccount() {
  const ai = document.getElementById('accountInfo');
  if (!ai) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(ai.textContent).then(() => showToast('✅ ተቀድቷል!'));
  }
}

async function submitDeposit() {
  if (!depSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  const amount = parseFloat((document.getElementById('depAmount') || {}).value);
  const ref = ((document.getElementById('depRef') || {}).value || '').trim();
  if (!amount || amount < 10) { showToast('⚠️ ቢያንስ 10 ETB'); return; }
  if (amount > 50000) { showToast('⚠️ ከ 50,000 በላይ አይቻልም'); return; }
  if (!ref) { showToast('⚠️ Reference ያስፈልጋል'); return; }

  const btn = document.getElementById('depSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    const r = await fetch('/api/deposit/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount, method: depSelectedMethod, reference: ref
      })
    });
    const d = await r.json();
    if (d.ok) {
      showToast('✅ ጥያቄዎ ተልኳል!');
      closeDeposit();
    } else {
      showToast('⚠️ ' + (d.error || 'ስህተት'));
    }
  } catch (e) {
    showToast('⚠️ የኢንተርኔት ችግር');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ ላክ'; }
  }
}

// ===== Withdraw =====
function showWithdraw() {
  const m = document.getElementById('withdrawModal');
  if (!m) { showToast('⚠️ Modal የለም'); return; }
  wdSelectedMethod = null;
  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => b.classList.remove('selected'));
  const acc = document.getElementById('wdAccount');
  const amt = document.getElementById('wdAmount');
  if (acc) acc.value = '';
  if (amt) amt.value = '';
  const wd = document.getElementById('wdBalance');
  if (wd) wd.textContent = userBalance.toFixed(2) + ' ETB';
  m.classList.add('open');
}

function closeWithdraw(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const m = document.getElementById('withdrawModal');
  if (m) m.classList.remove('open');
}

function selectWdMethod(method) {
  wdSelectedMethod = method;
  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => b.classList.remove('selected'));
  if (window.event && window.event.target) window.event.target.classList.add('selected');
}

async function submitWithdraw() {
  if (!wdSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  const account = ((document.getElementById('wdAccount') || {}).value || '').trim();
  const amount = parseFloat((document.getElementById('wdAmount') || {}).value);
  if (!account) { showToast('⚠️ አካውንት ያስፈልጋል'); return; }
  if (!amount || amount < 50) { showToast('⚠️ ቢያንስ 50 ETB'); return; }
  if (amount > 10000) { showToast('⚠️ ከ 10,000 በላይ አይቻልም'); return; }
  if (amount > userBalance) { showToast('💰 ሂሳብ አይበቃም!'); return; }
  if (!confirm('💸 ' + amount.toFixed(2) + ' ETB ወደ ' + account + ' ይውጣ?')) return;

  const btn = document.getElementById('wdSubmit');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

  try {
    const r = await fetch('/api/withdraw/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount, method: wdSelectedMethod, account
      })
    });
    const d = await r.json();
    if (d.ok) {
      showToast('✅ ጥያቄዎ ተልኳል!');
      closeWithdraw();
      await fetchBalance();
    } else {
      showToast('⚠️ ' + (d.error || 'ስህተት'));
    }
  } catch (e) {
    showToast('⚠️ የኢንተርኔት ችግር');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✅ ላክ'; }
  }
}

// ===== History =====
async function showHistory() {
  const m = document.getElementById('historyModal');
  const list = document.getElementById('txList');
  if (!m || !list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  m.classList.add('open');
  try {
    const r = await fetch('/api/user/transactions?user=' + userId);
    const d = await r.json();
    const txs = d.transactions || [];
    if (txs.length === 0) {
      list.innerHTML = '<div class="tx-empty">📭 ምንም ግብይት የለም</div>';
      return;
    }
    list.innerHTML = '';
    txs.forEach(tx => {
      const div = document.createElement('div');
      const pos = tx.amount > 0;
      div.className = 'tx-item ' + (pos ? 'positive' : 'negative');
      div.innerHTML = '<div class="tx-icon">' + (pos ? '⬇️' : '⬆️') + '</div>' +
        '<div class="tx-info"><div class="tx-label">' + tx.type + '</div></div>' +
        '<div class="tx-amount">' + (pos ? '+' : '') + tx.amount.toFixed(2) + '</div>';
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function closeHistory(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const m = document.getElementById('historyModal');
  if (m) m.classList.remove('open');
}

// ===== Invite =====
function inviteFriends() {
  const url = 'https://t.me/Afbingobot';
  const text = '🎱 Etbingo ተጫወት! አብረን እንጫወት 🎉';
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.openTelegramLink('https://t.me/share/url?url=' +
        encodeURIComponent(url) + '&text=' + encodeURIComponent(text));
      return;
    } catch (e) {}
  }
  if (navigator.share) {
    navigator.share({ title: 'Etbingo', text: text + '\n\n' + url }).catch(() => {});
  }
}

// ===== Game =====
async function createGame() {
  if (!roomId) { showToast('⚠️ ክፍል አልተገኘም'); return; }
  try {
    showToast('⏳...');
    const r = await fetch('/api/newgame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    if (r.ok) { await fetchState(); showToast('✅ ጨዋታ ተፈጠረ!'); }
    else showToast('⚠️ ስህተት');
  } catch (e) { showToast('⚠️ የኢንተርኔት ችግር'); }
}

async function joinGame(cardNum) {
  if (cardNum === undefined) cardNum = 0;
  if (!roomId || !userId) { showToast('⚠️ ክፍል አልተገኘም'); return; }
  if (userBalance < cardPrice) {
    showToast('💰 ሂሳብ አይበቃም!');
    showDeposit();
    return;
  }
  try {
    showToast('⏳...');
    const r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, name: userName, card_num: cardNum })
    });
    const d = await r.json();
    if (d.error) {
      if (d.error === 'insufficient_balance') {
        showToast('💰 ሂሳብ አይበቃም!');
        showDeposit();
      } else showToast('⚠️ ' + d.error);
      return;
    }
    showToast('✅ ተቀላቅለሃል!');
    if (d.balance !== undefined) {
      userBalance = d.balance;
      const el = document.getElementById('balanceAmount');
      if (el) el.textContent = userBalance.toFixed(2) + ' ETB';
    }
    await fetchState();
  } catch (e) { showToast('⚠️ የኢንተርኔት ችግር'); }
}

function joinWithRandom() { joinGame(0); }

function openPicker() {
  const grid = document.getElementById('pickerGrid');
  if (grid) {
    grid.innerHTML = '';
    for (let i = 1; i <= 144; i++) {
      const c = document.createElement('div');
      c.className = 'picker-cell';
      c.textContent = i;
      c.onclick = () => { closePicker(); joinGame(i); };
      grid.appendChild(c);
    }
  }
  const m = document.getElementById('pickerModal');
  if (m) m.classList.add('open');
}

function closePicker(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const m = document.getElementById('pickerModal');
  if (m) m.classList.remove('open');
}

async function drawNumber() {
  if (!roomId) return;
  try {
    await fetch('/api/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: roomId }) });
    await fetchState();
  } catch (e) {}
}

async function toggleAuto() {
  if (!roomId) return;
  try {
    await fetch('/api/toggle_auto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: roomId }) });
    await fetchState();
  } catch (e) {}
}

function confirmNewGame() {
  if (confirm('አዲስ ጨዋታ ጀምር?')) createGame();
}

async function fetchState() {
  if (!roomId) { showScreen('noGame'); return; }
  try {
    const r = await fetch('/api/state?chat=' + encodeURIComponent(roomId) + '&user=' + userId);
    const d = await r.json();
    if (d.error === 'no_game') { showScreen('noGame'); return; }
    if (d.error) return;

    if (d.card_price) {
      cardPrice = d.card_price;
      const cp = document.getElementById('cardPrice');
      if (cp) cp.textContent = cardPrice.toFixed(2);
    }

    const pc = document.getElementById('playerCount');
    if (pc) pc.textContent = '👥 ' + d.player_count;
    const cb = document.getElementById('calledBadge');
    if (cb) cb.textContent = '📢 ' + d.called_count + '/75';
    const rn = document.getElementById('roundNum');
    if (rn) rn.textContent = '🔄 Round ' + d.round_number;
    const rt = document.getElementById('roundTimer');
    if (rt) {
      const s = d.round_remaining;
      if (s !== null && s !== undefined) {
        const m = Math.floor(s / 60);
        const ss = s % 60;
        rt.textContent = '⏰ ' + m + ':' + (ss < 10 ? '0' : '') + ss;
      }
    }

    if (d.needs_join) { showScreen('pick'); return; }

    showScreen('game');
    const pi = document.getElementById('playerInfo');
    if (pi) pi.textContent = '👤 ' + (d.player_name || 'ተጫዋች');

    if (d.round_number !== lastRound) {
      lastRound = d.round_number;
      gameOver = false;
      lastCalled = null;
    }

    card = d.card;
    markedSet = new Set((d.marked || []).map(p => p[0] + '-' + p[1]));

    if (d.last && d.last !== lastCalled) {
      lastCalled = d.last;
      const el = document.getElementById('lastCalled');
      if (el) el.textContent = d.last;
    }

    const autoBtn = document.getElementById('autoBtn');
    if (autoBtn) {
      if (d.auto) autoBtn.classList.add('running');
      else autoBtn.classList.remove('running');
      const ai = document.getElementById('autoIcon');
      const at = document.getElementById('autoText');
      if (ai) ai.textContent = d.auto ? '⏸️' : '▶️';
      if (at) at.textContent = d.auto ? 'አቁም' : 'ራስ-ሰር';
    }

    if (d.called && d.called.length !== calledHistory.length) {
      const hist = document.getElementById('history');
      if (hist) {
        hist.innerHTML = '';
        d.called.forEach(n => {
          const sp = document.createElement('span');
          sp.textContent = n;
          hist.appendChild(sp);
        });
      }
      calledHistory = d.called;
    }

    if (d.winner && !gameOver) {
      gameOver = true;
      const s = document.getElementById('status');
      if (s) s.textContent = '🎉 BINGO! ' + d.winner.join(', ');
      launchConfetti();
      setTimeout(fetchBalance, 1000);
    }

    renderBoard();
    if (Math.random() < 0.25) fetchBalance();
  } catch (e) {}
}

function renderBoard() {
  if (!card) return;
  const b = document.getElementById('board');
  if (!b) return;
  b.innerHTML = '';
  ['B','I','N','G','O'].forEach(l => {
    const h = document.createElement('div');
    h.className = 'header';
    h.textContent = l;
    b.appendChild(h);
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
      b.appendChild(cell);
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
      body: JSON.stringify({ chat: roomId, user: userId, r, c })
    });
    const d = await resp.json();
    if (d.error) return;
    markedSet = new Set((d.marked || []).map(p => p[0] + '-' + p[1]));
    renderBoard();
    if (d.winner && !gameOver) {
      gameOver = true;
      const s = document.getElementById('status');
      if (s) s.textContent = '🎉 BINGO! ' + d.winner.join(', ');
      launchConfetti();
      setTimeout(fetchBalance, 1000);
    }
  } catch (e) {}
}

function launchConfetti() {
  const colors = ['#ffd700','#ff6b6b','#4ecdc4','#95e1d3','#f38181','#aa96da'];
  const c = document.getElementById('confetti');
  if (!c) return;
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = '-10px';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDelay = Math.random() * 0.5 + 's';
    c.appendChild(p);
  }
}

// ===== Start =====
registerUser().then(() => fetchBalance());
fetchState();
setInterval(fetchState, 2000);
setInterval(fetchBalance, 10000);
