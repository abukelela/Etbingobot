import os
import time
import random
import threading
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

ROUND_DURATION = 300
BINGO_DELAY = 60
AUTO_CALL_INTERVAL = 5

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

def _do_call(room_id):
    with games_lock:
        if room_id not in games:
            return None
        game = games[room_id]
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
            game['winner_time'] = time.time()
        return {'num': num, 'winners': winners, 'done': not game['available']}

def _reset_round(room_id):
    with games_lock:
        if room_id not in games:
            return
        game = games[room_id]
        game['called'] = []
        game['available'] = list(range(1, 76))
        game['winner'] = None
        game['winner_time'] = 0
        game['round_number'] = game.get('round_number', 0) + 1
        game['round_start'] = time.time()
        game['auto'] = True
        game['last_call'] = 0
        valid_players = {}
        for uid, p in game['players'].items():
            if p.get('card'):
                p['marked'] = {(2, 2)}
                valid_players[uid] = p
        game['players'] = valid_players
        print(f"✅ Round {game['round_number']} — {len(valid_players)} ተጫዋቾች")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/state')
def api_state():
    try:
        room_id = str(request.args.get('chat', ''))
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid params'})
    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
        player = game['players'].get(user_id)
        now = time.time()
        if game.get('winner'):
            elapsed = now - game.get('winner_time', now)
            remaining = max(0, int(BINGO_DELAY - elapsed))
        else:
            elapsed = now - game.get('round_start', now)
            remaining = max(0, int(ROUND_DURATION - elapsed))
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
            'round_number': game.get('round_number', 1),
            'round_remaining': remaining,
        })

@app.route('/api/newgame', methods=['POST'])
def api_newgame():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    if not room_id:
        return jsonify({'error': 'invalid'})
    with games_lock:
        games[room_id] = {
            'called': [],
            'available': list(range(1, 76)),
            'players': {},
            'winner': None,
            'winner_time': 0,
            'auto': False,
            'last_call': 0,
            'round_number': 1,
            'round_start': time.time(),
        }
    return jsonify({'ok': True})

@app.route('/api/join', methods=['POST'])
def api_join():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    try:
        user_id = int(data.get('user', 0))
        name = str(data.get('name', 'ተጫዋች'))[:30]
        card_num = int(data.get('card_num', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    if not room_id:
        return jsonify({'error': 'invalid'})
    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
        if user_id in game['players']:
            return jsonify({'ok': True, 'already': True})
        if 1 <= card_num <= 144:
            card = generate_seeded_card(card_num)
        else:
            card = generate_bingo_card()
            card_num = 0
        game['players'][user_id] = {
            'name': name,
            'card': card,
            'card_num': card_num,
            'marked': {(2, 2)},
        }
        if len(game['players']) == 1 and not game.get('auto'):
            _reset_round(room_id)
    return jsonify({'ok': True, 'card_num': card_num})

@app.route('/api/draw', methods=['POST'])
def api_draw():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    result = _do_call(room_id)
    if result is None:
        return jsonify({'error': 'no_game'})
    return jsonify(result)

@app.route('/api/toggle_auto', methods=['POST'])
def api_toggle_auto():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
        game['auto'] = not game['auto']
        game['last_call'] = 0
        return jsonify({'auto': game['auto']})

@app.route('/api/mark', methods=['POST'])
def api_mark():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    try:
        user_id = int(data.get('user', 0))
        r = int(data.get('r', 0))
        c = int(data.get('c', 0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
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
            game['winner_time'] = time.time()
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
                room_ids = list(games.keys())
            for room_id in room_ids:
                round_reset = False
                with games_lock:
                    if room_id not in games:
                        continue
                    game = games[room_id]
                    if len(game['players']) == 0:
                        continue
                    now = time.time()
                    if game.get('winner'):
                        winner_time = game.get('winner_time', 0)
                        if winner_time and now - winner_time >= BINGO_DELAY:
                            round_reset = True
                    else:
                        elapsed = now - game.get('round_start', now)
                        if elapsed >= ROUND_DURATION:
                            round_reset = True
                if round_reset:
                    _reset_round(room_id)
                    continue
                do_call = False
                with games_lock:
                    if room_id not in games:
                        continue
                    game = games[room_id]
                    if not game['auto']:
                        continue
                    if not game['available']:
                        game['auto'] = False
                        continue
                    if game.get('winner'):
                        continue
                    now = time.time()
                    if now - game.get('last_call', 0) < AUTO_CALL_INTERVAL:
                        continue
                    game['last_call'] = now
                    do_call = True
                if do_call:
                    _do_call(room_id)
        except Exception as e:
            print(f"Auto caller error: {e}")

def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

if __name__ == '__main__':
    auto_thread = threading.Thread(target=auto_caller_loop, daemon=True)
    auto_thread.start()
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    from bot import run_bot
    run_bot()
