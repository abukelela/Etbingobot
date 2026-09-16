let board = [];
let marked = [];
let calledNumbers = [];
let availableNumbers = [];
let gameOver = false;
let autoRunning = false;
let countdownTimer = null;
let countdown = 5;
let selectedCardNum = null;

const MAX_CARD = 144;

// ከካርድ ቁጥር የተወሰነ ካርድ ይፍጠራል
function generateCardFromNumber(cardNum) {
  // Seeded random
  let seed = cardNum * 9301 + 49297;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }

  function sampleRange(min, max, count) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    const result = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  const cols = {
    B: sampleRange(1, 29, 5),
    I: sampleRange(30, 58, 5),
    N: sampleRange(59, 87, 5),
    G: sampleRange(88, 116, 5),
    O: sampleRange(117, 144, 5),
  };

  const card = [];
  for (let r = 0; r < 5; r++) {
    card.push([cols.B[r], cols.I[r], cols.N[r], cols.G[r], cols.O[r]]);
  }
  card[2][2] = 'FREE';
  return card.flat();
}

function openPicker() {
  renderPicker();
  document.getElementById('pickerModal').classList.add('open');
}

function closePicker(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) {
    return;
  }
  document.getElementById('pickerModal').classList.remove('open');
}

function renderPicker() {
  const grid = document.getElementById('pickerGrid');
  grid.innerHTML = '';
  for (let i = 1; i <= MAX_CARD; i++) {
    const cell = document.createElement('div');
    cell.className = 'picker-cell';
    cell.textContent = i;
    if (i === selectedCardNum) cell.classList.add('selected');
    cell.onclick = () => pickCard(i);
    grid.appendChild(cell);
  }
}

function pickCard(cardNum) {
  selectedCardNum = cardNum;

  // ካርዱን ፍጠር
  board = generateCardFromNumber(cardNum);
  marked = new Array(25).fill(false);
  marked[12] = true;

  closePicker();
  resetGameState();
  renderBoard();

  // ርዕስ አሳይ
  document.getElementById('cardInfo').textContent = '🎫 ካርድ ቁጥር: ' + cardNum;
}

function randomCard() {
  const num = Math.floor(Math.random() * MAX_CARD) + 1;
  pickCard(num);
}

function resetGameState() {
  availableNumbers = [];
  for (let i = 1; i <= 144; i++) availableNumbers.push(i);
  calledNumbers = [];
  gameOver = false;
  stopAuto();

  document.getElementById('lastCalled').textContent = '';
  document.getElementById('status').textContent = '';
  document.getElementById('status').classList.remove('bingo');
  document.getElementById('callBtn').disabled = false;
  document.getElementById('history').innerHTML = '';
  document.getElementById('confetti').innerHTML = '';
  document.getElementById('timer').textContent = '';
}

function initGame() {
  // መጀመሪያ በዘፈቀደ ካርድ
  const num = Math.floor(Math.random() * MAX_CARD) + 1;
  pickCard(num);
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const headers = ['B', 'I', 'N', 'G', 'O'];
  headers.forEach(letter => {
    const header = document.createElement('div');
    header.className = 'header';
    header.textContent = letter;
    boardEl.appendChild(header);
  });

  board.forEach((num, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (i === 12 || num === 'FREE') {
      cell.textContent = 'FREE';
      cell.classList.add('free');
    } else {
      cell.textContent = num;
    }
    if (marked[i]) cell.classList.add('marked');
    cell.onclick = () => toggleCell(i, num);
    boardEl.appendChild(cell);
  });
}

function toggleCell(i, num) {
  if (i === 12 || num === 'FREE' || gameOver) return;
  if (!calledNumbers.includes(num) && !marked[i]) {
    showAlert('⚠️ ይህ ቁጥር ገና አልተጠራም!');
    return;
  }
  marked[i] = !marked[i];
  renderBoard();
  checkBingo();
}

function callNumber() {
  if (availableNumbers.length === 0) {
    document.getElementById('status').textContent = 'ሁሉም ቁጥሮች ተጠርተዋል!';
    stopAuto();
    return;
  }
  const idx = Math.floor(Math.random() * availableNumbers.length);
  const num = availableNumbers.splice(idx, 1)[0];
  calledNumbers.push(num);

  const el = document.getElementById('lastCalled');
  el.textContent = num;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');

  const hist = document.getElementById('history');
  const span = document.createElement('span');
  span.textContent = num;
  hist.appendChild(span);
  hist.scrollTop = hist.scrollHeight;

  if (availableNumbers.length === 0) {
    document.getElementById('callBtn').disabled = true;
    stopAuto();
  }
}

