// ===== INIT =====
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
    if (!isNaN(id)) userId = id;
  }
  if (!userId) userId = 100000 + Math.floor(Math.random() * 899999);
  if (!roomId) roomId = 'u' + userId;
}
initTelegram();

// ===== STATE =====
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let currentScreen = 'loading';
let lastRound = 0;
let userBalance = 0;
let cardPrice = 10.0;
let depAccounts = {};
let depSelectedMethod = null;
let wdSelectedMethod = null;

// ===== TOAST =====
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
  window._toastTimer = setTimeout(function() { toast.className = 'toast'; }, 3500);
}

// ===== SCREENS =====
function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  var screens = ['noGameScreen', 'pickScreen', 'gameScreen'];
  for (var i = 0; i < screens.length; i++) {
    var el = document.getElementById(screens[i]);
    if (el) el.style.display = 'none';
  }
  if (name === 'noGame') { var e1 = document.getElementById('noGameScreen'); if (e1) e1.style.display = 'block'; }
  else if (name === 'pick') { var e2 = document.getElementById('pickScreen'); if (e2) e2.style.display = 'block'; }
  else if (name === 'game') { var e3 = document.getElementById('gameScreen'); if (e3) e3.style.display = 'block'; }
}

// ===== BALANCE =====
async function fetchBalance() {
  if (!userId) return;
  try {
    var r = await fetch('/api/user/balance?user=' + userId);
    var data = await r.json();
    if (data.balance !== undefined) {
      userBalance = data.balance;
      updateBalanceDisplay();
    }
  } catch (e) {}
}

