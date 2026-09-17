import os
import time
import random
import threading
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

games = {}
games_lock = threading.Lock()

def generate_bingo_card():
    cols = {
        'B': random.sample(range(1, 16), 5),
        'I': random.sample(range(16, 31), 5),
        'N': random.sample(range(31, 46), 5),
        'G': random.sample(range(46, 61), 5),
        'O': random.sample(range(61, 76), 5),
    }
    card = []
    for r in range(5):
        card.append([cols['B'][r], cols['I'][r], cols['N'][r], cols['G'][r], cols['O'][r]])
    card[2][2] = 'FREE'
    return card

def generate_seeded_card(card_num):
    seed = card_num * 9301 + 49297
    def rand():
        nonlocal seed
        seed = (seed * 9301 + 49297) % 233280
        return seed / 233280

    def sample(min_val, max_val, count):
        pool = list(range(min_val, max_val + 1))
        out = []
        for _ in range(count):
            idx = int(rand() * len(pool))
            out.append(pool.pop(idx))
        return out

    cols = {
        'B': sample(1, 15, 5),
        'I': sample(16, 30, 5),
        'N': sample(31, 45, 5),
        'G': sample(46, 60, 5),
        'O': sample(61, 75, 5),
    }
    card = []
    for r in range(5):
        card.append([cols['B'][r], cols['I'][r], cols['N'][r], cols['G'][r], cols['O'][r]])
    card[2][2] = 'FREE'
    return card

def check_bingo(card, marked_set):
    for r in range(5):
        if all((r, c) in marked_set or card[r][c] == 'FREE' for c in range(5)):
            return True
    for c in range(5):
        if all((r, c) in marked_set or card[r][c] == 'FREE' for r in range(5)):
            return True
    if all((i, i) in marked_set or card[i][i] == 'FREE' for i in range(5)):
        return True
    if all((i, 4-i) in marked_set or card[i][4-i] == 'FREE' for i in range(5)):
        return True
    return False

def _do_call(chat_id):
    with games_lock:
        if chat_id not in games:
            return None
        game = games[chat_id]
        if not game['available']:
            return {'num': None, 'done': True}
        num = random.choice(game['available'])
        game['available'].remove(num)
        game['called'].append(num)
        winners = []
        for uid, p in game['players'].items():
            for r in range(5):
                for c in range(5):
                    if p['card'][r][c] == num:
                        p['marked'].add((r, c))
            if check_bingo(p['card'], p['marked']):
                winners.append(p['name'])
        if winners and not game['winner']:
            game['winner'] = winners
        return {'num': num, 'winners': winners, 'done': not game['available']}

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
            'card_num': player.get('card_num', 0) if player else 0,
            'marked': [list(m) for m in player['marked']] if player else [],
            'player_name': player['name'] if player else None,
            'called_count': len(game['called']),
            'needs_join': player is None,
        })

@app.route('/api/newgame', methods=['POST'])
def api_newgame():
    data = request.json or {}
    try:
        chat_id = int(data.get('chat', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    with games_lock:
        games[chat_id] = {
            'called': [], 'available': list(range(1, 76)),
            'players': {}, 'winner': None, 'auto': False, 'last_call': 0,
        }
    return jsonify({'ok': True})

@app.route('/api/join', methods=['POST'])
def api_join():
    data = request.json or {}
    try:
        chat_id = int(data.get('chat', 0))
        user_id = int(data.get('user', 0))
        name = str(data.get('name', 'ተጫዋች'))[:30]
        card_num = int(data.get('card_num', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    with games_lock:
        if chat_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[chat_id]
        if user_id in game['players']:
            return jsonify({'ok': True, 'already': True})
        if 1 <= card_num <= 144:
            card = generate_seeded_card(card_num)
        else:
            card = generate_bingo_card()
            card_num = 0
        game['players'][user_id] = {
            'name': name, 'card': card, 'card_num': card_num, 'marked': {(2, 2)},
        }
    return jsonify({'ok': True, 'card_num': card_num})

@app.route('/api/draw', methods=['POST'])
def api_draw():
    data = request.json or {}
    try:
        chat_id = int(data.get('chat', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    result = _do_call(chat_id)
    if result is None:
        return jsonify({'error': 'no_game'})
    return jsonify(result)

@app.route('/api/toggle_auto', methods=['POST'])
def api_toggle_auto():
    data = request.json or {}
    try:
        chat_id = int(data.get('chat', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    with games_lock:
        if chat_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[chat_id]
        game['auto'] = not game['auto']
        game['last_call'] = 0
        return jsonify({'auto': game['auto']})

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

def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

if __name__ == '__main__':
    auto_thread = threading.Thread(target=auto_caller_loop, daemon=True)
    auto_thread.start()
    run_flask()
