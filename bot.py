import logging
import os
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, MenuButtonWebApp, WebAppInfo
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, ContextTypes
)
from database import get_pending_deposits  # የአንተ ዳታቤዝ ፋይል መሆኑን አረጋግጥ

# --- ማዋቀሪያ (Configuration) ---
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

TOKEN = os.environ.get("TELEGRAM_TOKEN", "YOUR_TOKEN_HERE")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://etbingobot-production.up.railway.app")
ADMIN_ID = int(os.environ.get("ADMIN_ID", "0"))

# --- የ Menu Button ማዋቀሪያ ተግባር ---
async def post_init(application: Application) -> None:
    """ቦቱ ሲጀመር የወርድ ላይ ቁልፍን (Mini App) ያዘጋጃል"""
    await application.bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Open Afbingobot",
            web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    logging.info("Menu button set successfully!")

# --- የ /start ትዕዛዝ ---
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    url = f"{WEBAPP_URL}?room={chat_id}"
    
    keyboard = [[
        InlineKeyboardButton("🎮 ጨዋታ ጀምር", web_app=WebAppInfo(url=url))
    ]]
    
    await update.message.reply_text(
        "🎱 *Etbingo*\n\n👇 ሚኒ አፕ ለመክፈት ከታች ያለውን ቁልፍ ተጭን:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

# --- የ /game ትዕዛዝ ---
async def cmd_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    url = f"{WEBAPP_URL}?room={chat_id}"
    
    keyboard = [[
        InlineKeyboardButton("🎮 ጨዋታ ጀምር", web_app=WebAppInfo(url=url))
    ]]
    
    await update.message.reply_text(
        "🎱 Etbingo ጨዋታ ለመጀመር ከታች ያለውን ቁልፍ ተጭን:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

# --- የ /pending ትዕዛዝ (ለአድሚን ብቻ) ---
async def cmd_pending(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id != ADMIN_ID:
        await update.message.reply_text("⚠️ ይህ ትዕዛዝ ለአድሚን ብቻ ነው!")
        return
    
    # ከዳታቤዝ የሚጠባበቁ ገንዘቦችን አምጣ
    pending = get_pending_deposits()
    if not pending:
        await update.message.reply_text("✅ ምንም የሚጠባበቅ ገንዘብ የለም።")
        return
    
    text = "📋 *የሚጠባበቁ ገንዘቦች:*\n\n"
    for item in pending:
        text += f"👤 {item['user_id']} - {item['amount']} ETB\n"
    
    await update.message.reply_text(text, parse_mode='Markdown')

# --- ዋናው ተግባር (Main) ---
def main():
    # አፕሊኬሽኑን ፍጠር እና post_init ን አዘጋጅ
    application = (
        Application.builder()
        .token(TOKEN)
        .post_init(post_init)  # ይህ የወርድ ላይ ቁልፍን ያዘጋጃል
        .build()
    )

    # ትዕዛዞችን አክል
    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("game", cmd_game))
    application.add_handler(CommandHandler("pending", cmd_pending))

    # ቦቱን ጀምር
    print("Bot is running...")
    application.run_polling()

if __name__ == '__main__':
    main()
