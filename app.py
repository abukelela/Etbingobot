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
BINGO_DELAY = 60
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
def api_register
