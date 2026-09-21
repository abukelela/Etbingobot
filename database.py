"""
Database Models — Etbingo
PostgreSQL + SQLAlchemy
"""
import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, BigInteger,
    Float, DateTime, Boolean, ForeignKey, Text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

# ============ Connection ============
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Railway URL format: postgresql://...
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=False
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

# ============ Models ============
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=True)
    first_name = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    balance = Column(Float, default=0.0, nullable=False)
    total_deposited = Column(Float, default=0.0, nullable=False)
    total_withdrawn = Column(Float, default=0.0, nullable=False)
    total_won = Column(Float, default=0.0, nullable=False)
    total_bet = Column(Float, default=0.0, nullable=False)
    games_played = Column(Integer, default=0, nullable=False)
    games_won = Column(Integer, default=0, nullable=False)
    is_verified = Column(Boolean, default=False)
    is_banned = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="user")
    cards = relationship("Card", back_populates="user")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(30), nullable=False)  # deposit, withdraw, bet, win, refund, bonus
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    status = Column(String(20), default="completed")  # pending, completed, failed
    reference = Column(String(100), nullable=True)  # Chapa tx_ref
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="transactions")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(String(50), nullable=False, index=True)
    round_number = Column(Integer, default=1)
    card_price = Column(Float, default=0.0)
    total_pool = Column(Float, default=0.0)
    winner_ids = Column(Text, nullable=True)  # JSON list
    winner_names = Column(Text, nullable=True)
    called_numbers = Column(Text, nullable=True)  # JSON list
    status = Column(String(20), default="active")  # active, finished
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=True, index=True)
    card_number = Column(Integer, nullable=False)
    card_data = Column(Text, nullable=True)  # JSON
    is_winner = Column(Boolean, default=False)
    purchased_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="cards")


# ============ Init ============
def init_db():
    """Tables ፍጠር (ካልተፈጠሩ)"""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")


def get_session():
    """Session አግኝ"""
    return SessionLocal()


# ============ User Helpers ============
def get_or_create_user(telegram_id, username=None, first_name=None):
    """ተጫዋች ካለ አምጣ፣ ከሌለ ፍጠር"""
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if not user:
            user = User(
                telegram_id=telegram_id,
                username=username,
                first_name=first_name,
                balance=0.0
            )
            session.add(user)
            session.commit()
            session.refresh(user)
        else:
            # Update name if changed
            if first_name and user.first_name != first_name:
                user.first_name = first_name
                session.commit()
        return user
    finally:
        session.close()


def get_user_balance(telegram_id):
    """የተጫዋች ሂሳብ አምጣ"""
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        return user.balance if user else 0.0
    finally:
        session.close()


def add_balance(telegram_id, amount, tx_type="deposit", reference=None, description=None):
    """ገንዘብ ጨምር/ቀንስ + transaction መዝግብ"""
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if not user:
            return None

        user.balance += amount

        if tx_type == "deposit":
            user.total_deposited += amount
        elif tx_type == "withdraw":
            user.total_withdrawn += abs(amount)
        elif tx_type == "bet":
            user.total_bet += abs(amount)
        elif tx_type == "win":
            user.total_won += amount

        tx = Transaction(
            user_id=user.id,
            type=tx_type,
            amount=amount,
            balance_after=user.balance,
            reference=reference,
            description=description,
            status="completed"
        )
        session.add(tx)
        session.commit()
        session.refresh(user)
        return user.balance
    except Exception as e:
        session.rollback()
        print(f"add_balance error: {e}")
        return None
    finally:
        session.close()


def get_user_transactions(telegram_id, limit=20):
    """የተጫዋች ታሪክ"""
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if not user:
            return []
        txs = session.query(Transaction).filter_by(user_id=user.id)\
            .order_by(Transaction.created_at.desc()).limit(limit).all()
        return [{
            "id": t.id,
            "type": t.type,
            "amount": t.amount,
            "balance_after": t.balance_after,
            "status": t.status,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in txs]
    finally:
        session.close()


def get_leaderboard(limit=10):
    """መሪ ሰንጠረዥ"""
    session = get_session()
    try:
        users = session.query(User)\
            .filter(User.games_won > 0)\
            .order_by(User.games_won.desc(), User.total_won.desc())\
            .limit(limit).all()
        return [{
            "telegram_id": u.telegram_id,
            "first_name": u.first_name,
            "games_won": u.games_won,
            "games_played": u.games_played,
            "total_won": u.total_won
        } for u in users]
    finally:
        session.close()
