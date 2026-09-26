import logging
import os
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, ContextTypes
)

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

TOKEN = os.environ.get("TELEGRAM_TOKEN", "YOUR_TOKEN_HERE")
WEBAPP_URL = os.environ.get("WEBAPP_URL", "https://example.com")
ADMIN_ID = int(os.environ.get("ADMIN_ID", "0"))


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    url = f"{WEBAPP_URL}?room={chat_id}"
    keyboard = [[InlineKeyboardButton("🎮 ጨዋታ ክፈት", web_app=WebAppInfo(url=url))]]
    await update.message.reply_text(
        "🎱 *Etbingo*\n\n👇 ጨዋታውን ለመክፈት:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )


async def cmd_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    url = f"{WEBAPP_URL}?room={chat_id}"
    keyboard = [[InlineKeyboardButton("🎮 ጨዋታ ክፈት", web_app=WebAppInfo(url=url))]]
    await update.message.reply_text("🎱 Etbingo ጨዋታውን ለመክፈት:",
        reply_markup=InlineKeyboardMarkup(keyboard))


async def cmd_pending(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id != ADMIN_ID:
        await update.message.reply_text("⚠️ Admin only")
        return
    from database import get_pending_deposits
    reqs = get_pending_deposits(20)
    if not reqs:
        await update.message.reply_text("✅ Pending deposit የለም")
        return
    for r in reqs:
        txt = (f"💰 *Deposit Request #{r['id']}*\n\n"
               f"👤 {r['user_name']} (`{r['user_id']}`)\n"
               f"💵 {r['amount']:.2f} ETB\n"
               f"🏦 {r['method']}\n"
               f"🔖 Ref: `{r['reference']}`")
        kb = [[
            InlineKeyboardButton("✅ Approve", callback_data=f"dep_ok_{r['id']}"),
            InlineKeyboardButton("❌ Reject", callback_data=f"dep_no_{r['id']}"),
        ]]
        await update.message.reply_text(txt, reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown')


async def cmd_pending_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id != ADMIN_ID:
        await update.message.reply_text("⚠️ Admin only")
        return
    from database import get_pending_withdraws
    reqs = get_pending_withdraws(20)
    if not reqs:
        await update.message.reply_text("✅ Pending withdraw የለም")
        return
    for r in reqs:
        txt = (f"💸 *Withdraw Request #{r['id']}*\n\n"
               f"👤 {r['user_name']} (`{r['user_id']}`)\n"
               f"💵 {r['amount']:.2f} ETB\n"
               f"🏦 {r['method']}\n"
               f"📱 `{r['account']}`")
        kb = [[
            InlineKeyboardButton("✅ Approve", callback_data=f"wd_ok_{r['id']}"),
            InlineKeyboardButton("❌ Reject", callback_data=f"wd_no_{r['id']}"),
        ]]
        await update.message.reply_text(txt, reply_markup=InlineKeyboardMarkup(kb),
            parse_mode='Markdown')


async def cb_deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = query.from_user.id
    if user_id != ADMIN_ID:
        await query.answer("⚠️ Admin only", show_alert=True)
        return
    parts = query.data.split("_")
    action = parts[1]
    req_id = int(parts[2])
    from database import process_deposit_request, get_deposit_request
    req = get_deposit_request(req_id)
    if not req:
        await query.answer("⚠️ Not found", show_alert=True)
        return
    approve = (action == "ok")
    ok, msg = process_deposit_request(req_id, approve)
    if ok:
        emoji = "✅" if approve else "❌"
        await query.edit_message_text(
            f"{emoji} *Deposit #{req_id}* {'approved' if approve else 'rejected'}\n\n{msg}",
            parse_mode='Markdown')
        try:
            notif = (f"✅ ያስገቡት {req.amount:.2f} ETB ተረጋግጧል!" if approve
                     else f"❌ ያስገቡት {req.amount:.2f} ETB ውድቅ ሆኗል")
            await context.bot.send_message(req.user_id, notif)
        except Exception as e:
            print(f"notify err: {e}")
    else:
        await query.answer(f"⚠️ {msg}", show_alert=True)


async def cb_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user_id = query.from_user.id
    if user_id != ADMIN_ID:
        await query.answer("⚠️ Admin only", show_alert=True)
        return
    parts = query.data.split("_")
    action = parts[1]
    req_id = int(parts[2])
    from database import process_withdraw_request, get_withdraw_request
    req = get_withdraw_request(req_id)
    if not req:
        await query.answer("⚠️ Not found", show_alert=True)
        return
    approve = (action == "ok")
    ok, msg = process_withdraw_request(req_id, approve)
    if ok:
        emoji = "✅" if approve else "❌"
        await query.edit_message_text(
            f"{emoji} *Withdraw #{req_id}* {'approved' if approve else 'rejected'}\n\n{msg}",
            parse_mode='Markdown')
        try:
            notif = (f"✅ ያወጡት {req.amount:.2f} ETB ተልኳል!" if approve
                     else f"❌ ያወጡት {req.amount:.2f} ETB ውድቅ ሆኗል")
            await context.bot.send_message(req.user_id, notif)
        except Exception as e:
            print(f"notify err: {e}")
    else:
        await query.answer(f"⚠️ {msg}", show_alert=True)


async def notify_admin_deposit(req_id):
    from database import get_deposit_request
    req = get_deposit_request(req_id)
    if not req or not ADMIN_ID:
        return
    txt = (f"🔔 *አዲስ Deposit #{req.id}*\n\n"
           f"👤 {req.user_name} (`{req.user_id}`)\n"
           f"💵 *{req.amount:.2f} ETB*\n"
           f"🏦 {req.method}\n"
           f"🔖 `{req.reference}`")
    kb = [[
        InlineKeyboardButton("✅", callback_data=f"dep_ok_{req.id}"),
        InlineKeyboardButton("❌", callback_data=f"dep_no_{req.id}"),
    ]]
    try:
        from telegram import Bot
        bot = Bot(TOKEN)
        async with bot:
            await bot.send_message(ADMIN_ID, txt,
                reply_markup=InlineKeyboardMarkup(kb), parse_mode='Markdown')
    except Exception as e:
        print(f"notify admin err: {e}")


async def notify_admin_withdraw(req_id):
    from database import get_withdraw_request
    req = get_withdraw_request(req_id)
    if not req or not ADMIN_ID:
        return
    txt = (f"💸 *አዲስ Withdraw #{req.id}*\n\n"
           f"👤 {req.user_name} (`{req.user_id}`)\n"
           f"💵 *{req.amount:.2f} ETB*\n"
           f"🏦 {req.method}\n"
           f"📱 `{req.account}`")
    kb = [[
        InlineKeyboardButton("✅", callback_data=f"wd_ok_{req.id}"),
        InlineKeyboardButton("❌", callback_data=f"wd_no_{req.id}"),
    ]]
    try:
        from telegram import Bot
        bot = Bot(TOKEN)
        async with bot:
            await bot.send_message(ADMIN_ID, txt,
                reply_markup=InlineKeyboardMarkup(kb), parse_mode='Markdown')
    except Exception as e:
        print(f"notify admin err: {e}")


def run_bot():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("game", cmd_game))
    app.add_handler(CommandHandler("pending", cmd_pending))
    app.add_handler(CommandHandler("pendingwd", cmd_pending_withdraw))
    app.add_handler(CallbackQueryHandler(cb_deposit, pattern=r"^dep_"))
    app.add_handler(CallbackQueryHandler(cb_withdraw, pattern=r"^wd_"))
    print("🤖 Bot ተጀምሯል...")
    app.run_polling(close_loop=False)
