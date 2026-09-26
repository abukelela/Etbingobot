console.log('🚀 Script loaded at', new Date().toISOString());

// ===== Balance =====
let userBalance = 0;
let cardPrice = 10.0;

function $(id) { return document.getElementById(id); }

function showToast(msg) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => { t.className = 'toast'; }, 3000);
}

// ===== DEPOSIT =====
function showDeposit() {
  console.log('➕ Deposit clicked');
  alert('✅ Deposit button works!');
}

function closeDeposit() {
  const m = $('depositModal');
  if (m) m.classList.remove('open');
}

// ===== WITHDRAW =====
function showWithdraw() {
  console.log('💸 Withdraw clicked');
  alert('✅ Withdraw button works!');
}

function closeWithdraw() {
  const m = $('withdrawModal');
  if (m) m.classList.remove('open');
}

// ===== HISTORY =====
function showHistory() {
  console.log('📜 History clicked');
  alert('✅ History button works!');
}

function closeHistory() {
  const m = $('historyModal');
  if (m) m.classList.remove('open');
}

// ===== GAME =====
function createGame() {
  console.log('🎮 Create game clicked');
  alert('✅ Create Game button works!');
}

function openPicker() {
  alert('✅ Pick Card button works!');
}

function closePicker() {
  const m = $('pickerModal');
  if (m) m.classList.remove('open');
}

function joinWithRandom() {
  alert('✅ Random button works!');
}

function inviteFriends() {
  alert('✅ Invite button works!');
}

function drawNumber() {
  alert('✅ Draw button works!');
}

function toggleAuto() {
  alert('✅ Auto button works!');
}

function confirmNewGame() {
  alert('✅ New Game button works!');
}

// ===== STUBS =====
function fetchState() { }
function fetchBalance() { }
function registerUser() { }
function updateBalanceDisplay() { }
function renderBoard() { }
function depBack() { }
function copyAccount() { }
function submitDeposit() { }
function submitWithdraw() { }
function selectMethod() { }
function selectWdMethod() { }

// ===== BIND BUTTONS =====
function bindButtons() {
  console.log('🔗 Binding buttons...');
  const ids = ['btnDeposit', 'btnWithdraw', 'btnHistory', 'btnInvite', 
               'btnCreateGame', 'btnOpenPicker', 'btnRandom', 
               'btnAuto', 'btnCall', 'btnNew', 
               'closePicker', 'closeHistory', 'closeDeposit', 'closeWithdraw',
               'btnDepBack', 'btnDepSubmit', 'btnCopy', 'btnWdSubmit', 'btnWdCancel'];
  ids.forEach(id => {
    const el = $(id);
    if (el) console.log('✅ Found:', id);
    else console.log('❌ Missing:', id);
  });
}

// ===== INIT =====
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindButtons);
} else {
  bindButtons();
}

console.log('✅ All functions defined!');
