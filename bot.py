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

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    
    # በግል ቻት — user_id እንጠቀም፤ በቡድን — chat_id
    is_private = update.effective_chat.type == 'private'
    room_id = f"u{user_id}" if is_private else f"c{chat_id}"
    
    url = f"{WEBAPP_URL}?room={room_id}"
    keyboard = [[InlineKeyboardButton("🎮 ጨዋታ ክፈት", web_app=WebAppInfo(url=url))]]
    await update.message.reply_text(
        "🎱 *Etbingo*\n\n👇 ጨዋታውን ለመክፈት:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

async def cmd_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    chat_id = update.effective_chat.id
    is_private = update.effective_chat.type == 'private'
    room_id = f"u{user_id}" if is_private else f"c{chat_id}"
    
    url = f"{WEBAPP_URL}?room={room_id}"
    keyboard = [[InlineKeyboardButton("🎮 ጨዋታ ክፈት", web_app=WebAppInfo(url=url))]]
    await update.message.reply_text(
        "🎱 Etbingo ጨዋታውን ለመክፈት:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

def run_bot():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("game", cmd_game))
    print("🤖 Bot ተጀምሯል...")
    app.run_polling(close_loop=False)
