let board = [];
let marked = [];
let calledNumbers = [];
let availableNumbers = [];
let gameOver = false;

function initGame() {
  const nums = new Set();
  while (nums.size < 25) {
    nums.add(Math.floor(Math.random() * 75) + 1);
  }
  board = [...nums];
  marked = Array(25).fill(false);
  marked[12] = true;

  availableNumbers = [];
  for (let i = 1; i <= 75; i++) availableNumbers.push(i);
  calledNumbers = [];
  gameOver = false;

  document.getElementById('lastCalled').textContent = '—';
  document.getElementById('status').textContent = '';
  document.getElementById('status').classList.remove('bingo');
  document.getElementById('callBtn').disabled = false;
  document.getElementById('history').innerHTML = '';
  document.getElementById('confetti').innerHTML = '';

  renderBoard();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  // B I N G O ራስጌ
  const headers = ['B', 'I', 'N', 'G', 'O'];
  headers.forEach(letter => {
    const header = document.createElement('div');
    header.className = 'header';
    header.textContent = letter;
    boardEl.appendChild(header);
  });

  // ካርድ
  board.forEach((num, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (i === 12) {
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
  if (i === 12 || gameOver) return;
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
  }
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
