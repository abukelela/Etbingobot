import os
import time
import threading
from flask import Flask, render_template, jsonify, request
from bot import run_bot, games, games_lock, _do_call, check_bingo

app = Flask(__name__)

# ============ Routes ============
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/state')
def api_state():
    try:
        chat_id = int(request.args.get('chat', 0))
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid params'})
    
    with games_lock:
        if chat_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[chat_id]
        player = game['players'].get(user_id)
        
        return jsonify({
            'called': list(game['called']),
            'last': game['called'][-1] if game['called'] else None,
            'player_count': len(game['players']),
            'winner': game['winner'],
            'auto': game['auto'],
            'card': player['card'] if player else None,
            'marked': [list(m) for m in player['marked']] if player else [],
            'player_name': player['name'] if player else None,
            'called_count': len(game['called']),
        })

@app.route('/api/mark', methods=['POST'])
def api_mark():
    data = request.json or {}
    try:
        chat_id = int(data.get('chat', 0))
        user_id = int(data.get('user', 0))
        r = int(data.get('r', 0))
        c = int(data.get('c', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    
    with games_lock:
        if chat_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[chat_id]
        player = game['players'].get(user_id)
        if not player:
            return jsonify({'error': 'no_player'})
        
        if (r, c) == (2, 2):
            return jsonify({'error': 'free'})
        
        num = player['card'][r][c]
        if num not in game['called']:
            return jsonify({'error': 'not_called'})
        
        if (r, c) in player['marked']:
            player['marked'].discard((r, c))
        else:
            player['marked'].add((r, c))
        
        is_bingo = check_bingo(player['card'], player['marked'])
        if is_bingo and not game['winner']:
            game['winner'] = [player['name']]
        
        return jsonify({
            'marked': [list(m) for m in player['marked']],
            'winner': game['winner'],
            'is_bingo': is_bingo,
        })

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

# ============ Auto-caller background thread ============
def auto_caller_loop():
    while True:
        time.sleep(1)
        try:
            with games_lock:
                chat_ids = list(games.keys())
            
            for chat_id in chat_ids:
                with games_lock:
                    if chat_id not in games:
                        continue
                    game = games[chat_id]
                    if not game['auto']:
                        continue
                    if game['winner']:
                        game['auto'] = False
                        continue
                    if not game['available']:
                        game['auto'] = False
                        continue
                    
                    now = time.time()
                    if now - game.get('last_call', 0) < 5:
                        continue
                    game['last_call'] = now
                
                _do_call(chat_id)
        except Exception as e:
            print(f"Auto caller error: {e}")

# ============ Flask ============
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

if __name__ == '__main__':
    # Auto-caller በ background thread
    auto_thread = threading.Thread(target=auto_caller_loop, daemon=True)
    auto_thread.start()
    
    # Flask በ background thread
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    
    # Bot በ main thread
    run_bot()
