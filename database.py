import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, BigInteger,
    Float, DateTime, Boolean, ForeignKey, Text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


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


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(30), nullable=False)
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    status = Column(String(20), default="completed")
    reference = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="transactions")


class DepositRequest(Base):
    __tablename__ = "deposit_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    user_name = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    method = Column(String(30), nullable=False)
    reference = Column(String(100), nullable=False)
    status = Column(String(20), default="pending", index=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)


class WithdrawRequest(Base):
    __tablename__ = "withdraw_requests"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, nullable=False, index=True)
    user_name = Column(String(100), nullable=True)
    amount = Column(Float, nullable=False)
    method = Column(String(30), nullable=False)
    account = Column(String(100), nullable=False)
    status = Column(String(20), default="pending", index=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)


def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")


def get_session():
    return SessionLocal()


def get_or_create_user(telegram_id, username=None, first_name=None):
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if not user:
            user = User(telegram_id=telegram_id, username=username,
                        first_name=first_name, balance=0.0)
            session.add(user)
            session.commit()
            session.refresh(user)
        elif first_name and user.first_name != first_name:
            user.first_name = first_name
            session.commit()
        return user
    finally:
        session.close()


def get_user_balance(telegram_id):
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        return user.balance if user else 0.0
    finally:
        session.close()


def add_balance(telegram_id, amount, tx_type="deposit", reference=None, description=None):
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
        tx = Transaction(user_id=user.id, type=tx_type, amount=amount,
            balance_after=user.balance, reference=reference,
            description=description, status="completed")
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
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=telegram_id).first()
        if not user:
            return []
        txs = session.query(Transaction).filter_by(user_id=user.id)\
            .order_by(Transaction.created_at.desc()).limit(limit).all()
        return [{
            "id": t.id, "type": t.type, "amount": t.amount,
            "balance_after": t.balance_after, "status": t.status,
            "description": t.description,
            "created_at": t.created_at.isoformat() if t.created_at else None
        } for t in txs]
    finally:
        session.close()


def get_leaderboard(limit=10):
    session = get_session()
    try:
        users = session.query(User).filter(User.games_won > 0)\
            .order_by(User.games_won.desc(), User.total_won.desc())\
            .limit(limit).all()
        return [{
            "telegram_id": u.telegram_id, "first_name": u.first_name,
            "games_won": u.games_won, "games_played": u.games_played,
            "total_won": u.total_won
        } for u in users]
    finally:
        session.close()


# ===== Deposit Requests =====
def create_deposit_request(user_id, user_name, amount, method, reference):
    session = get_session()
    try:
        req = DepositRequest(user_id=user_id, user_name=user_name,
            amount=amount, method=method, reference=reference, status="pending")
        session.add(req)
        session.commit()
        session.refresh(req)
        return req.id
    except Exception as e:
        session.rollback()
        print(f"create_deposit error: {e}")
        return None
    finally:
        session.close()


def get_deposit_request(req_id):
    session = get_session()
    try:
        return session.query(DepositRequest).filter_by(id=req_id).first()
    finally:
        session.close()


def process_deposit_request(req_id, approve, admin_note=None):
    session = get_session()
    try:
        req = session.query(DepositRequest).filter_by(id=req_id).first()
        if not req:
            return False, "Request not found"
        if req.status != "pending":
            return False, f"Already {req.status}"

        req.status = "approved" if approve else "rejected"
        req.admin_note = admin_note
        req.processed_at = datetime.utcnow()
        session.commit()

        if approve:
            new_bal = add_balance(req.user_id, req.amount, tx_type="deposit",
                reference=req.reference,
                description=f"Manual {req.method} deposit")
            if new_bal is None:
                return False, "Balance update failed"
            return True, f"Approved! New balance: {new_bal:.2f}"
        return True, "Rejected"
    except Exception as e:
        session.rollback()
        return False, str(e)
    finally:
        session.close()


