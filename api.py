"""FastAPI backend — 피부과 영업 CRM."""
from __future__ import annotations

import csv
import dataclasses
import io
import webbrowser
from datetime import date
from pathlib import Path
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from db import DB, Account, Activity, Deal, Expense, Order, Product, InventoryItem, ACTIVITY_TYPES, ACTIVE_STAGES, STAGES, TIERS

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
    source: str = ""
    source_detail: str = ""


class ActivityIn(BaseModel):
    deal_id: Optional[int] = None
    account_id: Optional[int] = None
    type: str = "통화"
    date: str = ""
    notes: str = ""
    assignee: str = ""


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
    date: str = ""
    notes: str = ""
    category: str = "판관비"


class ProductIn(BaseModel):
    name: str
    unit_price: int = 0
    cost_price: int = 0
    notes: str = ""


class ExpenseCategoriesIn(BaseModel):
    categories: List[str]


class DashboardConfigIn(BaseModel):
    config: list


class InventoryItemIn(BaseModel):
    name: str
    total_qty: int = 0
    unit_cost: int = 0
    notes: str = ""


class DealInventoryIn(BaseModel):
    items: List[dict]


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def index():
    return (_static / "index.html").read_text(encoding="utf-8")


@app.get("/api/config")
def config():
    products = [dataclasses.asdict(p) for p in _db.get_products()]
    return {
        "stages": _db.get_stages(),
        "tiers": TIERS,
        "activity_types": ACTIVITY_TYPES,
        "order_statuses": ORDER_STATUSES,
        "products": products,
        "expense_categories": _db.get_expense_categories(),
    }


class StageRenameIn(BaseModel):
    old_name: str
    new_name: str


@app.put("/api/stages/rename")
def rename_stage(body: StageRenameIn):
    _db.rename_stage(body.old_name, body.new_name)
    return {"stages": _db.get_stages()}


@app.get("/api/dashboard")
def dashboard():
    this_month = date.today().isoformat()[:7]

    all_deals = _db.get_deals(include_closed=True)
    active  = [d for d in all_deals if d.stage in ACTIVE_STAGES]
    closed  = [d for d in all_deals if d.stage == '계약완료']
    orders  = _db.get_orders()
    expenses = _db.get_expenses()
    summary = _db.get_pipeline_summary()

    # Build product cost map
    products = _db.get_products()
    cost_map = {p.name: p.cost_price for p in products}

    # 매출 집계
    total_revenue = sum(o.quantity * o.unit_price for o in orders)
    month_revenue = sum(
        o.quantity * o.unit_price for o in orders
        if (o.order_date or "")[:7] == this_month
    )

    # 병원별 매출 순위
    hosp: dict = {}
    for o in orders:
        acct = _db.get_account(o.account_id) if o.account_id else None
        name = acct.name if acct else "미지정"
        hosp[name] = hosp.get(name, 0) + o.quantity * o.unit_price
    hospital_ranking = [
        {"name": n, "revenue": r}
        for n, r in sorted(hosp.items(), key=lambda x: x[1], reverse=True)[:8]
    ]

    # 월별 매출 (최근 6개월)
    monthly: dict = {}
    for o in orders:
        m = (o.order_date or "")[:7]
        if m:
            monthly[m] = monthly.get(m, 0) + o.quantity * o.unit_price
    monthly_trend = [
        {"month": k, "revenue": v}
        for k, v in sorted(monthly.items(), reverse=True)[:6]
    ]

    # 월별 손익 데이터
    months_pl: dict = {}
    for o in orders:
        m = (o.order_date or "")[:7]
        if not m:
            continue
        cogs_unit = cost_map.get(o.product_name, 111419)
        if m not in months_pl:
            months_pl[m] = {"revenue": 0, "cogs": 0, "expenses": 0}
        months_pl[m]["revenue"] += o.quantity * o.unit_price
        months_pl[m]["cogs"]    += o.quantity * cogs_unit
    for e in expenses:
        m = (e.date or e.month or "")[:7]
        if not m:
            continue
        if m not in months_pl:
            months_pl[m] = {"revenue": 0, "cogs": 0, "expenses": 0}
        months_pl[m]["expenses"] += e.amount

    total_cogs = sum(d["cogs"] for d in months_pl.values())
    total_expenses = sum(d["expenses"] for d in months_pl.values())
    total_gross = total_revenue - total_cogs
    total_operating = total_gross - total_expenses

    return {
        "active_count":      len(active),
        "closed_count":      len(closed),
        "total_revenue":     total_revenue,
        "month_revenue":     month_revenue,
        "total_cogs":        total_cogs,
        "total_expenses":    total_expenses,
        "total_gross":       total_gross,
        "total_operating":   total_operating,
        "hospital_ranking":  hospital_ranking,
        "monthly_trend":     monthly_trend,
        "summary":           summary,
    }


