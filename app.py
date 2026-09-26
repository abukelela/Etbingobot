import os
import time
import random
import threading
import asyncio
from flask import Flask, render_template, jsonify, request
from database import (
    init_db, get_or_create_user, get_user_balance,
    add_balance, get_user_transactions, get_leaderboard,
    create_deposit_request, get_user_deposits, get_pending_deposits,
    create_withdraw_request, get_user_withdraws, get_pending_withdraws
)

app = Flask(__name__)

# ============ Config ============
ROUND_DURATION = 300
BINGO_DELAY = 50
AUTO_CALL_INTERVAL = 5
CARD_PRICE = 10.0
WINNER_TAX = 0.15
HOUSE_FEE = 0.15
ADMIN_ID = int(os.environ.get("ADMIN_ID", "0"))

DEPOSIT_ACCOUNTS = {
    "telebirr": os.environ.get("DEPOSIT_TELEBIRR", ""),
    "cbe": os.environ.get("DEPOSIT_CBE", ""),
    "awaash": os.environ.get("DEPOSIT_AWAASH", ""),
}

# ============ Game State ============
games = {}
games_lock = threading.RLock()
_bot_loop = None

def get_bot_loop():
    return _bot_loop

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
                winners.append({'uid': uid, 'name': p['name']})
        if winners and not game['winner']:
            game['winner'] = winners
            game['winner_time'] = time.time()
            _payout_winners(room_id, winners)
        return {'num': num, 'winners': [w['name'] for w in winners], 'done': not game['available']}

def _payout_winners(room_id, winners):
    with games_lock:
        if room_id not in games:
            return
        game = games[room_id]
        pool = game.get('total_pool', 0)
        if pool <= 0 or not winners:
            return
        house_cut = pool * HOUSE_FEE
        prize_pool = pool - house_cut
        per_winner = prize_pool / len(winners)
        tax = per_winner * WINNER_TAX
        net_prize = per_winner - tax
        for w in winners:
            uid = w['uid']
            if uid in game['players']:
                game['players'][uid]['won'] = net_prize
        for w in winners:
            uid = w['uid']
            try:
                add_balance(uid, net_prize, tx_type="win",
                    description=f"BINGO win (tax {tax:.2f})")
            except Exception as e:
                print(f"payout error for {uid}: {e}")
        try:
            from database import get_session, User
            session = get_session()
            try:
                for w in winners:
                    user = session.query(User).filter_by(telegram_id=w['uid']).first()
                    if user:
                        user.games_won += 1
                session.commit()
            finally:
                session.close()
        except Exception as e:
            print(f"stats error: {e}")
        print(f"💰 Paid {per_winner:.2f} x {len(winners)} (tax {tax:.2f})")

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
        game['total_pool'] = 0
        valid_players = {}
        for uid, p in game['players'].items():
            if p.get('card'):
                p['marked'] = {(2, 2)}
                p['won'] = 0
                valid_players[uid] = p
        game['players'] = valid_players
        print(f"✅ Round {game['round_number']} — {len(valid_players)} ተጫዋቾች")

# ============ Routes ============
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
            'winner': [w['name'] for w in game['winner']] if game['winner'] else None,
            'auto': game['auto'],
            'card': player['card'] if player else None,
            'card_num': player.get('card_num', 0) if player else 0,
            'marked': [list(m) for m in player['marked']] if player else [],
            'player_name': player['name'] if player else None,
            'called_count': len(game['called']),
            'needs_join': player is None,
            'round_number': game.get('round_number', 1),
            'round_remaining': remaining,
            'total_pool': game.get('total_pool', 0),
            'card_price': CARD_PRICE,
        })

@app.route('/api/user/balance')
def api_balance():
    try:
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid'})
    if not user_id:
        return jsonify({'error': 'no_user'})
    balance = get_user_balance(user_id)
    return jsonify({'balance': balance})

@app.route('/api/user/register', methods=['POST'])
def api_register():
    data = request.json or {}
    try:
        user_id = int(data.get('user', 0))
        name = str(data.get('name', 'ተጫዋች'))[:30]
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    if not user_id:
        return jsonify({'error': 'no_user'})
    user = get_or_create_user(user_id, first_name=name)
    return jsonify({
        'ok': True,
        'balance': user.balance,
        'games_played': user.games_played,
        'games_won': user.games_won,
    })

@app.route('/api/user/transactions')
def api_transactions():
    try:
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid'})
    txs = get_user_transactions(user_id, limit=20)
    return jsonify({'transactions': txs})

@app.route('/api/user/test_balance', methods=['POST'])
def api_test_balance():
    data = request.json or {}
    try:
        user_id = int(data.get('user', 0))
        amount = float(data.get('amount', 1000.0))
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})
    if not user_id:
        return jsonify({'error': 'no_user'})
    if amount > 10000:
        return jsonify({'error': 'max_10000'})
    new_bal = add_balance(user_id, amount, tx_type="bonus",
        description=f"Test bonus {amount}")
    if new_bal is None:
        return jsonify({'error': 'failed'})
    return jsonify({'ok': True, 'balance': new_bal})

# ============ Deposit ============
@app.route('/api/deposit/accounts')
def api_deposit_accounts():
    accounts = {k: v for k, v in DEPOSIT_ACCOUNTS.items() if v}
    return jsonify({'accounts': accounts})

