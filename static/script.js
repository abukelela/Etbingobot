console.log('✅ script.js ተጭኗል!');

function testClick() {
  alert('🎉 JavaScript ይሰራል!\n\nButton በትክክል ተጭኗል!');
  document.getElementById('result').textContent = '✅ JavaScript ይሰራል!';
}

async function testAPI() {
  var result = document.getElementById('result');
  result.textContent = '⏳ API በመፈተን ላይ...';
  
  try {
    var r = await fetch('/api/deposit/accounts');
    var data = await r.json();
    result.textContent = '✅ API ይሰራል!\n\n' + JSON.stringify(data);
    alert('✅ API ይሰራል!\n\n' + JSON.stringify(data));
  } catch (e) {
    result.textContent = '❌ API ስህተት: ' + e.message;
    alert('❌ API ስህተት:\n\n' + e.message);
  }
}

// Telegram init
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
  console.log('✅ Telegram WebApp ተጀምሯል!');
  console.log('User:', JSON.stringify(window.Telegram.WebApp.initDataUnsafe));
}
