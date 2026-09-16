import random
import logging
import os
import threading
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

TOKEN = os.environ.get("TELEGRAM_TOKEN", "YOUR_TOKEN_HERE")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://example.com")

# ============ Shared game state ============
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
    """Call next number. Safe to call from any thread."""
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
        
        return {
            'num': num,
            'winners': winners,
            'done': not game['available'],
        }

# ============ Bot commands ============
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🎱 *Beteseb Bingo*\n\n"
        "📌 *ትዕዛዞች:*\n"
        "/newgame — አዲስ ጨዋታ ጀምር\n"
        "/join — ጨዋታውን ተቀላቀል\n"
        "/draw — ቁጥር ጥራ (በእጅ)\n"
        "/auto — ራስ-ሰር ጀምር/አቁም\n"
        "/status — የጨዋታ ሁኔታ\n"
        "/end — ጨዋታውን ጨርስ",
        parse_mode='Markdown'
    )

async def cmd_newgame(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    with games_lock:
        games[chat_id] = {
            'called': [],
            'available': list(range(1, 76)),
            'players': {},
            'winner': None,
            'auto': False,
            'last_call': 0,
        }
    await update.message.reply_text(
        "🎱 *አዲስ ጨዋታ ተጀመረ!*\n\n"
        "👇 /join በማለት ይቀላቀሉ\n"
        "🎫 እያንዳንዱ የራሱን ካርድ ያገኛል",
        parse_mode='Markdown'
    )

async def cmd_join(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    name = update.effective_user.first_name or "Player"
    
    with games_lock:
        if chat_id not in games:
            await update.message.reply_text("⚠️ ጨዋታ የለም። /newgame ተጠቀም።")
            return
        game = games[chat_id]
        
        if user_id in game['players']:
            url = f"{WEBAPP_URL}?chat={chat_id}&user={user_id}"
            keyboard = [[InlineKeyboardButton("🎮 ካርዴን ክፈት", web_app=WebAppInfo(url=url))]]
            await update.message.reply_text(
                f"⚠️ {name} አስቀድመህ ተቀላቅለሃል!",
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
            return
        
        card = generate_bingo_card()
        game['players'][user_id] = {
            'name': name,
            'card': card,
            'marked': {(2, 2)},
        }
        player_count = len(game['players'])
    
    url = f"{WEBAPP_URL}?chat={chat_id}&user={user_id}"
    keyboard = [[InlineKeyboardButton("🎮 ካርዴን ክፈት", web_app=WebAppInfo(url=url))]]
    await update.message.reply_text(
        f"✅ *{name}* ተቀላቅሏል!\n"
        f"👥 ተጫዋቾች: {player_count}\n\n"
        f"👇 ካርድህን ለመክፈት:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

async def cmd_draw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    result = _do_call(chat_id)
    if result is None:
        await update.message.reply_text("⚠️ ጨዋታ የለም። /newgame ተጠቀም።")
        return
    
    num = result['num']
    if num is None:
        await update.message.reply_text("🎉 ሁሉም ቁጥሮች ተጠርተዋል!")
        return
    
    with games_lock:
        game = games[chat_id]
        called_count = len(game['called'])
    
    text = f"🔢 *ቁጥር: {num}*  ({called_count}/75)"
    if result.get('winners'):
        text += f"\n\n🎉🎉 *BINGO!* 🎉🎉\n🏆 {', '.join(result['winners'])}"
    
    await update.message.reply_text(text, parse_mode='Markdown')

async def cmd_auto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    with games_lock:
        if chat_id not in games:
            await update.message.reply_text("⚠️ ጨዋታ የለም።")
            return
        game = games[chat_id]
        game['auto'] = not game['auto']
        game['last_call'] = 0
        status = "▶️ ተጀምሯል (በየ 5 ሰከንድ)" if game['auto'] else "⏸️ ቆሟል"
    
    await update.message.reply_text(f"🤖 ራስ-ሰር: {status}")

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    with games_lock:
        if chat_id not in games:
            await update.message.reply_text("⚠️ ጨዋታ የለም።")
            return
        game = games[chat_id]
        text = (
            f"📊 *የጨዋታ ሁኔታ*\n\n"
            f"👥 ተጫዋቾች: {len(game['players'])}\n"
            f"📢 የተጠሩ: {len(game['called'])}/75\n"
            f"🤖 ራስ-ሰር: {'✅' if game['auto'] else '❌'}\n"
            f"🎉 አሸናፊ: {', '.join(game['winner']) if game['winner'] else 'የለም'}"
        )
    await update.message.reply_text(text, parse_mode='Markdown')

async def cmd_end(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    with games_lock:
        if chat_id in games:
            del games[chat_id]
    await update.message.reply_text("🛑 ጨዋታው ተጠናቅቋል።")

def run_bot():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("newgame", cmd_newgame))
    app.add_handler(CommandHandler("join", cmd_join))
    app.add_handler(CommandHandler("draw", cmd_draw))
    app.add_handler(CommandHandler("auto", cmd_auto))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("end", cmd_end))
    print("🤖 Bot ተጀምሯል...")
    app.run_polling()
