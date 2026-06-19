"""FastAPI backend — 피부과 영업 CRM."""
from __future__ import annotations

import csv
import dataclasses
import io
import webbrowser
from datetime import date
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import DB, Account, Activity, Deal, Expense, Order, ACTIVITY_TYPES, STAGES, TIERS

ORDER_STATUSES = ["발주완료", "납품완료", "취소"]

app = FastAPI(title="피부과 영업 CRM", docs_url=None, redoc_url=None)
_db = DB()
_static = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=_static), name="static")


# ── Request schemas ────────────────────────────────────────────────────────────

class AccountIn(BaseModel):
    name: str
    tier: str = "개인의원"
    phone: str = ""
    address: str = ""
    contact_name: str = ""
    email: str = ""
    notes: str = ""


class DealIn(BaseModel):
    title: str
    account_id: Optional[int] = None
    stage: str = "리드"
    value: int = 0
    next_action: str = ""
    next_action_date: str = ""
    notes: str = ""


class ActivityIn(BaseModel):
    deal_id: Optional[int] = None
    type: str = "통화"
    date: str = ""
    notes: str = ""


class OrderIn(BaseModel):
    account_id: Optional[int] = None
    product_name: str = "톰더글로우"
    quantity: int = 1
    unit_price: int = 0
    order_date: str = ""
    delivery_date: str = ""
    status: str = "발주완료"
    notes: str = ""


class ExpenseIn(BaseModel):
    name: str
    amount: int = 0
    month: str = ""
    notes: str = ""


COGS_PER_UNIT = 111_419


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def index():
    return (_static / "index.html").read_text(encoding="utf-8")


@app.get("/api/config")
def config():
    return {"stages": _db.get_stages(), "tiers": TIERS, "activity_types": ACTIVITY_TYPES, "order_statuses": ORDER_STATUSES}


class StageRenameIn(BaseModel):
    old_name: str
    new_name: str


@app.put("/api/stages/rename")
def rename_stage(body: StageRenameIn):
    _db.rename_stage(body.old_name, body.new_name)
    return {"stages": _db.get_stages()}


@app.get("/api/dashboard")
def dashboard():
    today = date.today().isoformat()
    actions = _db.get_today_actions()
    active = _db.get_deals()
    recent_acts = _db.get_activities(limit=8)

    enriched_actions = []
    for d in actions:
        acct = _db.get_account(d.account_id) if d.account_id else None
        row = dataclasses.asdict(d)
        row["account_name"] = acct.name if acct else None
        row["is_overdue"] = bool(d.next_action_date and d.next_action_date < today)
        enriched_actions.append(row)

    enriched_acts = []
    for a in recent_acts:
        deal = _db.get_deal(a.deal_id) if a.deal_id else None
        row = dataclasses.asdict(a)
        row["deal_title"] = deal.title if deal else None
        enriched_acts.append(row)

    summary = _db.get_pipeline_summary()

    return {
        "today_actions": enriched_actions,
        "summary": summary,
        "active_count": len(active),
        "total_value": sum(d.value for d in active),
        "recent_activities": enriched_acts,
    }


# ── Accounts ───────────────────────────────────────────────────────────────────

@app.get("/api/accounts")
def list_accounts():
    all_deals = _db.get_deals(include_closed=True)
    result = []
    for a in _db.get_accounts():
        row = dataclasses.asdict(a)
        row["deal_count"] = sum(1 for d in all_deals if d.account_id == a.id)
        result.append(row)
    return result


@app.post("/api/accounts", status_code=201)
def create_account(body: AccountIn):
    a = Account(**body.model_dump())
    a.id = _db.upsert_account(a)
    return dataclasses.asdict(a)


@app.put("/api/accounts/{aid}")
def update_account(aid: int, body: AccountIn):
    a = Account(id=aid, **body.model_dump())
    _db.upsert_account(a)
    return dataclasses.asdict(a)


@app.delete("/api/accounts/{aid}")
def delete_account(aid: int):
    _db.delete_account(aid)
    return {"ok": True}


# ── Deals ──────────────────────────────────────────────────────────────────────

@app.get("/api/deals")
def list_deals(include_closed: bool = False, include_lost: bool = False):
    result = []
    for d in _db.get_deals(include_closed=include_closed, include_lost=include_lost):
        acct = _db.get_account(d.account_id) if d.account_id else None
        row = dataclasses.asdict(d)
        row["account_name"] = acct.name if acct else None
        row["account_tier"] = acct.tier if acct else None
        result.append(row)
    return result


# NOTE: /closed must be defined BEFORE /{did} so FastAPI doesn't treat "closed" as an int param
@app.get("/api/deals/closed")
def list_closed_deals():
    result = []
    for d in _db.get_closed_deals():
        acct = _db.get_account(d.account_id) if d.account_id else None
        row = dataclasses.asdict(d)
        row["account_name"] = acct.name if acct else None
        row["account_tier"] = acct.tier if acct else None
        result.append(row)
    total_value = sum(d["value"] for d in result)
    return {"deals": result, "count": len(result), "total_value": total_value}


