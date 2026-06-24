"""Database layer — SQLite, no external deps."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Dict, List, Optional

import os
_default = Path(os.environ.get("DB_DIR", str(Path.home()))) / "피부과-crm.db"
DB_PATH = Path(os.environ.get("DB_PATH", str(_default)))

STAGES: List[str] = ["제안 완료", "미팅 확정", "계약 대기중", "계약완료", "Lost"]
TIERS: List[str] = ["개인의원", "네트워크", "대형병원"]
ACTIVITY_TYPES: List[str] = ["통화", "미팅", "이메일", "문자", "기타"]
ACTIVE_STAGES = ("제안 완료", "미팅 확정", "계약 대기중")

_DDL = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    tier         TEXT    DEFAULT '개인의원',
    phone        TEXT    DEFAULT '',
    address      TEXT    DEFAULT '',
    contact_name TEXT    DEFAULT '',
    email        TEXT    DEFAULT '',
    notes        TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS deals (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    account_id       INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    stage            TEXT    DEFAULT '리드',
    value            INTEGER DEFAULT 0,
    next_action      TEXT    DEFAULT '',
    next_action_date TEXT    DEFAULT '',
    notes            TEXT    DEFAULT '',
    created_at       TEXT    DEFAULT (date('now','localtime')),
    source           TEXT    DEFAULT '',
    source_detail    TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activities (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id  INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    type     TEXT    DEFAULT '통화',
    date     TEXT    DEFAULT (date('now','localtime')),
    notes    TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    product_name  TEXT    DEFAULT '톰더글로우',
    quantity      INTEGER DEFAULT 1,
    unit_price    INTEGER DEFAULT 0,
    order_date    TEXT    DEFAULT (date('now','localtime')),
    delivery_date TEXT    DEFAULT '',
    status        TEXT    DEFAULT '발주완료',
    notes         TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expenses (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    amount   INTEGER DEFAULT 0,
    month    TEXT    DEFAULT '',
    notes    TEXT    DEFAULT '',
    category TEXT    DEFAULT '판관비'
);

CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    unit_price INTEGER DEFAULT 0,
    notes      TEXT    DEFAULT ''
);
"""


@dataclass
class Account:
    id: Optional[int] = None
    name: str = ""
    tier: str = "개인의원"
    phone: str = ""
    address: str = ""
    contact_name: str = ""
    email: str = ""
    notes: str = ""


@dataclass
class Deal:
    id: Optional[int] = None
    title: str = ""
    account_id: Optional[int] = None
    stage: str = "리드"
    value: int = 0
    next_action: str = ""
    next_action_date: str = ""
    notes: str = ""
    created_at: str = ""
    source: str = ""
    source_detail: str = ""


@dataclass
class Activity:
    id: Optional[int] = None
    deal_id: Optional[int] = None
    type: str = "통화"
    date: str = ""
    notes: str = ""


@dataclass
class Order:
    id: Optional[int] = None
    account_id: Optional[int] = None
    product_name: str = "톰더글로우"
    quantity: int = 1
    unit_price: int = 0
    order_date: str = ""
    delivery_date: str = ""
    status: str = "발주완료"
    notes: str = ""


@dataclass
class Expense:
    id: Optional[int] = None
    name: str = ""
    amount: int = 0
    month: str = ""
    notes: str = ""
    category: str = "판관비"


@dataclass
class Product:
    id: Optional[int] = None
    name: str = ""
    unit_price: int = 0
    notes: str = ""


