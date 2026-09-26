// ========== TELEGRAM INIT ==========
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

// ========== STATE ==========
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

// ========== TOAST ==========
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

// ========== SCREENS ==========
function showScreen(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  ['noGameScreen', 'pickScreen', 'gameScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  if (name === 'noGame') {
    const e = document.getElementById('noGameScreen');
    if (e) e.style.display = 'block';
  } else if (name === 'pick') {
    const e = document.getElementById('pickScreen');
    if (e) e.style.display = 'block';
  } else if (name === 'game') {
    const e = document.getElementById('gameScreen');
    if (e) e.style.display = 'block';
  }
}

// ========== BALANCE ==========
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
  const wd = document.getElementById('wdBalance');
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

// ========== DEPOSIT ==========
async function showDeposit() {
  const modal = document.getElementById('depositModal');
  if (!modal) return;
  depSelectedMethod = null;
  const s1 = document.getElementById('depStep1');
  const s2 = document.getElementById('depStep2');
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  modal.classList.add('open');
  await loadDepositAccounts();
}

function closeDeposit(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('depositModal');
  if (modal) modal.classList.remove('open');
}

async function loadDepositAccounts() {
  const list = document.getElementById('methodList');
  if (!list) return;
  list.innerHTML = '<div class="tx-loading">⏳ በመጫን ላይ...</div>';
  try {
    const r = await fetch('/api/deposit/accounts');
    const data = await r.json();
    depAccounts = data.accounts || {};
    const keys = Object.keys(depAccounts);
    if (keys.length === 0) {
      list.innerHTML = '<div class="tx-empty">⚠️ የክፍያ ዘዴ አልተዘጋጀም</div>';
      return;
    }
    list.innerHTML = '';
    const names = { telebirr: '📱 Telebirr', cbe: '🏦 CBE Birr', awaash: '💳 Awaash' };
    keys.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'method-btn';
      btn.textContent = names[key] || key;
      btn.onclick = () => selectMethod(key);
      list.appendChild(btn);
    });
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function selectMethod(method) {
  depSelectedMethod = method;
  const info = document.getElementById('accountInfo');
  if (info) info.textContent = depAccounts[method] || '';
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
  const info = document.getElementById('accountInfo');
  if (!info) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(info.textContent).then(() => showToast('✅ ተቀድቷል!'));
  }
}

async function submitDeposit() {
  if (!depSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  const amountEl = document.getElementById('depAmount');
  const refEl = document.getElementById('depRef');
  const amount = parseFloat(amountEl.value);
  const ref = refEl.value.trim();
  if (!amount || amount < 10) { showToast('⚠️ ቢያንስ 10 ETB'); return; }
  if (amount > 50000) { showToast('⚠️ ከ 50,000 በላይ አይቻልም'); return; }
  if (!ref) { showToast('⚠️ Reference ያስፈልጋል'); return; }

  const btn = document.getElementById('depSubmit');
  btn.disabled = true;
  btn.textContent = '⏳ በመላክ ላይ...';

  try {
    const r = await fetch('/api/deposit/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount: amount,
        method: depSelectedMethod, reference: ref
      })
    });
    const data = await r.json();
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

// ========== WITHDRAW ==========
function showWithdraw() {
  const modal = document.getElementById('withdrawModal');
  if (!modal) return;
  wdSelectedMethod = null;
  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => b.classList.remove('selected'));
  const acc = document.getElementById('wdAccount');
  const amt = document.getElementById('wdAmount');
  if (acc) acc.value = '';
  if (amt) amt.value = '';
  const wd = document.getElementById('wdBalance');
  if (wd) wd.textContent = userBalance.toFixed(2) + ' ETB';
  modal.classList.add('open');
}

function closeWithdraw(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('withdrawModal');
  if (modal) modal.classList.remove('open');
}

function selectWdMethod(method) {
  wdSelectedMethod = method;
  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => b.classList.remove('selected'));
  if (event && event.target) event.target.classList.add('selected');
}

async function submitWithdraw() {
  if (!wdSelectedMethod) { showToast('⚠️ ዘዴ ይምረጡ'); return; }
  const accEl = document.getElementById('wdAccount');
  const amtEl = document.getElementById('wdAmount');
  const account = accEl.value.trim();
  const amount = parseFloat(amtEl.value);

  if (!account) { showToast('⚠️ የአካውንት ቁጥር ያስፈልጋል'); return; }
  if (!amount || amount < 50) { showToast('⚠️ ቢያንስ 50 ETB'); return; }
  if (amount > 10000) { showToast('⚠️ ከ 10,000 በላይ አይቻልም'); return; }
  if (amount > userBalance) { showToast('💰 ሂሳብ አይበቃም!'); return; }

  if (!confirm('💸 ' + amount.toFixed(2) + ' ETB ወደ ' + account + ' ይውጣ?')) return;

  const btn = document.getElementById('wdSubmit');
  btn.disabled = true;
  btn.textContent = '⏳ በመላክ ላይ...';

  try {
    const r = await fetch('/api/withdraw/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userId, name: userName, amount: amount,
        method: wdSelectedMethod, account: account
      })
    });
    const data = await r.json();
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

// ========== HISTORY ==========
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
      div.innerHTML =
        '<div class="tx-icon">' + icon + '</div>' +
        '<div class="tx-info">' +
          '<div class="tx-label">' + label + '</div>' +
          '<div class="tx-date">' + date + '</div>' +
        '</div>' +
        '<div class="tx-amount">' + (isPositive ? '+' : '') + tx.amount.toFixed(2) + '</div>';
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<div class="tx-empty">⚠️ ስህተት</div>';
  }
}

function closeHistory(event) {
  if (event && event.target !== event.currentTarget &&
      !event.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('historyModal');
  if (modal) modal.classList.remove('open');
}

// ========== INVITE ==========
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
    navigator.clipboard.writeText(text).then(() => showToast('✅ ሊንኩ ተቀድቷል!'));
  }
}

// ========== GAME API ==========
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
    showToast('💰 ሂሳብ አይበቃም!');
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
  const modal = document.getElementById('pickerModal');
  if (modal) modal.classList.add('open');
}

function closePicker(event) {
  if (event && event.target