# ── Dashboard Config ───────────────────────────────────────────────────────────

@app.get("/api/dashboard-config")
def get_dashboard_config():
    return {"config": _db.get_dashboard_config()}


@app.put("/api/dashboard-config")
def save_dashboard_config(body: DashboardConfigIn):
    _db.set_dashboard_config(body.config)
    return {"ok": True}


# ── Accounts ───────────────────────────────────────────────────────────────────

@app.get("/api/accounts")
def list_accounts():
    all_deals = _db.get_deals(include_closed=True)
    result = []
    for a in _db.get_accounts():
        row = dataclasses.asdict(a)
        acct_deals = [d for d in all_deals if d.account_id == a.id]
        row["deal_count"] = len(acct_deals)
        # Determine lead status: prefer active over closed
        active_deal = next((d for d in acct_deals if d.stage in ACTIVE_STAGES), None)
        closed_deal = next((d for d in acct_deals if d.stage == '계약완료'), None)
        if active_deal:
            row["lead_stage"] = active_deal.stage
        elif closed_deal:
            row["lead_stage"] = "계약완료"
        elif acct_deals:
            row["lead_stage"] = acct_deals[0].stage
        else:
            row["lead_stage"] = None
        result.append(row)
    return result


@app.get("/api/check-phone")
def check_phone(phone: str = ""):
    phone = phone.strip()
    if not phone:
        return {"exists": False, "account": None}
    for a in _db.get_accounts():
        if a.phone and a.phone.strip() == phone:
            return {"exists": True, "account": {"id": a.id, "name": a.name}}
    return {"exists": False, "account": None}


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
        # Resolve account: direct account_id takes priority, then via deal
        acct = None
        deal = None
        if a.deal_id:
            deal = _db.get_deal(a.deal_id)
        if a.account_id:
            acct = _db.get_account(a.account_id)
        elif deal and deal.account_id:
            acct = _db.get_account(deal.account_id)
        row = dataclasses.asdict(a)
        row["deal_title"]   = deal.title if deal else None
        row["account_name"] = acct.name  if acct else None
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
    # Derive month from date if not provided
    if e.date and not e.month:
        e.month = e.date[:7]
    e.id = _db.upsert_expense(e)
    return dataclasses.asdict(e)


@app.put("/api/expenses/{eid}")
def update_expense(eid: int, body: ExpenseIn):
    e = Expense(id=eid, **body.model_dump())
    if e.date and not e.month:
        e.month = e.date[:7]
    _db.upsert_expense(e)
    return dataclasses.asdict(e)


@app.delete("/api/expenses/{eid}")
def delete_expense(eid: int):
    _db.delete_expense(eid)
    return {"ok": True}


# ── Expense Categories ─────────────────────────────────────────────────────────

@app.get("/api/expense-categories")
def get_expense_categories():
    return {"categories": _db.get_expense_categories()}


@app.put("/api/expense-categories")
def update_expense_categories(body: ExpenseCategoriesIn):
    _db.set_expense_categories(body.categories)
    return {"categories": _db.get_expense_categories()}


