import os
import threading
from flask import Flask, render_template, jsonify
from bot import run_bot, generate_bingo_card

app = Flask(__name__)

# ==========================================
# Web Routes
# ==========================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/new_game', methods=['POST'])
def new_game():
    """አዲስ ጨዋታ ፍጠር"""
    return jsonify({
        'card': generate_bingo_card(),
        'status': 'ok'
    })

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

# ==========================================
# Main
# ==========================================
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

if __name__ == '__main__':
    # Bot በ background thread ላይ አስኪድ
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    
    # Flask በ main thread ላይ አስኪድ
    run_flask()