@app.post("/api/deals", status_code=201)
def create_deal(body: DealIn):
    d = Deal(**body.model_dump())
    d.id = _db.upsert_deal(d)
    return dataclasses.asdict(d)


@app.put("/api/deals/{did}")
def update_deal(did: int, body: DealIn):
    d = Deal(id=did, **body.model_dump())
    _db.upsert_deal(d)
    return dataclasses.asdict(d)


@app.delete("/api/deals/{did}")
def delete_deal(did: int):
    _db.delete_deal(did)
    return {"ok": True}


# ── Activities ─────────────────────────────────────────────────────────────────

@app.get("/api/activities")
def list_activities(deal_id: Optional[int] = None):
    result = []
    for a in _db.get_activities(deal_id=deal_id):
        deal = _db.get_deal(a.deal_id) if a.deal_id else None
        row = dataclasses.asdict(a)
        row["deal_title"] = deal.title if deal else None
        result.append(row)
    return result


@app.post("/api/activities", status_code=201)
def create_activity(body: ActivityIn):
    a = Activity(**body.model_dump())
    if not a.date:
        a.date = date.today().isoformat()
    a.id = _db.create_activity(a)
    return dataclasses.asdict(a)





# ── Orders ─────────────────────────────────────────────────────────────────────

@app.get("/api/orders")
def list_orders(account_id: Optional[int] = None):
    result = []
    for o in _db.get_orders(account_id=account_id):
        acct = _db.get_account(o.account_id) if o.account_id else None
        row = dataclasses.asdict(o)
        row["account_name"] = acct.name if acct else None
        row["total_price"] = o.quantity * o.unit_price
        result.append(row)
    return result


@app.post("/api/orders", status_code=201)
def create_order(body: OrderIn):
    o = Order(**body.model_dump())
    if not o.order_date:
        o.order_date = date.today().isoformat()
    o.id = _db.upsert_order(o)
    acct = _db.get_account(o.account_id) if o.account_id else None
    row = dataclasses.asdict(o)
    row["account_name"] = acct.name if acct else None
    row["total_price"] = o.quantity * o.unit_price
    return row


@app.put("/api/orders/{oid}")
def update_order(oid: int, body: OrderIn):
    o = Order(id=oid, **body.model_dump())
    _db.upsert_order(o)
    acct = _db.get_account(o.account_id) if o.account_id else None
    row = dataclasses.asdict(o)
    row["account_name"] = acct.name if acct else None
    row["total_price"] = o.quantity * o.unit_price
    return row


@app.delete("/api/orders/{oid}")
def delete_order(oid: int):
    _db.delete_order(oid)
    return {"ok": True}


# ── Expenses & P&L ────────────────────────────────────────────────────────────

@app.get("/api/expenses")
def list_expenses():
    return [dataclasses.asdict(e) for e in _db.get_expenses()]


@app.post("/api/expenses", status_code=201)
def create_expense(body: ExpenseIn):
    e = Expense(**body.model_dump())
    e.id = _db.upsert_expense(e)
    return dataclasses.asdict(e)


@app.put("/api/expenses/{eid}")
def update_expense(eid: int, body: ExpenseIn):
    e = Expense(id=eid, **body.model_dump())
    _db.upsert_expense(e)
    return dataclasses.asdict(e)


@app.delete("/api/expenses/{eid}")
def delete_expense(eid: int):
    _db.delete_expense(eid)
    return {"ok": True}


@app.get("/api/pl")
def get_pl():
    orders = _db.get_orders()
    expenses = _db.get_expenses()

    # Group by month (YYYY-MM)
    months: dict = {}
    for o in orders:
        m = (o.order_date or "")[:7]
        if not m:
            continue
        if m not in months:
            months[m] = {"revenue": 0, "units": 0, "cogs": 0, "expenses": 0}
        months[m]["revenue"] += o.quantity * o.unit_price
        months[m]["units"]   += o.quantity
        months[m]["cogs"]    += o.quantity * COGS_PER_UNIT

    for e in expenses:
        m = (e.month or "")[:7]
        if not m:
            continue
        if m not in months:
            months[m] = {"revenue": 0, "units": 0, "cogs": 0, "expenses": 0}
        months[m]["expenses"] += e.amount

    rows = []
    for m in sorted(months.keys(), reverse=True):
        d = months[m]
        gross  = d["revenue"] - d["cogs"]
        operating = gross - d["expenses"]
        rows.append({
            "month":     m,
            "revenue":   d["revenue"],
            "units":     d["units"],
            "cogs":      d["cogs"],
            "expenses":  d["expenses"],
            "gross":     gross,
            "operating": operating,
        })

    total_revenue   = sum(r["revenue"]   for r in rows)
    total_cogs      = sum(r["cogs"]      for r in rows)
    total_expenses  = sum(r["expenses"]  for r in rows)
    total_gross     = total_revenue - total_cogs
    total_operating = total_gross - total_expenses

    return {
        "rows": rows,
        "total": {
            "revenue":   total_revenue,
            "cogs":      total_cogs,
            "expenses":  total_expenses,
            "gross":     total_gross,
            "operating": total_operating,
        },
        "cogs_per_unit": COGS_PER_UNIT,
    }