@app.get("/api/pl")
def get_pl():
    orders = _db.get_orders()
    expenses = _db.get_expenses()
    products = _db.get_products()
    cost_map = {p.name: p.cost_price for p in products}

    months: dict = {}
    for o in orders:
        m = (o.order_date or "")[:7]
        if not m:
            continue
        cogs_unit = cost_map.get(o.product_name, 111419)
        if m not in months:
            months[m] = {"revenue": 0, "units": 0, "cogs": 0, "expenses": 0}
        months[m]["revenue"] += o.quantity * o.unit_price
        months[m]["units"]   += o.quantity
        months[m]["cogs"]    += o.quantity * cogs_unit

    expenses_by_month: dict = {}
    for e in expenses:
        m = (e.date or e.month or "")[:7]
        if not m:
            continue
        if m not in months:
            months[m] = {"revenue": 0, "units": 0, "cogs": 0, "expenses": 0}
        months[m]["expenses"] += e.amount
        if m not in expenses_by_month:
            expenses_by_month[m] = []
        expenses_by_month[m].append(dataclasses.asdict(e))

    rows = []
    for m in sorted(months.keys(), reverse=True):
        d = months[m]
        gross     = d["revenue"] - d["cogs"]
        operating = gross - d["expenses"]
        cat_totals: dict = {}
        for exp in expenses_by_month.get(m, []):
            cat = exp.get("category", "판관비") or "판관비"
            cat_totals[cat] = cat_totals.get(cat, 0) + exp.get("amount", 0)
        rows.append({
            "month":      m,
            "revenue":    d["revenue"],
            "units":      d["units"],
            "cogs":       d["cogs"],
            "gross":      gross,
            "expenses":   d["expenses"],
            "operating":  operating,
            "cat_totals": cat_totals,
        })

    total_revenue   = sum(r["revenue"]   for r in rows)
    total_cogs      = sum(r["cogs"]      for r in rows)
    total_gross     = total_revenue - total_cogs
    total_expenses  = sum(r["expenses"]  for r in rows)
    total_operating = total_gross - total_expenses

    orders_by_month: dict = {}
    for o in orders:
        m = (o.order_date or "")[:7]
        if not m:
            continue
        if m not in orders_by_month:
            orders_by_month[m] = []
        acct = _db.get_account(o.account_id) if o.account_id else None
        row = dataclasses.asdict(o)
        row["account_name"] = acct.name if acct else None
        row["total_price"] = o.quantity * o.unit_price
        orders_by_month[m].append(row)

    expense_categories = _db.get_expense_categories()

    return {
        "rows": rows,
        "total": {
            "revenue":   total_revenue,
            "cogs":      total_cogs,
            "gross":     total_gross,
            "expenses":  total_expenses,
            "operating": total_operating,
        },
        "expense_categories": expense_categories,
        "expenses_detail": expenses_by_month,
        "orders_detail":   orders_by_month,
    }


# ── Products ──────────────────────────────────────────────────────────────────

@app.get("/api/products")
def list_products():
    return [dataclasses.asdict(p) for p in _db.get_products()]


@app.post("/api/products", status_code=201)
def create_product(body: ProductIn):
    p = Product(**body.model_dump())
    p.id = _db.upsert_product(p)
    return dataclasses.asdict(p)


@app.put("/api/products/{pid}")
def update_product(pid: int, body: ProductIn):
    p = Product(id=pid, **body.model_dump())
    _db.upsert_product(p)
    return dataclasses.asdict(p)


@app.delete("/api/products/{pid}")
def delete_product(pid: int):
    _db.delete_product(pid)
    return {"ok": True}


# ── Inventory ─────────────────────────────────────────────────────────────────

@app.get("/api/inventory")
def list_inventory():
    items = _db.get_inventory_items()
    checkout = _db.get_inventory_checkout_summary()
    result = []
    for it in items:
        row = dataclasses.asdict(it)
        row["out_qty"] = checkout.get(it.id, 0)
        row["remaining"] = it.total_qty - row["out_qty"]
        result.append(row)
    return result


@app.get("/api/inventory/checkouts")
def list_checkouts():
    return _db.get_all_deal_inventory()


