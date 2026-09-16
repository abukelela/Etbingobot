let cards = [];
let numPlayers = 1;
let calledNumbers = [];
let availableNumbers = [];
let gameOver = false;
let autoRunning = false;
let countdownTimer = null;
let countdown = 5;

const MAX_PLAYERS = 13;
const RANGES = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
};

// ካርድ ከ cardNum ፍጠር (seeded)
function generateCard(cardNum) {
  let seed = cardNum * 9301 + 49297;
  function rand() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  function sample(min, max, count) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    const out = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(rand() * pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }
  const cols = {
    B: sample(RANGES.B[0], RANGES.B[1], 5),
    I: sample(RANGES.I[0], RANGES.I[1], 5),
    N: sample(RANGES.N[0], RANGES.N[1], 5),
    G: sample(RANGES.G[0], RANGES.G[1], 5),
    O: sample(RANGES.O[0], RANGES.O[1], 5),
  };
  const card = [];
  for (let r = 0; r < 5; r++) {
    card.push([cols.B[r], cols.I[r], cols.N[r], cols.G[r], cols.O[r]]);
  }
  card[2][2] = 'FREE';
  return card.flat();
}

function initPlayers() {
  const container = document.getElementById('playersButtons');
  container.innerHTML = '';
  for (let i = 1; i <= MAX_PLAYERS; i++) {
    const btn = document.createElement('button');
    btn.className = 'p-btn';
    btn.dataset.p = i;
    btn.textContent = i;
    btn.onclick = () => setPlayers(i);
    container.appendChild(btn);
  }
}

function initGame() {
  cards = [];
  const usedNums = new Set();
  for (let i = 0; i < numPlayers; i++) {
    let num;
    do {
      num = Math.floor(Math.random() * 144) + 1;
    } while (usedNums.has(num));
    usedNums.add(num);

    const card = {
      num: num,
      board: generateCard(num),
      marked: new Array(25).fill(false),
    };
    card.marked[12] = true;
    cards.push(card);
  }

  availableNumbers = [];
  for (let i = 1; i <= 75; i++) availableNumbers.push(i);
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
  updateCalledCount();

  updatePlayerButtons();
  renderAllBoards();
}

function setPlayers(n) {
  numPlayers = n;
  initGame();
}

function updatePlayerButtons() {
  document.querySelectorAll('.p-btn').forEach(btn => {
    const p = parseInt(btn.dataset.p);
    if (p === numPlayers) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function updateCalledCount() {
  document.getElementById('calledCount').textContent = calledNumbers.length + '/75';
}

function renderAllBoards() {
  const boardsEl = document.getElementById('boards');
  boardsEl.innerHTML = '';
  boardsEl.className = 'boards p' + numPlayers;

  cards.forEach((card, cardIdx) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';
    wrapper.id = 'card-' + cardIdx;

    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = '👤 ተ' + (cardIdx + 1) + ' #' + card.num;
    wrapper.appendChild(label);

    const board = document.createElement('div');
    board.className = 'board';

    const headers = ['B', 'I', 'N', 'G', 'O'];
    headers.forEach(letter => {
      const h = document.createElement('div');
      h.className = 'header';
      h.textContent = letter;
      board.appendChild(h);
    });

    card.board.forEach((num, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (i === 12 || num === 'FREE') {
        cell.textContent = '★';
        cell.classList.add('free');
      } else {
        cell.textContent = num;
      }
      if (card.marked[i]) cell.classList.add('marked');
      cell.onclick = () => toggleCell(cardIdx, i, num);
      board.appendChild(cell);
    });

    wrapper.appendChild(board);
    boardsEl.appendChild(wrapper);
  });
}

function toggleCell(cardIdx, cellIdx, num) {
  if (cellIdx === 12 || num === 'FREE' || gameOver) return;
  const card = cards[cardIdx];
  if (!calledNumbers.includes(num) && !card.marked[cellIdx]) {
    showAlert('⚠️ ይህ ቁጥር ገና አልተጠራም!');
    return;
  }
  card.marked[cellIdx] = !card.marked[cellIdx];
  renderAllBoards();
  checkAllBingos();
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
  updateCalledCount();

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
    document.getElementById('timer').textContent = '⏱️ ቀጣይ በ ' + countdown + ' ሰከንድ';
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
    document.getElementById('autoText').textContent = 'ራስ-ሰር';
  }
  const timerEl = document.getElementById('timer');
  if (timerEl) timerEl.textContent = '';
}

function checkBingoForCard(card) {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0,1,2,3,4].map(c => r*5 + c));
  for (let c = 0; c < 5; c++) lines.push([0,1,2,3,4].map(r => r*5 + c));
  lines.push([0,6,12,18,24]);
  lines.push([4,8,12,16,20]);

  for (const line of lines) {
    if (line.every(i => card.marked[i])) return line;
  }
  return null;
}

function checkAllBingos() {
  const winners = [];
  cards.forEach((card, idx) => {
    const line = checkBingoForCard(card);
    if (line) winners.push({ idx, line });
  });

  if (winners.length > 0) {
    gameOver = true;
    stopAuto();

    const statusEl = document.getElementById('status');
    if (winners.length === 1) {
      statusEl.textContent = '🎉 ተጫዋች ' + (winners[0].idx + 1) + ' BINGO!';
    } else {
      const names = winners.map(w => 'ተ' + (w.idx + 1)).join(', ');
      statusEl.textContent = '🎉 BINGO! ' + names;
    }
    statusEl.classList.add('bingo');

    winners.forEach(w => {
      const wrapper = document.getElementById('card-' + w.idx);
      if (wrapper) wrapper.classList.add('winner');
      highlightWinningLine(w.idx, w.line);
    });

    launchConfetti();
  }
}

function highlightWinningLine(cardIdx, line) {
  const wrapper = document.getElementById('card-' + cardIdx);
  if (!wrapper) return;
  const cells = wrapper.querySelectorAll('.cell');
  line.forEach(i => {
    if (cells[i]) cells[i].classList.add('winning');
  });
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

  for (let i = 1; i <= 75; i++) {
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

initPlayers();
initGame();
