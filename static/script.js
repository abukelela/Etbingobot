console.log('🚀 Etbingo script loaded');

let roomId = '';
let userId = 0;
let userName = 'ተጫዋች';
let userBalance = 0;
let cardPrice = 10.0;
let card = null;
let markedSet = new Set();
let lastCalled = null;
let gameOver = false;
let calledHistory = [];
let lastRound = 0;
let depAccounts = {};
let depMethod = null;
let wdMethod = null;

// ===== Init =====
function init() {
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  const u = params.get('user');
  if (r) roomId = r;
  if (u) userId = parseInt(u);

  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    const d = tg.initDataUnsafe || {};
    if (!userId && d.user && d.user.id) {
      userId = d.user.id;
      userName = d.user.first_name || 'ተጫዋች';
    }
    if (!roomId && d.chat && d.chat.id) roomId = 'c' + d.chat.id;
  }
  if (roomId && !userId && roomId.startsWith('u')) {
    const id = parseInt(roomId.substring(1));
    if (!isNaN(id)) userId = id;
  }
  if (!userId) userId = 100000 + Math.floor(Math.random() * 899999);
  if (!roomId) roomId = 'u' + userId;

  bindButtons();
  registerUser().then(fetchBalance);
  fetchState();
  setInterval(fetchState, 2000);
  setInterval(fetchBalance, 10000);
}

function $(id) { return document.getElementById(id); }

function showToast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast show';
  clearTimeout(window._tt);
  window._tt = setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ===== Bind all buttons =====
function bindButtons() {
  $('btnDeposit').onclick = showDeposit;
  $('btnWithdraw').onclick = showWithdraw;
  $('btnHistory').onclick = showHistory;
  $('btnInvite').onclick = inviteFriends;
  $('btnCreateGame').onclick = createGame;
  $('btnOpenPicker').onclick = openPicker;
  $('btnRandom').onclick = () => joinGame(0);
  $('btnAuto').onclick = toggleAuto;
  $('btnCall').onclick = drawNumber;
  $('btnNew').onclick = confirmNewGame;
  $('closePicker').onclick = () => $('pickerModal').classList.remove('open');
  $('closeHistory').onclick = () => $('historyModal').classList.remove('open');
  $('closeDeposit').onclick = () => $('depositModal').classList.remove('open');
  $('closeWithdraw').onclick = () => $('withdrawModal').classList.remove('open');
  $('btnDepBack').onclick = depBack;
  $('btnDepSubmit').onclick = submitDeposit;
  $('btnCopy').onclick = copyAccount;
  $('btnWdSubmit').onclick = submitWithdraw;
  $('btnWdCancel').onclick = () => $('withdrawModal').classList.remove('open');

  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => {
    b.onclick = () => {
      wdMethod = b.dataset.method;
      document.querySelectorAll('#wdMethodList .method-btn').forEach(x => x.style.background = '');
      b.style.background = '#3498db';
    };
  });
}

// ===== API =====
async function api(url, opts) {
  try {
    const r = await fetch(url, opts);
    return await r.json();
  } catch (e) { return { error: 'network' }; }
}

async function registerUser() {
  if (!userId) return;
  await api('/api/user/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: userId, name: userName })
  });
}

async function fetchBalance() {
  if (!userId) return;
  const d = await api('/api/user/balance?user=' + userId);
  if (d.balance !== undefined) {
    userBalance = d.balance;
    $('balanceAmount').textContent = userBalance.toFixed(2) + ' ETB';
    $('balanceAmount').style.color = userBalance < cardPrice ? '#e74c3c' : '#27ae60';
    if ($('wdBalance')) $('wdBalance').textContent = userBalance.toFixed(2) + ' ETB';
  }
}

// ===== Deposit =====
async function showDeposit() {
  console.log('➕ Deposit');
  depMethod = null;
  $('depStep1').style.display = 'block';
  $('depStep2').style.display = 'none';
  $('depositModal').classList.add('open');
  const list = $('methodList');
  list.innerHTML = '<div class="tx-loading">⏳...</div>';
  const d = await api('/api/deposit/accounts');
  depAccounts = d.accounts || {};
  const keys = Object.keys(depAccounts);
  if (!keys.length) { list.innerHTML = '<div class="tx-empty">⚠️ ዘዴ የለም</div>'; return; }
  list.innerHTML = '';
  const names = { telebirr: '📱 Telebirr', cbe: '🏦 CBE Birr', awaash: '💳 Awaash' };
  keys.forEach(k => {
    const b = document.createElement('button');
    b.className = 'method-btn';
    b.textContent = names[k] || k;
    b.onclick = () => {
      depMethod = k;
      $('accountInfo').textContent = depAccounts[k];
      $('depStep1').style.display = 'none';
      $('depStep2').style.display = 'block';
    };
    list.appendChild(b);
  });
}

function depBack() {
  $('depStep1').style.display = 'block';
  $('depStep2').style.display = 'none';
}

function copyAccount() {
  const t = $('accountInfo').textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => showToast('✅ ተቀድቷል!'));
}

async function submitDeposit() {
  if (!depMethod) return showToast('⚠️ ዘዴ ይምረጡ');
  const amount = parseFloat($('depAmount').value);
  const ref = $('depRef').value.trim();
  if (!amount || amount < 10) return showToast('⚠️ ቢያንስ 10 ETB');
  if (!ref) return showToast('⚠️ Reference ያስፈልጋል');
  $('btnDepSubmit').disabled = true;
  const d = await api('/api/deposit/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: userId, name: userName, amount, method: depMethod, reference: ref })
  });
  $('btnDepSubmit').disabled = false;
  if (d.ok) {
    showToast('✅ ጥያቄ ተልኳል!');
    $('depositModal').classList.remove('open');
    $('depAmount').value = ''; $('depRef').value = '';
  } else showToast('⚠️ ' + (d.error || 'ስህተት'));
}

// ===== Withdraw =====
function showWithdraw() {
  console.log('💸 Withdraw');
  wdMethod = null;
  $('wdAccount').value = '';
  $('wdAmount').value = '';
  $('wdBalance').textContent = userBalance.toFixed(2) + ' ETB';
  document.querySelectorAll('#wdMethodList .method-btn').forEach(b => b.style.background = '');
  $('withdrawModal').classList.add('open');
}

async function submitWithdraw() {
  if (!wdMethod) return showToast('⚠️ ዘዴ ይምረጡ');
  const account = $('wdAccount').value.trim();
  const amount = parseFloat($('wdAmount').value);
  if (!account) return showToast('⚠️ አካውንት ያስፈልጋል');
  if (!amount || amount < 50) return showToast('⚠️ ቢያንስ 50');
  if (amount > userBalance) return showToast('💰 ሂሳብ አይበቃም!');
  if (!confirm(amount + ' ETB ወደ ' + account + '?')) return;
  $('btn