@app.route('/api/deposit/request', methods=['POST'])
def api_deposit_request():
    data = request.json or {}
    try:
        user_id = int(data.get('user', 0))
        amount = float(data.get('amount', 0))
        method = str(data.get('method', ''))[:30]
        reference = str(data.get('reference', ''))[:100]
        name = str(data.get('name', 'ተጫዋች'))[:30]
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})

    if not user_id or amount <= 0 or not method or not reference:
        return jsonify({'error': 'missing_fields'})
    if amount < 10:
        return jsonify({'error': 'min_10'})
    if amount > 50000:
        return jsonify({'error': 'max_50000'})

    req_id = create_deposit_request(user_id, name, amount, method, reference)
    if not req_id:
        return jsonify({'error': 'failed'})

    try:
        from bot import notify_admin_deposit
        loop = get_bot_loop()
        if loop:
            asyncio.run_coroutine_threadsafe(notify_admin_deposit(req_id), loop)
    except Exception as e:
        print(f"notify err: {e}")

    return jsonify({'ok': True, 'request_id': req_id})

@app.route('/api/deposit/my')
def api_my_deposits():
    try:
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid'})
    return jsonify({'deposits': get_user_deposits(user_id, 10)})

# ============ Withdraw ============
@app.route('/api/withdraw/request', methods=['POST'])
def api_withdraw_request():
    data = request.json or {}
    try:
        user_id = int(data.get('user', 0))
        amount = float(data.get('amount', 0))
        method = str(data.get('method', ''))[:30]
        account = str(data.get('account', ''))[:100]
        name = str(data.get('name', 'ተጫዋች'))[:30]
    except (ValueError, TypeError):
        return jsonify({'error': 'invalid'})

    if not user_id or amount <= 0 or not method or not account:
        return jsonify({'error': 'missing_fields'})
    if amount < 50:
        return jsonify({'error': 'min_50'})
    if amount > 10000:
        return jsonify({'error': 'max_10000'})

    balance = get_user_balance(user_id)
    if balance < amount:
        return jsonify({'error': 'insufficient_balance', 'balance': balance})

    req_id, err = create_withdraw_request(user_id, name, amount, method, account)
    if err:
        return jsonify({'error': err})

    try:
        from bot import notify_admin_withdraw
        loop = get_bot_loop()
        if loop:
            asyncio.run_coroutine_threadsafe(notify_admin_withdraw(req_id), loop)
    except Exception as e:
        print(f"notify err: {e}")

    return jsonify({'ok': True, 'request_id': req_id})

@app.route('/api/withdraw/my')
def api_my_withdraws():
    try:
        user_id = int(request.args.get('user', 0))
    except ValueError:
        return jsonify({'error': 'invalid'})
    return jsonify({'withdraws': get_user_withdraws(user_id, 10)})

# ============ Leaderboard ============
@app.route('/api/leaderboard')
def api_leaderboard():
    return jsonify({'leaders': get_leaderboard(10)})

# ============ Game endpoints ============
@app.route('/api/newgame', methods=['POST'])
def api_newgame():
    data = request.json or {}
    room_id = str(data.get('chat', ''))
    if not room_id:
        return jsonify({'error': 'invalid'})
    with games_lock:
        games[room_id] = {
            'called': [], 'available': list(range(1, 76)),
            'players': {}, 'winner': None, 'winner_time': 0,
            'auto': False, 'last_call': 0,
            'round_number': 1, 'round_start': time.time(), 'total_pool': 0,
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
    if not room_id or not user_id:
        return jsonify({'error': 'invalid'})

    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
        if user_id in game['players']:
            return jsonify({'ok': True, 'already': True})

    balance = get_user_balance(user_id)
    if balance < CARD_PRICE:
        return jsonify({
            'error': 'insufficient_balance',
            'balance': balance, 'needed': CARD_PRICE
        })

    new_bal = add_balance(user_id, -CARD_PRICE, tx_type="bet",
        description=f"Card purchase (#{card_num})")
    if new_bal is None:
        return jsonify({'error': 'payment_failed'})

    if 1 <= card_num <= 144:
        card = generate_seeded_card(card_num)
    else:
        card = generate_bingo_card()
        card_num = 0

    with games_lock:
        if room_id not in games:
            return jsonify({'error': 'no_game'})
        game = games[room_id]
        game['players'][user_id] = {
            'name': name, 'card': card, 'card_num': card_num,
            'marked': {(2, 2)}, 'won': 0,
        }
        game['total_pool'] = game.get('total_pool', 0) + CARD_PRICE
        is_first = len(game['players']) == 1
        is_auto = game.get('auto')

    if is_first and not is_auto:
        _reset_round(room_id)

    try:
        from database import get_session, User
        session = get_session()
        try:
            user = session.query(User).filter_by(telegram_id=user_id).first()
            if user:
                user.games_played += 1
                session.commit()
        finally:
            session.close()
    except Exception as e:
        print(f"stats error: {e}")

    return jsonify({'ok': True, 'card_num': card_num, 'balance': new_bal})

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
            game['winner'] = [{'uid': user_id, 'name': player['name']}]
            game['winner_time'] = time.time()
            _payout_winners(room_id, game['winner'])
        return jsonify({
            'marked': [list(m) for m in player['marked']],
            'winner': [w['name'] for w in game['winner']] if game['winner'] else None,
            'is_bingo': is_bingo,
        })

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

# ============ Auto-caller ============
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
                        wt = game.get('winner_time', 0)
                        if wt and now - wt >= BINGO_DELAY:
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

# ============ Flask ============
def run_flask():
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

if __name__ == '__main__':
    try:
        init_db()
    except Exception as e:
        print(f"⚠️ init_db error: {e}")

    auto_thread = threading.Thread(target=auto_caller_loop, daemon=True)
    auto_thread.start()

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    from bot import run_bot
    _bot_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_bot_loop)
    run_bot()