class DB:
    def __init__(self, path: Path = DB_PATH) -> None:
        self._c = sqlite3.connect(path, check_same_thread=False)
        self._c.row_factory = sqlite3.Row
        self._c.executescript(_DDL)
        self._c.commit()
        # Migrate: add columns if upgrading from older schema
        for col, typedef in [("contact_name", "TEXT DEFAULT ''"), ("email", "TEXT DEFAULT ''")]:
            try:
                self._c.execute(f"ALTER TABLE accounts ADD COLUMN {col} {typedef}")
                self._c.commit()
            except sqlite3.OperationalError:
                pass
        try:
            self._c.execute("ALTER TABLE deals ADD COLUMN source TEXT DEFAULT ''")
            self._c.commit()
        except sqlite3.OperationalError:
            pass
        try:
            self._c.execute("ALTER TABLE deals ADD COLUMN source_detail TEXT DEFAULT ''")
            self._c.commit()
        except sqlite3.OperationalError:
            pass
        try:
            self._c.execute("ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT '판관비'")
            self._c.commit()
        except sqlite3.OperationalError:
            pass
        # Migrate: remap old stage names to new kanban stages
        _stage_map = [
            ("리드",    "제안 완료"),
            ("첫접촉",  "제안 완료"),
            ("니즈파악","미팅 확정"),
            ("제안",    "미팅 확정"),
            ("협상",    "계약 대기중"),
            ("이탈",    "Lost"),
        ]
        for old, new in _stage_map:
            self._c.execute("UPDATE deals SET stage=? WHERE stage=?", (new, old))
        self._c.commit()
        # Seed: pre-contracted hospitals
        for hospital in ["강남아이디의원", "리뉴미피부과 서초점"]:
            row = self._c.execute("SELECT id FROM accounts WHERE name=?", (hospital,)).fetchone()
            if row:
                acct_id = row["id"]
            else:
                acct_id = self._c.execute(
                    "INSERT INTO accounts (name) VALUES (?)", (hospital,)
                ).lastrowid
            exists = self._c.execute(
                "SELECT id FROM deals WHERE account_id=? AND stage='계약완료'", (acct_id,)
            ).fetchone()
            if not exists:
                self._c.execute(
                    "INSERT INTO deals (title, account_id, stage) VALUES (?, ?, '계약완료')",
                    (hospital, acct_id),
                )
        self._c.commit()
        # Seed: sample orders for pre-contracted hospitals
        _seed_orders = [
            ("강남아이디의원",      "톰더글로우 프로", 2, 438900, "2026-03-15", "납품완료"),
            ("강남아이디의원",      "톰더글로우 프로", 1, 438900, "2026-05-20", "납품완료"),
            ("리뉴미피부과 서초점", "톰더글로우 프로", 1, 438900, "2026-04-10", "납품완료"),
        ]
        for hosp_name, product, qty, price, order_date, status in _seed_orders:
            row = self._c.execute("SELECT id FROM accounts WHERE name=?", (hosp_name,)).fetchone()
            if not row:
                continue
            acct_id = row["id"]
            exists = self._c.execute(
                "SELECT id FROM orders WHERE account_id=? AND product_name=? AND order_date=?",
                (acct_id, product, order_date),
            ).fetchone()
            if not exists:
                self._c.execute(
                    "INSERT INTO orders (account_id,product_name,quantity,unit_price,order_date,status) "
                    "VALUES (?,?,?,?,?,?)",
                    (acct_id, product, qty, price, order_date, status),
                )
        self._c.commit()

    # ── Stages (user-editable) ────────────────────────────────────────────────

    def get_stages(self) -> List[str]:
        row = self._c.execute("SELECT value FROM settings WHERE key='stages'").fetchone()
        if row:
            try:
                return json.loads(row["value"])
            except Exception:
                pass
        return list(STAGES)

    def rename_stage(self, old_name: str, new_name: str) -> None:
        stages = self.get_stages()
        if old_name not in stages:
            raise ValueError(f"단계 '{old_name}'를 찾을 수 없습니다.")
        stages[stages.index(old_name)] = new_name
        self._c.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('stages', ?)",
            (json.dumps(stages),),
        )
        self._c.execute("UPDATE deals SET stage=? WHERE stage=?", (new_name, old_name))
        self._c.commit()

    # ── Accounts ──────────────────────────────────────────────────────────────

    def upsert_account(self, a: Account) -> int:
        if a.id:
            self._c.execute(
                "UPDATE accounts SET name=?,tier=?,phone=?,address=?,contact_name=?,email=?,notes=? WHERE id=?",
                (a.name, a.tier, a.phone, a.address, a.contact_name, a.email, a.notes, a.id),
            )
            self._c.commit()
            return a.id
        cur = self._c.execute(
            "INSERT INTO accounts (name,tier,phone,address,contact_name,email,notes) VALUES (?,?,?,?,?,?,?)",
            (a.name, a.tier, a.phone, a.address, a.contact_name, a.email, a.notes),
        )
        self._c.commit()
        return cur.lastrowid

    def delete_account(self, aid: int) -> None:
        self._c.execute("DELETE FROM accounts WHERE id=?", (aid,))
        self._c.commit()

    def get_accounts(self) -> List[Account]:
        return [Account(**dict(r)) for r in self._c.execute("SELECT * FROM accounts ORDER BY name")]

    def get_account(self, aid: int) -> Optional[Account]:
        r = self._c.execute("SELECT * FROM accounts WHERE id=?", (aid,)).fetchone()
        return Account(**dict(r)) if r else None

    # ── Deals ─────────────────────────────────────────────────────────────────

    def upsert_deal(self, d: Deal) -> int:
        if d.id:
            self._c.execute(
                "UPDATE deals SET title=?,account_id=?,stage=?,value=?,next_action=?,next_action_date=?,notes=?,source=?,source_detail=? WHERE id=?",
                (d.title, d.account_id, d.stage, d.value, d.next_action, d.next_action_date, d.notes, d.source, d.source_detail, d.id),
            )
            self._c.commit()
            return d.id
        cur = self._c.execute(
            "INSERT INTO deals (title,account_id,stage,value,next_action,next_action_date,notes,source,source_detail) VALUES (?,?,?,?,?,?,?,?,?)",
            (d.title, d.account_id, d.stage, d.value, d.next_action, d.next_action_date, d.notes, d.source, d.source_detail),
        )
        self._c.commit()
        return cur.lastrowid

    def delete_deal(self, did: int) -> None:
        self._c.execute("DELETE FROM deals WHERE id=?", (did,))
        self._c.commit()

    def get_deals(self, include_closed: bool = False, include_lost: bool = False) -> List[Deal]:
        if include_closed:
            rows = self._c.execute("SELECT * FROM deals ORDER BY next_action_date, id")
        elif include_lost:
            rows = self._c.execute(
                "SELECT * FROM deals WHERE stage != '계약완료' ORDER BY next_action_date, id"
            )
        else:
            rows = self._c.execute(
                "SELECT * FROM deals WHERE stage NOT IN ('계약완료','Lost') ORDER BY next_action_date, id"
            )
        return [Deal(**dict(r)) for r in rows]

    def get_deal(self, did: int) -> Optional[Deal]:
        r = self._c.execute("SELECT * FROM deals WHERE id=?", (did,)).fetchone()
        return Deal(**dict(r)) if r else None

    def get_closed_deals(self) -> List[Deal]:
        rows = self._c.execute(
            "SELECT * FROM deals WHERE stage='계약완료' ORDER BY id DESC"
        )
        return [Deal(**dict(r)) for r in rows]

    def get_today_actions(self) -> List[Deal]:
        today = date.today().isoformat()
        rows = self._c.execute(
            "SELECT * FROM deals WHERE next_action_date <= ? AND stage NOT IN ('계약완료','Lost') ORDER BY next_action_date",
            (today,),
        )
        return [Deal(**dict(r)) for r in rows]

    def get_pipeline_summary(self) -> Dict[str, Dict]:
        rows = self._c.execute(
            "SELECT stage, COUNT(*) cnt, COALESCE(SUM(value),0) total "
            "FROM deals WHERE stage NOT IN ('계약완료','Lost') GROUP BY stage"
        )
        return {r["stage"]: {"count": r["cnt"], "total": r["total"]} for r in rows}

    # ── Activities ────────────────────────────────────────────────────────────

    def create_activity(self, a: Activity) -> int:
        cur = self._c.execute(
            "INSERT INTO activities (deal_id,type,date,notes) VALUES (?,?,?,?)",
            (a.deal_id, a.type, a.date or date.today().isoformat(), a.notes),
        )
        self._c.commit()
        return cur.lastrowid

    def get_activities(self, deal_id: Optional[int] = None, limit: int = 150) -> List[Activity]:
        if deal_id:
            rows = self._c.execute(
                "SELECT * FROM activities WHERE deal_id=? ORDER BY date DESC, id DESC LIMIT ?",
                (deal_id, limit),
            )
        else:
            rows = self._c.execute(
                "SELECT * FROM activities ORDER BY date DESC, id DESC LIMIT ?", (limit,)
            )
        return [Activity(**dict(r)) for r in rows]

    # ── Orders ────────────────────────────────────────────────────────────────

    def upsert_order(self, o: Order) -> int:
        if o.id:
            self._c.execute(
                "UPDATE orders SET account_id=?,product_name=?,quantity=?,unit_price=?,"
                "order_date=?,delivery_date=?,status=?,notes=? WHERE id=?",
                (o.account_id, o.product_name, o.quantity, o.unit_price,
                 o.order_date, o.delivery_date, o.status, o.notes, o.id),
            )
            self._c.commit()
            return o.id
        cur = self._c.execute(
            "INSERT INTO orders (account_id,product_name,quantity,unit_price,"
            "order_date,delivery_date,status,notes) VALUES (?,?,?,?,?,?,?,?)",
            (o.account_id, o.product_name, o.quantity, o.unit_price,
             o.order_date, o.delivery_date, o.status, o.notes),
        )
        self._c.commit()
        return cur.lastrowid

    def get_orders(self, account_id: Optional[int] = None) -> List[Order]:
        if account_id:
            rows = self._c.execute(
                "SELECT * FROM orders WHERE account_id=? ORDER BY order_date DESC, id DESC",
                (account_id,),
            )
        else:
            rows = self._c.execute("SELECT * FROM orders ORDER BY order_date DESC, id DESC")
        return [Order(**dict(r)) for r in rows]

    def delete_order(self, oid: int) -> None:
        self._c.execute("DELETE FROM orders WHERE id=?", (oid,))
        self._c.commit()

    # ── Expenses ──────────────────────────────────────────────────────────────

    def upsert_expense(self, e: Expense) -> int:
        if e.id:
            self._c.execute(
                "UPDATE expenses SET name=?,amount=?,month=?,notes=?,category=? WHERE id=?",
                (e.name, e.amount, e.month, e.notes, e.category, e.id),
            )
            self._c.commit()
            return e.id
        cur = self._c.execute(
            "INSERT INTO expenses (name,amount,month,notes,category) VALUES (?,?,?,?,?)",
            (e.name, e.amount, e.month, e.notes, e.category),
        )
        self._c.commit()
        return cur.lastrowid

    def get_expenses(self) -> List[Expense]:
        rows = self._c.execute("SELECT * FROM expenses ORDER BY month DESC, id DESC")
        return [Expense(**dict(r)) for r in rows]

    def delete_expense(self, eid: int) -> None:
        self._c.execute("DELETE FROM expenses WHERE id=?", (eid,))
        self._c.commit()

    # ── Products ──────────────────────────────────────────────────────────────

    def upsert_product(self, p: Product) -> int:
        if p.id:
            self._c.execute(
                "UPDATE products SET name=?,unit_price=?,notes=? WHERE id=?",
                (p.name, p.unit_price, p.notes, p.id),
            )
            self._c.commit()
            return p.id
        cur = self._c.execute(
            "INSERT INTO products (name,unit_price,notes) VALUES (?,?,?)",
            (p.name, p.unit_price, p.notes),
        )
        self._c.commit()
        return cur.lastrowid

    def get_products(self) -> List[Product]:
        rows = self._c.execute("SELECT * FROM products ORDER BY name")
        return [Product(**dict(r)) for r in rows]

    def get_product(self, pid: int) -> Optional[Product]:
        r = self._c.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
        return Product(**dict(r)) if r else None

    def delete_product(self, pid: int) -> None:
        self._c.execute("DELETE FROM products WHERE id=?", (pid,))
        self._c.commit()

    def close(self) -> None:
        self._c.close()