@app.post("/api/inventory", status_code=201)
def create_inventory_item(body: InventoryItemIn):
    item = InventoryItem(**body.model_dump())
    item.id = _db.upsert_inventory_item(item)
    return dataclasses.asdict(item)


@app.put("/api/inventory/{iid}")
def update_inventory_item(iid: int, body: InventoryItemIn):
    item = InventoryItem(id=iid, **body.model_dump())
    _db.upsert_inventory_item(item)
    return dataclasses.asdict(item)


@app.delete("/api/inventory/{iid}")
def delete_inventory_item(iid: int):
    _db.delete_inventory_item(iid)
    return {"ok": True}


@app.get("/api/deals/{did}/inventory")
def get_deal_inventory(did: int):
    return [dataclasses.asdict(x) for x in _db.get_deal_inventory(did)]


@app.put("/api/deals/{did}/inventory")
def set_deal_inventory(did: int, body: DealInventoryIn):
    _db.set_deal_inventory(did, body.items)
    return [dataclasses.asdict(x) for x in _db.get_deal_inventory(did)]


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
    duplicates = 0
    all_accounts = {a.name: a for a in _db.get_accounts()}
    phone_to_account = {a.phone.strip(): a for a in all_accounts.values() if a.phone and a.phone.strip()}
    stages = _db.get_stages()
    valid_stages = set(stages)
    default_stage = stages[0] if stages else "제안 완료"
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

            contact_name = (r.get("이름") or r.get("고객명") or r.get("담당자") or "").strip()
            if not contact_name:
                errors.append(f"{i}행: '이름' 값 없음")
                continue

            phone = (r.get("전화번호") or r.get("phone") or "").strip()
            if not phone:
                errors.append(f"{i}행: '전화번호' 값 없음")
                continue

            email = (r.get("이메일") or r.get("email") or "").strip()
            if not email:
                errors.append(f"{i}행: '이메일' 값 없음")
                continue

            if phone in phone_to_account:
                existing_acct = phone_to_account[phone]
                if existing_acct.name != hospital:
                    errors.append(f"{i}행: 중복 리드 (전화번호 {phone} → 이미 등록된 거래처 '{existing_acct.name}')")
                    duplicates += 1
                    continue

            tier = (r.get("분류") or "").strip() or "개인의원"
            address = (r.get("주소") or "").strip()
            acct_notes = (r.get("거래처 메모") or "").strip()

            if hospital in all_accounts:
                acct = all_accounts[hospital]
                acct.contact_name = contact_name or acct.contact_name
                acct.email = email or acct.email
                acct.phone = phone or acct.phone
                if tier and tier != "개인의원":
                    acct.tier = tier
                if address:
                    acct.address = address
                if acct_notes:
                    acct.notes = acct_notes
                _db.upsert_account(acct)
                account_id = acct.id
            else:
                new_acct = Account(
                    name=hospital, tier=tier, contact_name=contact_name,
                    email=email, phone=phone, address=address, notes=acct_notes,
                )
                new_id = _db.upsert_account(new_acct)
                new_acct.id = new_id
                all_accounts[hospital] = new_acct
                phone_to_account[phone] = new_acct
                account_id = new_id

            title = (r.get("리드 이름") or hospital).strip()
            raw_stage = (r.get("단계") or "").strip()
            stage = raw_stage if raw_stage in valid_stages else default_stage
            raw_val = (r.get("금액(원)") or r.get("금액") or "0").strip().replace(",", "")
            value = int(raw_val) if raw_val.isdigit() else 0

            d = Deal(
                title=title, account_id=account_id, stage=stage, value=value,
                next_action=(r.get("다음 액션") or "").strip(),
                next_action_date=(r.get("날짜(YYYY-MM-DD)") or "").strip(),
                notes=(r.get("메모") or "").strip(),
            )
            _db.upsert_deal(d)
            imported += 1
        except Exception as e:
            errors.append(f"{i}행: {e}")

    return {"imported": imported, "duplicates": duplicates, "errors": errors, "columns": columns}


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
