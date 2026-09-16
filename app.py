import os
import threading
from flask import Flask, render_template, jsonify
from bot import run_bot

app = Flask(__name__)

# ==========================================
# Web Routes
# ==========================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

# ==========================================
# Flask Server
# ==========================================
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

# ==========================================
# Main
# ==========================================
if __name__ == '__main__':
    # Flask በ background thread ላይ
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Bot በ main thread ላይ (ትክክለኛው!)
    run_bot()