def get_pending_deposits(limit=20):
    session = get_session()
    try:
        reqs = session.query(DepositRequest).filter_by(status="pending")\
            .order_by(DepositRequest.created_at.desc()).limit(limit).all()
        return [{
            "id": r.id, "user_id": r.user_id, "user_name": r.user_name,
            "amount": r.amount, "method": r.method, "reference": r.reference,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in reqs]
    finally:
        session.close()


def get_user_deposits(user_id, limit=10):
    session = get_session()
    try:
        reqs = session.query(DepositRequest).filter_by(user_id=user_id)\
            .order_by(DepositRequest.created_at.desc()).limit(limit).all()
        return [{
            "id": r.id, "amount": r.amount, "method": r.method,
            "reference": r.reference, "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in reqs]
    finally:
        session.close()


# ===== Withdraw Requests =====
def create_withdraw_request(user_id, user_name, amount, method, account):
    session = get_session()
    try:
        user = session.query(User).filter_by(telegram_id=user_id).first()
        if not user:
            return None, "user_not_found"
        if user.balance < amount:
            return None, "insufficient_balance"

        user.balance -= amount
        session.commit()

        req = WithdrawRequest(user_id=user_id, user_name=user_name,
            amount=amount, method=method, account=account, status="pending")
        session.add(req)
        session.commit()
        session.refresh(req)
        return req.id, None
    except Exception as e:
        session.rollback()
        print(f"create_withdraw error: {e}")
        return None, str(e)
    finally:
        session.close()


def get_withdraw_request(req_id):
    session = get_session()
    try:
        return session.query(WithdrawRequest).filter_by(id=req_id).first()
    finally:
        session.close()


def process_withdraw_request(req_id, approve, admin_note=None):
    session = get_session()
    try:
        req = session.query(WithdrawRequest).filter_by(id=req_id).first()
        if not req:
            return False, "Request not found"
        if req.status != "pending":
            return False, f"Already {req.status}"

        if approve:
            req.status = "approved"
            req.admin_note = admin_note
            req.processed_at = datetime.utcnow()
            session.commit()

            user = session.query(User).filter_by(telegram_id=req.user_id).first()
            if user:
                tx = Transaction(
                    user_id=user.id, type="withdraw", amount=-req.amount,
                    balance_after=user.balance,
                    description=f"Withdraw {req.method} - {req.account}",
                    status="completed"
                )
                session.add(tx)
                session.commit()
            return True, f"Approved! {req.amount:.2f} ETB to {req.account}"
        else:
            req.status = "rejected"
            req.admin_note = admin_note
            req.processed_at = datetime.utcnow()
            user = session.query(User).filter_by(telegram_id=req.user_id).first()
            if user:
                user.balance += req.amount
                tx = Transaction(
                    user_id=user.id, type="refund", amount=req.amount,
                    balance_after=user.balance,
                    description="Withdraw rejected - refund",
                    status="completed"
                )
                session.add(tx)
            session.commit()
            return True, "Rejected & refunded"
    except Exception as e:
        session.rollback()
        return False, str(e)
    finally:
        session.close()


def get_pending_withdraws(limit=20):
    session = get_session()
    try:
        reqs = session.query(WithdrawRequest).filter_by(status="pending")\
            .order_by(WithdrawRequest.created_at.desc()).limit(limit).all()
        return [{
            "id": r.id, "user_id": r.user_id, "user_name": r.user_name,
            "amount": r.amount, "method": r.method, "account": r.account,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in reqs]
    finally:
        session.close()


def get_user_withdraws(user_id, limit=10):
    session = get_session()
    try:
        reqs = session.query(WithdrawRequest).filter_by(user_id=user_id)\
            .order_by(WithdrawRequest.created_at.desc()).limit(limit).all()
        return [{
            "id": r.id, "amount": r.amount, "method": r.method,
            "account": r.account, "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None
        } for r in reqs]
    finally:
        session.close()