# ── CSV Import ─────────────────────────────────────────────────────────────────

def _decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "latin-1"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1")


@app.post("/api/import/deals")
async def import_deals(file: UploadFile = File(...)):
    text = _decode(await file.read())
    reader = csv.DictReader(io.StringIO(text))
    imported, errors = 0, []
    all_accounts = {a.name: a for a in _db.get_accounts()}
    valid_stages = set(_db.get_stages())
    columns: list = []

    for i, row in enumerate(reader, start=2):
        if i == 2:
            columns = [k.strip() for k in (row.keys() if row else [])]
        r = {k.strip(): v for k, v in row.items()}
        try:
            hospital = (r.get("병원명") or r.get("거래처") or "").strip()
            if not hospital:
                errors.append(f"{i}행: '병원명' 값 없음")
                continue

            contact_name = (r.get("고객명") or r.get("담당자") or "").strip()
            email = (r.get("이메일") or r.get("email") or "").strip()
            phone = (r.get("전화번호") or r.get("phone") or "").strip()

            # Upsert account with contact info
            if hospital in all_accounts:
                acct = all_accounts[hospital]
                # Update contact info if newly provided
                if contact_name or email or phone:
                    acct.contact_name = contact_name or acct.contact_name
                    acct.email = email or acct.email
                    acct.phone = phone or acct.phone
                    _db.upsert_account(acct)
                account_id = acct.id
            else:
                new_acct = Account(
                    name=hospital,
                    contact_name=contact_name,
                    email=email,
                    phone=phone,
                )
                new_id = _db.upsert_account(new_acct)
                new_acct.id = new_id
                all_accounts[hospital] = new_acct
                account_id = new_id

            # Lead title defaults to hospital name if not separately specified
            title = (r.get("리드 이름") or r.get("딜 이름") or hospital).strip()
            raw_stage = (r.get("단계") or "리드").strip()
            stage = raw_stage if raw_stage in valid_stages else "리드"
            raw_val = (r.get("금액(원)") or r.get("금액") or "0").strip().replace(",", "")
            value = int(raw_val) if raw_val.isdigit() else 0

            d = Deal(
                title=title,
                account_id=account_id,
                stage=stage,
                value=value,
                next_action=(r.get("다음 액션") or "").strip(),
                next_action_date=(r.get("날짜(YYYY-MM-DD)") or r.get("날짜") or "").strip(),
                notes=(r.get("메모") or "").strip(),
            )
            _db.upsert_deal(d)
            imported += 1
        except Exception as e:
            errors.append(f"{i}행: {e}")

    return {"imported": imported, "errors": errors, "columns": columns}


@app.post("/api/import/accounts")
async def import_accounts(file: UploadFile = File(...)):
    text = _decode(await file.read())
    reader = csv.DictReader(io.StringIO(text))
    imported, errors = 0, []
    columns: list = []

    for i, row in enumerate(reader, start=2):
        if i == 2:
            columns = [k.strip() for k in (row.keys() if row else [])]
        r = {k.strip(): v for k, v in row.items()}
        try:
            name = (r.get("거래처 이름") or r.get("name") or "").strip()
            if not name:
                errors.append(f"{i}행: '거래처 이름' 값 없음")
                continue
            a = Account(
                name=name,
                tier=(r.get("분류") or r.get("tier") or "개인의원").strip() or "개인의원",
                contact_name=(r.get("고객명") or r.get("담당자") or "").strip(),
                email=(r.get("이메일") or r.get("email") or "").strip(),
                phone=(r.get("전화번호") or r.get("phone") or "").strip(),
                address=(r.get("주소") or r.get("address") or "").strip(),
                notes=(r.get("메모") or r.get("notes") or "").strip(),
            )
            _db.upsert_account(a)
            imported += 1
        except Exception as e:
            errors.append(f"{i}행: {e}")

    return {"imported": imported, "errors": errors, "columns": columns}


if __name__ == "__main__":
    print("\n  피부과 영업 CRM 시작 중...")
    print("  브라우저에서 http://localhost:8000 으로 접속하세요\n")
    webbrowser.open("http://localhost:8000")
    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