function toggleAuto() {
  if (autoRunning) stopAuto();
  else startAuto();
}

function startAuto() {
  if (availableNumbers.length === 0 || gameOver) return;
  autoRunning = true;
  const btn = document.getElementById('autoBtn');
  btn.classList.add('running');
  document.getElementById('autoIcon').textContent = '⏸️';
  document.getElementById('autoText').textContent = 'አቁም';
  countdown = 5;
  updateTimerDisplay();
  callNumber();
  scheduleNext();
}

function scheduleNext() {
  countdown = 5;
  updateTimerDisplay();
  countdownTimer = setInterval(() => {
    countdown--;
    updateTimerDisplay();
    if (countdown <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      if (autoRunning) {
        callNumber();
        if (autoRunning && availableNumbers.length > 0 && !gameOver) {
          scheduleNext();
        } else {
          stopAuto();
        }
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  if (autoRunning && countdown > 0) {
    document.getElementById('timer').textContent = '⏱️ ቀጣይ ቁጥር በ ' + countdown + ' ሰከንድ';
  } else {
    document.getElementById('timer').textContent = '';
  }
}

function stopAuto() {
  autoRunning = false;
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  const btn = document.getElementById('autoBtn');
  if (btn) {
    btn.classList.remove('running');
    document.getElementById('autoIcon').textContent = '▶️';
    document.getElementById('autoText').textContent = 'ራስ-ሰር ጀምር';
  }
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = '';
}

function checkBingo() {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0,1,2,3,4].map(c => r*5 + c));
  for (let c = 0; c < 5; c++) lines.push([0,1,2,3,4].map(r => r*5 + c));
  lines.push([0,6,12,18,24]);
  lines.push([4,8,12,16,20]);

  for (const line of lines) {
    if (line.every(i => marked[i])) {
      gameOver = true;
      stopAuto();
      const statusEl = document.getElementById('status');
      statusEl.textContent = '🎉 BINGO! አሸንፈሃል!';
      statusEl.classList.add('bingo');
      highlightWinningLine(line);
      launchConfetti();
      return;
    }
  }
}

function highlightWinningLine(line) {
  const cells = document.querySelectorAll('.cell');
  line.forEach(i => {
    if (cells[i]) cells[i].classList.add('winning');
  });
}

function launchConfetti() {
  const colors = ['#ffd700', '#ff6b6b', '#4ecdc4', '#95e1d3', '#f38181', '#aa96da'];
  const container = document.getElementById('confetti');
  for (let i = 0; i < 120; i++) {
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

function showAlert(msg) {
  const statusEl = document.getElementById('status');
  const original = statusEl.textContent;
  statusEl.textContent = msg;
  setTimeout(() => { statusEl.textContent = original; }, 1500);
}

function openBoard() {
  const modal = document.getElementById('boardModal');
  const grid = document.getElementById('boardGrid');
  const stats = document.getElementById('modalStats');

  grid.innerHTML = '';

  stats.innerHTML = `
    <div>📢 የተጠሩ: <span>${calledNumbers.length}</span></div>
    <div>⏳ የቀሩ: <span>${availableNumbers.length}</span></div>
  `;

  const lastCalled = calledNumbers.length > 0 ? calledNumbers[calledNumbers.length - 1] : null;

  for (let i = 1; i <= 144; i++) {
    const cell = document.createElement('div');
    cell.className = 'num-cell';
    cell.textContent = i;

    if (calledNumbers.includes(i)) {
      cell.classList.add('called');
      if (i === lastCalled) cell.classList.add('latest');
    }

    grid.appendChild(cell);
  }

  modal.classList.add('open');
}

function closeBoard(event) {
  if (event && event.target !== event.currentTarget && !event.target.classList.contains('modal-close')) {
    return;
  }
  document.getElementById('boardModal').classList.remove('open');
}

function newGame() {
  if (confirm('አዲስ ጨዋታ ጀምር?')) {
    initGame();
  }
}

// Telegram Web App
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

initGame();
