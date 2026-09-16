import random
import logging
import os
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

TOKEN = os.environ.get("TELEGRAM_TOKEN", "YOUR_TOKEN_HERE")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://example.com")

# የጨዋታ ሁኔታ
games = {}

def generate_bingo_card():
    columns = {
        'B': random.sample(range(1, 16), 5),
        'I': random.sample(range(16, 31), 5),
        'N': random.sample(range(31, 46), 5),
        'G': random.sample(range(46, 61), 5),
        'O': random.sample(range(61, 76), 5),
    }
    card = []
    for row in range(5):
        card.append([
            columns['B'][row], columns['I'][row], columns['N'][row],
            columns['G'][row], columns['O'][row],
        ])
    card[2][2] = 'FREE'
    return card

def format_card(card, marked=None):
    if marked is None:
        marked = set()
    text = "🎱 **B I N G O ካርድ**\n"
    text += "┌────┬────┬────┬────┬────┐\n"
    for r, row in enumerate(card):
        line = "│"
        for c, num in enumerate(row):
            if num == 'FREE':
                line += " ⭐ │"
            elif (r, c) in marked:
                line += f"✅{num:2d}│"
            else:
                line += f" {num:2d} │"
        text += line + "\n"
        if r < 4:
            text += "├────┼────┼────┼────┼────┤\n"
    text += "└────┴────┴────┴────┴────┘\n"
    text += f"\n✅ ምልክት የተደረገ: {len(marked)}/24"
    return text

def check_bingo(card, marked):
    for r in range(5):
        if all((r, c) in marked or card[r][c] == 'FREE' for c in range(5)):
            return True
    for c in range(5):
        if all((r, c) in marked or card[r][c] == 'FREE' for r in range(5)):
            return True
    if all((i, i) in marked or card[i][i] == 'FREE' for i in range(5)):
        return True
    if all((i, 4-i) in marked or card[i][4-i] == 'FREE' for i in range(5)):
        return True
    return False

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    
    keyboard = [[
        InlineKeyboardButton(
            "🎮 ጨዋታ ክፈት",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    ]]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        f"👋 ሰላም {user.first_name}!\n\n"
        f"🎱 **Beteseb Bingo** እንኳን ደህና መጣህ!\n\n"
        f"📌 **ትዕዛዞች፦**\n"
        f"/play — የጨዋታ ካርድ ስጠኝ\n"
        f"/draw — ቀጣይ ቁጥር ጥራ\n"
        f"/card — የእኔን ካርድ አሳይ\n"
        f"/numbers — የተጠሩ ቁጥሮች ዝርዝር\n"
        f"/end — ጨዋታውን ጨርስ\n\n"
        f"👇 ወይም ድረ-ገጹን ክፈት፦",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

async def play(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    user_name = update.effective_user.first_name

    if chat_id not in games:
        games[chat_id] = {
            'players': {},
            'called': [],
            'available': list(range(1, 76)),
        }

    game = games[chat_id]

    if user_id in game['players']:
        p = game['players'][user_id]
        await update.message.reply_text(
            "⚠️ አስቀድመህ ካርድ አለህ!\n\n" +
            format_card(p['card'], p['marked']),
            parse_mode='Markdown'
        )
        return

    card = generate_bingo_card()
    game['players'][user_id] = {
        'name': user_name,
        'card': card,
        'marked': set(),
    }

    await update.message.reply_text(
        f"✅ **{user_name}** ተቀላቅሏል!\n\n" + format_card(card),
        parse_mode='Markdown'
    )

async def draw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if chat_id not in games or not games[chat_id]['players']:
        await update.message.reply_text("⚠️ ጨዋታ አልጀመረም። /play ተጠቀም።")
        return

    game = games[chat_id]
    if not game['available']:
        await update.message.reply_text("🎉 ሁሉም ቁጥሮች ተጠርተዋል!")
        return

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

    text = f"🔢 **ቁጥር ተጠራ: {num}**\n"
    text += f"📊 የጠራ ብዛት: {len(game['called'])}/75\n"

    if winners:
        text += f"\n🎉🎉 **BINGO!** 🎉🎉\n"
        text += f"🏆 አሸናፊ: {', '.join(winners)}\n"

    await update.message.reply_text(text, parse_mode='Markdown')

async def card(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_id = update.effective_user.id
    if chat_id not in games or user_id not in games[chat_id]['players']:
        await update.message.reply_text("⚠️ ካርድ የለህም። /play ተጠቀም።")
        return
    p = games[chat_id]['players'][user_id]
    await update.message.reply_text(
        format_card(p['card'], p['marked']),
        parse_mode='Markdown'
    )

async def numbers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if chat_id not in games or not games[chat_id]['called']:
        await update.message.reply_text("📭 እስካሁን ምንም ቁጥር አልተጠራም።")
        return
    called = games[chat_id]['called']
    text = f"📋 **የተጠሩ ቁጥሮች** ({len(called)}/75)\n\n"
    text += " • ".join(str(n) for n in sorted(called))
    await update.message.reply_text(text, parse_mode='Markdown')

async def end(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    if chat_id in games:
        del games[chat_id]
    await update.message.reply_text("🛑 ጨዋታው ተጠናቅቋል። /play በማለት አዲስ ጀምር።")

def run_bot():
    # አዲስ event loop ፍጠር (ለ thread ውስጥ አስፈላጊ!)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play))
    app.add_handler(CommandHandler("draw", draw))
    app.add_handler(CommandHandler("card", card))
    app.add_handler(CommandHandler("numbers", numbers))
    app.add_handler(CommandHandler("end", end))
    print("🤖 Bot ተጀምሯል...")
    app.run_polling()