function updateBalanceDisplay() {
  var el = document.getElementById('balanceAmount');
  if (el) {
    el.textContent = userBalance.toFixed(2) + ' ETB';
    el.style.color = userBalance < cardPrice ? '#e74c3c' : '#27ae60';
  }
  var wd = document.getElementById('wdBalance');
  if (wd) wd.textContent = userBalance.toFixed(2) + ' ETB';
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

// ===== DEPOSIT =====
async function showDeposit() {
  var modal = document.getElementById('depositModal');
  if (!modal) return;
  depSelectedMethod = null;
  var s1 = document.getElementById('depStep1');
  var s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  modal.classList.add('open');
  await loadDepositAccounts();
}

function closeDeposit(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  var modal = document.getElementById('depositModal');
  if (modal) modal.classList.remove('open');
}

async function loadDepositAccounts() {
  var list = document.getElementById('methodList');
  if (!list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  try {
    var r = await fetch('/api/deposit/accounts');
    var data = await r.json();
    depAccounts = data.accounts || {};
    var keys = Object.keys(depAccounts);
    if (keys.length === 0) {
      list.innerHTML = '<div class="tx-empty">⚠️ የክፍያ ዘዴ አልተዘጋጀም</div>';
      return;
    }
    list.innerHTML = '';
    var names = { telebirr: '📱 Telebirr', cbe: '🏦 CBE Birr', awaash: '💳 Awaash' };
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var btn = document.createElement('button');
      btn.className = 'method-btn';
      btn.textContent = names[key] || key;
      btn.setAttribute('data-method', key);
      btn.onclick = (function(k) {
        return function() { selectMethod(k); };
      })(key);
      list.appendChild(btn);
    }
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function selectMethod(method) {
  depSelectedMethod = method;
  var info = document.getElementById('accountInfo');
  if (info) info.textContent = depAccounts[method] || '';
  var s1 = document.getElementById('depStep1');
  var s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
}

function depBack() {
  var s1 = document.getElementById('depStep1');
  var s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  depSelectedMethod = null;
}

function copyAccount() {
  var info = document.getElementById('accountInfo');
  if (!info) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(info.textContent).then(function() {
      showToast('✅ ተቀድቷል!');
    });
  }
}

async function submitDeposit() {
  if (!depSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  var amountEl = document.getElementById('depAmount');
  var refEl = document.getElementById('depRef');
  var amount = parseFloat(amountEl.value);
  var ref = refEl.value.trim();
  if (!amount || amount < 10) { showToast('⚠️ ቢያንስ 10 ETB'); return; }
  if (amount > 50000) { showToast('⚠️ ከ 50,000 በላይ አይቻልም'); return; }
  if (!ref) { showToast('⚠️ Reference ያስፈልጋል'); return; }

  var btn = document.getElementById('depSubmit');
  btn.disabled = true;
  btn.textContent = '⏳ በመላክ ላይ...';

  try {
    var r = await fetch('/api/deposit/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount: amount,
        method: depSelectedMethod, reference: ref
      })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('✅ ጥያቄዎ ተልኳል!');
      closeDeposit();
      amountEl.value = '';
      refEl.value = '';
    } else {
      showToast('⚠️ ' + (data.error || 'ስህተት'));
    }
  } catch (e) {
    showToast('⚠️ የኢንተርኔት ችግር');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ ላክ';
  }
}

// ===== WITHDRAW =====
function showWithdraw() {
  var modal = document.getElementById('withdrawModal');
  if (!modal) return;
  wdSelectedMethod = null;
  var btns = document.querySelectorAll('#wdMethodList .method-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  var acc = document.getElementById('wdAccount');
  var amt = document.getElementById('wdAmount');
  if (acc) acc.value = '';
  if (amt) amt.value = '';
  var wd = document.getElementById('wdBalance');
  if (wd) wd.textContent = userBalance.toFixed(2) + ' ETB';
  modal.classList.add('open');
}

function closeWithdraw(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  var modal = document.getElementById('withdrawModal');
  if (modal) modal.classList.remove('open');
}

function selectWdMethod(method) {
  wdSelectedMethod = method;
  var btns = document.querySelectorAll('#wdMethodList .method-btn');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('selected');
  if (window.event && window.event.target) window.event.target.classList.add('selected');
}

async function submitWithdraw() {
  if (!wdSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  var accEl = document.getElementById('wdAccount');
  var amtEl = document.getElementById('wdAmount');
  var account = accEl.value.trim();
  var amount = parseFloat(amtEl.value);

  if (!account) { showToast('⚠️ የአካውንት ቁጥር ያስፈልጋል'); return; }
  if (!amount || amount < 50) { showToast('⚠️ ቢያንስ 50 ETB'); return; }
  if (amount > 10000) { showToast('⚠️ ከ 10,000 በላይ አይቻልም'); return; }
  if (amount > userBalance) { showToast('💰 ሂሳብ አይበቃም!'); return; }

  if (!confirm('💸 ' + amount.toFixed(2) + ' ETB ወደ ' + account + ' ይውጣ?')) return;

  var btn = document.getElementById('wdSubmit');
  btn.disabled = true;
  btn.textContent = '⏳ በመላክ ላይ...';

  try {
    var r = await fetch('/api/withdraw/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount: amount,
        method: wdSelectedMethod, account: account
      })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('✅ ጥያቄዎ ተልኳል!');
      closeWithdraw();
      await fetchBalance();
    } else {
      showToast('⚠️ ' + (data.error || 'ስህተት'));
    }
  } catch (e) {
    showToast('⚠️ የኢንተርኔት ችግር');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ ጥያቄ ላክ';
  }
}

// ===== HISTORY =====
async function showHistory() {
  var modal = document.getElementById('historyModal');
  var list = document.getElementById('txList');
  if (!modal || !list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  modal.classList.add('open');
  try {
    var r = await fetch('/api/user/transactions?user=' + userId);
    var data = await r.json();
    var txs = data.transactions || [];
    if (txs.length === 0) {
      list.innerHTML = '<div class="tx-empty">📭 እስካሁን ምንም ግብይት የለም</div>';
      return;
    }
    list.innerHTML = '';
    for (var i = 0; i < txs.length; i++) {
      var tx = txs[i];
      var div = document.createElement('div');
      var isPositive = tx.amount > 0;
      div.className = 'tx-item ' + (isPositive ? 'positive' : 'negative');
      var icon = '💵', label = tx.type;
      if (tx.type === 'deposit') { icon = '⬇️'; label = 'ገንዘብ ማስገባት'; }
      else if (tx.type === 'withdraw') { icon = '⬆️'; label = 'ገንዘብ ማውጣት'; }
      else if (tx.type === 'bet') { icon = '🎫'; label = 'ካርድ ግዢ'; }
      else if (tx.type === 'win') { icon = '🏆'; label = 'BINGO ድል'; }
      else if (tx.type === 'refund') { icon = '↩️'; label = 'ተመላሽ'; }
      else if (tx.type === 'bonus') { icon = '🎁'; label = 'ቦነስ'; }
      var date = tx.created_at ? new Date(tx.created_at).toLocaleString('am-ET', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : '';
      div.innerHTML =
        '<div class="tx-icon">' + icon + '</div>' +
        '<div class="tx-info">' +
          '<div class="tx-label">' + label + '</div>' +
          '<div class="tx-date">' + date + '</div>' +
        '</div>' +
        '<div class="tx-amount">' + (isPositive ? '+' : '') + tx.amount.toFixed(2) + '</div>';
      list.appendChild(div);
    }
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function closeHistory(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  var modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
}

// ===== INVITE =====
function inviteFriends() {
  var botUsername = 'Afbingobot';
  var roomUrl = 'https://t.me/' + botUsername;
  var inviteText = '🎱 Etbingo ተጫወት! አብረን እንጫወት 🎉';
  if (window.Telegram && window.Telegram.WebApp) {
    var tg = window.Telegram.WebApp;
    try {
      var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(roomUrl) +
        '&text=' + encodeURIComponent(inviteText);
      tg.openTelegramLink(shareUrl);
      return;
    } catch (e) {}
  }
  if (navigator.share) {
    navigator.share({ title: 'Etbingo', text: inviteText + '\n\n' + roomUrl })
      .catch(function() { copyToClipboard(inviteText + '\n\n' + roomUrl); });
  } else {
    copyToClipboard(inviteText + '\n\n' + roomUrl);
  }
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      showToast('✅ ሊንኩ ተቀድቷል!');
    });
  }
}

// ===== GAME API =====
async function createGame() {
  if (!roomId) { showToast('⚠️ ክፍል አልተገኘም'); return; }
  try {
    showToast('⏳ ጨዋታ እየተፈጠረ...');
    var r = await fetch('/api/newgame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId })
    });
    if (r.ok) { await fetchState(); showToast('✅ ጨዋታ ተፈጠረ!'); }
    else showToast('⚠️ ጨዋታ መፍጠር አልተቻለም');
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
    showToast('⏳ በመቀላለል ላይ...');
    var r = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, name: userName, card_num: cardNum })
    });
    var data = await r.json();
    if (data.error) {
      if (data.error === 'insufficient_balance') {
        showToast('💰 ሂሳብ አይበቃም!');
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
  var modal = document.getElementById('pickerModal');
  if (modal) modal.classList.add('open');
}

function closePicker(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  var modal = document.getElementById('pickerModal');
  if (modal) modal.classList.remove('open');
}

function renderPicker() {
  var grid = document.getElementById('pickerGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (var i = 1; i <= 144; i++) {
    var cell = document.createElement('div');
    cell.className = 'picker-cell';
    cell.textContent = i;
    cell.setAttribute('data-num', i);
    cell.onclick = (function(n) {
      return function() { closePicker(); joinGame(n); };
    })(i);
    grid.appendChild(cell);
  }
}

function confirmNewGame() {
  if (confirm('አዲስ ጨዋታ ጀምር?')) createGame();
}

// ===== FETCH STATE =====
async function fetchState() {
  if (!roomId) { showScreen('noGame'); return; }
  try {
    var r = await fetch('/api/state?chat=' + encodeURIComponent(roomId) + '&user=' + userId);
    var data = await r.json();
    if (data.error === 'no_game') { showScreen('noGame'); return; }
    if (data.error) return;

    if (data.card_price) {
      cardPrice = data.card_price;
      var cpEl = document.getElementById('cardPrice');
      if (cpEl) cpEl.textContent = cardPrice.toFixed(2);
    }

    var pc = document.getElementById('playerCount');
    if (pc) pc.textContent = '👥 ' + data.player_count;
    var cb = document.getElementById('calledBadge');
    if (cb) cb.textContent = '📢 ' + data.called_count + '/75';

    // BINGO countdown
    var countdown = document.getElementById('bingoCountdown');
    var countdownTimer = document.getElementById('countdownTimer');
    if (data.winner) {
      if (countdown) countdown.style.display = 'block';
      if (countdownTimer) countdownTimer.textContent = data.round_remaining;
    } else {
      if (countdown) countdown.style.display = 'none';
    }

    if (data.needs_join) { showScreen('pick'); return; }

    showScreen('game');
    var pi = document.getElementById('playerInfo');
    if (pi) pi.textContent = '👤 ' + (data.player_name || 'ተጫዋች');

    if (data.round_number !== lastRound) {
      lastRound = data.round_number;
      gameOver = false;
      lastCalled = null;
      var st = document.getElementById('status');
      if (st) { st.textContent = ''; st.classList.remove('bingo'); }
      var lc = document.getElementById('lastCalled');
      if (lc) lc.textContent = '—';
      var hist = document.getElementById('history');
      if (hist) hist.innerHTML = '';
      calledHistory = [];
      var cf = document.getElementById('confetti');
      if (cf) cf.innerHTML = '';
    }

    card = data.card;
    markedSet = new Set(data.marked.map(function(pair) { return pair[0] + '-' + pair[1]; }));

    if (data.last && data.last !== lastCalled) {
      lastCalled = data.last;
      var el = document.getElementById('lastCalled');
      if (el) {
        el.textContent = data.last;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
      }
    } else if (!data.last) {
      var el2 = document.getElementById('lastCalled');
      if (el2) el2.textContent = '—';
    }

    if (data.called.length !== calledHistory.length) {
      var hist2 = document.getElementById('history');
      if (hist2) {
        hist2.innerHTML = '';
        data.called.forEach(function(n) {
          var span = document.createElement('span');
          span.textContent = n;
          hist2.appendChild(span);
        });
        hist2.scrollTop = hist2.scrollHeight;
      }
      calledHistory = data.called;
    }

    if (data.winner && !gameOver) {
      gameOver = true;
      var statusEl = document.getElementById('status');
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

function renderBoard() {
  if (!card) return;
  var boardEl = document.getElementById('board');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  var headers = ['B', 'I', 'N', 'G', 'O'];
  for (var h = 0; h < headers.length; h++) {
    var hEl = document.createElement('div');
    hEl.className = 'header';
    hEl.textContent = headers[h];
    boardEl.appendChild(hEl);
  }
  for (var r = 0; r < 5; r++) {
    for (var c = 0; c < 5; c++) {
      var num = card[r][c];
      var cell = document.createElement('div');
      cell.className = 'cell';
      if (num === 'FREE') { cell.textContent = 'FREE'; cell.classList.add('free'); }
      else cell.textContent = num;
      if (markedSet.has(r + '-' + c)) cell.classList.add('marked');
      cell.setAttribute('data-r', r);
      cell.setAttribute('data-c', c);
      cell.onclick = (function(row, col) {
        return function() { clickCell(row, col); };
      })(r, c);
      boardEl.appendChild(cell);
    }
  }
}

async function clickCell(r, c) {
  if (!card || gameOver) return;
  if (card[r][c] === 'FREE') return;
  try {
    var resp = await fetch('/api/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: roomId, user: userId, r: r, c: c })
    });
    var data = await resp.json();
    if (data.error) {
      if (data.error === 'not_called') showToast('⚠️ ገና አልተጠራም!');
      return;
    }
    markedSet = new Set(data.marked.map(function(pair) { return pair[0] + '-' + pair[1]; }));
    renderBoard();
    if (data.winner && !gameOver) {
      gameOver = true;
      var statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = '🎉 BINGO! ' + data.winner.join(', ');
    
