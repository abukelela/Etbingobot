let board = [];
let marked = [];
let calledNumbers = [];
let availableNumbers = [];

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

  document.getElementById('lastCalled').textContent = '—';
  document.getElementById('status').textContent = '';
  document.getElementById('callBtn').disabled = false;
  document.getElementById('history').innerHTML = '';

  renderBoard();
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
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
  if (i === 12) return;
  if (!calledNumbers.includes(num) && !marked[i]) {
    alert('ይህ ቁጥር ገና አልተጠራም!');
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

  document.getElementById('lastCalled').textContent = num;

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
      document.getElementById('status').textContent = '🎉 BINGO! አሸንፈሃል!';
      return;
    }
  }
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
