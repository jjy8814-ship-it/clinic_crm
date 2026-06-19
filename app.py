"""피부과 영업 CRM — Textual TUI."""
from __future__ import annotations

from datetime import date
from typing import Optional

from rich.text import Text
from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, ScrollableContainer
from textual.screen import ModalScreen
from textual.widgets import (
    Button,
    DataTable,
    Footer,
    Header,
    Input,
    Label,
    Rule,
    Select,
    Static,
    TabbedContent,
    TabPane,
    TextArea,
)

from db import DB, Account, Activity, Deal, ACTIVITY_TYPES, STAGES, TIERS

_db = DB()

_STAGE_STYLE: dict = {
    "리드": "bright_blue",
    "첫접촉": "cyan",
    "니즈파악": "yellow",
    "제안": "magenta",
    "협상": "red",
    "계약완료": "green",
    "이탈": "dim",
}
_ACT_STYLE: dict = {
    "통화": "cyan", "미팅": "green", "이메일": "blue",
    "문자": "yellow", "기타": "dim",
}
_TIER_STYLE: dict = {
    "개인의원": "cyan", "네트워크": "yellow", "대형병원": "red",
}


# ══════════════════════════════════════════════════════════════════════════════
# Modal Screens
# ══════════════════════════════════════════════════════════════════════════════

class DealFormScreen(ModalScreen):
    DEFAULT_CSS = """
    DealFormScreen { align: center middle; }
    DealFormScreen > Container {
        background: $panel; border: round $accent;
        padding: 1 2; width: 72; height: auto; max-height: 90vh;
    }
    DealFormScreen Label { margin-top: 1; }
    DealFormScreen #form-title { text-align: center; text-style: bold; color: $accent; }
    DealFormScreen #form-buttons { align: center middle; height: 3; margin-top: 1; }
    DealFormScreen Button { margin: 0 1; }
    DealFormScreen TextArea { height: 4; }
    """

    def __init__(self, deal: Optional[Deal] = None) -> None:
        super().__init__()
        self._deal = deal or Deal()
        self._editing = deal is not None

    def compose(self) -> ComposeResult:
        accounts = _db.get_accounts()
        acct_opts = [(a.name, str(a.id)) for a in accounts]
        stage_opts = [(s, s) for s in STAGES]

        with Container():
            yield Label("✏  딜 편집" if self._editing else "➕  새 딜", id="form-title")
            yield Rule()
            yield Label("딜 이름 *")
            yield Input(self._deal.title, placeholder="예: 강남스킨케어 레이저 장비", id="f-title")
            yield Label("거래처")
            if acct_opts:
                yield Select(
                    acct_opts,
                    value=str(self._deal.account_id) if self._deal.account_id else Select.BLANK,
                    prompt="거래처 선택",
                    allow_blank=True,
                    id="f-account",
                )
            else:
                yield Static("[dim]거래처 없음 — 먼저 거래처 탭에서 추가하세요[/dim]", markup=True)
            yield Label("단계")
            yield Select(stage_opts, value=self._deal.stage or "리드", id="f-stage")
            yield Label("금액 (만원)")
            yield Input(
                str(self._deal.value) if self._deal.value else "",
                placeholder="0",
                id="f-value",
            )
            yield Label("다음 액션")
            yield Input(self._deal.next_action, placeholder="예: 제안서 발송", id="f-next-action")
            yield Label("다음 액션 날짜 (YYYY-MM-DD)")
            yield Input(
                self._deal.next_action_date,
                placeholder=date.today().isoformat(),
                id="f-date",
            )
            yield Label("메모")
            yield TextArea(self._deal.notes, id="f-notes")
            with Horizontal(id="form-buttons"):
                yield Button("저장", variant="primary", id="btn-save")
                yield Button("취소", id="btn-cancel")

    @on(Button.Pressed, "#btn-save")
    def _save(self) -> None:
        title = self.query_one("#f-title", Input).value.strip()
        if not title:
            self.notify("딜 이름을 입력하세요.", severity="error")
            return

        stage_sel = self.query_one("#f-stage", Select)
        val_str = self.query_one("#f-value", Input).value.strip()

        self._deal.title = title
        self._deal.stage = str(stage_sel.value) if stage_sel.value != Select.BLANK else "리드"
        self._deal.value = int(val_str) if val_str.isdigit() else 0
        self._deal.next_action = self.query_one("#f-next-action", Input).value.strip()
        self._deal.next_action_date = self.query_one("#f-date", Input).value.strip()
        self._deal.notes = self.query_one("#f-notes", TextArea).text

        # account select may not exist if no accounts
        try:
            acct_sel = self.query_one("#f-account", Select)
            self._deal.account_id = (
                int(acct_sel.value) if acct_sel.value != Select.BLANK else None
            )
        except Exception:
            pass

        self.dismiss(self._deal)

    @on(Button.Pressed, "#btn-cancel")
    def _cancel(self) -> None:
        self.dismiss(None)


class AccountFormScreen(ModalScreen):
    DEFAULT_CSS = """
    AccountFormScreen { align: center middle; }
    AccountFormScreen > Container {
        background: $panel; border: round $accent;
        padding: 1 2; width: 60; height: auto;
    }
    AccountFormScreen Label { margin-top: 1; }
    AccountFormScreen #form-title { text-align: center; text-style: bold; color: $accent; }
    AccountFormScreen #form-buttons { align: center middle; height: 3; margin-top: 1; }
    AccountFormScreen Button { margin: 0 1; }
    AccountFormScreen TextArea { height: 4; }
    """

    def __init__(self, account: Optional[Account] = None) -> None:
        super().__init__()
        self._account = account or Account()
        self._editing = account is not None

    def compose(self) -> ComposeResult:
        tier_opts = [(t, t) for t in TIERS]
        with Container():
            yield Label("✏  거래처 편집" if self._editing else "➕  새 거래처", id="form-title")
            yield Rule()
            yield Label("거래처 이름 *")
            yield Input(self._account.name, placeholder="예: 강남스킨케어의원", id="f-name")
            yield Label("분류")
            yield Select(tier_opts, value=self._account.tier or "개인의원", id="f-tier")
            yield Label("전화번호")
            yield Input(self._account.phone, placeholder="02-1234-5678", id="f-phone")
            yield Label("주소")
            yield Input(self._account.address, placeholder="서울시 강남구...", id="f-address")
            yield Label("메모")
            yield TextArea(self._account.notes, id="f-notes")
            with Horizontal(id="form-buttons"):
                yield Button("저장", variant="primary", id="btn-save")
                yield Button("취소", id="btn-cancel")

    @on(Button.Pressed, "#btn-save")
    def _save(self) -> None:
        name = self.query_one("#f-name", Input).value.strip()
        if not name:
            self.notify("거래처 이름을 입력하세요.", severity="error")
            return
        tier_sel = self.query_one("#f-tier", Select)
        self._account.name = name
        self._account.tier = str(tier_sel.value) if tier_sel.value != Select.BLANK else "개인의원"
        self._account.phone = self.query_one("#f-phone", Input).value.strip()
        self._account.address = self.query_one("#f-address", Input).value.strip()
        self._account.notes = self.query_one("#f-notes", TextArea).text
        self.dismiss(self._account)

    @on(Button.Pressed, "#btn-cancel")
    def _cancel(self) -> None:
        self.dismiss(None)


class ActivityFormScreen(ModalScreen):
    DEFAULT_CSS = """
    ActivityFormScreen { align: center middle; }
    ActivityFormScreen > Container {
        background: $panel; border: round $accent;
        padding: 1 2; width: 60; height: auto;
    }
    ActivityFormScreen Label { margin-top: 1; }
    ActivityFormScreen #form-title { text-align: center; text-style: bold; color: $accent; }
    ActivityFormScreen #deal-label { color: $text-muted; text-align: center; }
    ActivityFormScreen #form-buttons { align: center middle; height: 3; margin-top: 1; }
    ActivityFormScreen Button { margin: 0 1; }
    ActivityFormScreen TextArea { height: 5; }
    """

    def __init__(self, deal: Deal, activity: Optional[Activity] = None) -> None:
        super().__init__()
        self._deal = deal
        self._activity = activity or Activity(
            deal_id=deal.id,
            date=date.today().isoformat(),
        )

    def compose(self) -> ComposeResult:
        type_opts = [(t, t) for t in ACTIVITY_TYPES]
        with Container():
            yield Label("➕  활동 기록", id="form-title")
            yield Label(f"딜: {self._deal.title}", id="deal-label")
            yield Rule()
            yield Label("활동 유형")
            yield Select(type_opts, value=self._activity.type or "통화", id="f-type")
            yield Label("날짜 (YYYY-MM-DD)")
            yield Input(
                self._activity.date or date.today().isoformat(),
                placeholder=date.today().isoformat(),
                id="f-date",
            )
            yield Label("내용 *")
            yield TextArea(self._activity.notes or "", id="f-notes")
            with Horizontal(id="form-buttons"):
                yield Button("저장", variant="primary", id="btn-save")
                yield Button("취소", id="btn-cancel")

    @on(Button.Pressed, "#btn-save")
    def _save(self) -> None:
        notes = self.query_one("#f-notes", TextArea).text.strip()
        if not notes:
            self.notify("내용을 입력하세요.", severity="error")
            return
        type_sel = self.query_one("#f-type", Select)
        self._activity.type = str(type_sel.value) if type_sel.value != Select.BLANK else "통화"
        self._activity.date = self.query_one("#f-date", Input).value.strip() or date.today().isoformat()
        self._activity.notes = notes
        self.dismiss(self._activity)

    @on(Button.Pressed, "#btn-cancel")
    def _cancel(self) -> None:
        self.dismiss(None)


class ConfirmScreen(ModalScreen):
    DEFAULT_CSS = """
    ConfirmScreen { align: center middle; }
    ConfirmScreen > Container {
        background: $panel; border: round $warning;
        padding: 1 2; width: 50; height: auto;
    }
    ConfirmScreen #msg { text-align: center; margin-bottom: 1; }
    ConfirmScreen #btns { align: center middle; height: 3; }
    ConfirmScreen Button { margin: 0 1; }
    """

    def __init__(self, message: str) -> None:
        super().__init__()
        self._message = message

    def compose(self) -> ComposeResult:
        with Container():
            yield Label(self._message, id="msg")
            with Horizontal(id="btns"):
                yield Button("삭제", variant="error", id="btn-yes")
                yield Button("취소", id="btn-no")

    @on(Button.Pressed, "#btn-yes")
    def _yes(self) -> None:
        self.dismiss(True)

    @on(Button.Pressed, "#btn-no")
    def _no(self) -> None:
        self.dismiss(False)


# ══════════════════════════════════════════════════════════════════════════════
# Main App
# ══════════════════════════════════════════════════════════════════════════════

class CRMApp(App):
    TITLE = "피부과 영업 CRM"
    CSS = """
    Screen { background: $surface; }

    TabbedContent { height: 1fr; }
    TabPane { padding: 0 1; }

    DataTable { height: 1fr; }

    #dashboard-scroll { height: 1fr; padding: 1; }
    #dashboard-content { height: auto; }

    .hint {
        color: $text-muted;
        height: 1;
        padding: 0 1;
    }
    """

    BINDINGS = [
        Binding("n", "new_item", "새 항목(N)"),
        Binding("d", "delete_item", "삭제(D)"),
        Binding("a", "add_activity", "활동기록(A)"),
        Binding("r", "refresh_all", "새로고침(R)"),
        Binding("q", "quit", "종료(Q)"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._pipeline_key: Optional[str] = None
        self._contacts_key: Optional[str] = None
        self._log_key: Optional[str] = None

    def compose(self) -> ComposeResult:
        yield Header()
        with TabbedContent(id="tabs"):
            with TabPane("📊 대시보드", id="tab-dashboard"):
                with ScrollableContainer(id="dashboard-scroll"):
                    yield Static(id="dashboard-content")
            with TabPane("🎯 딜 파이프라인", id="tab-pipeline"):
                yield DataTable(id="pipeline-table", cursor_type="row", zebra_stripes=True)
            with TabPane("🏥 거래처", id="tab-contacts"):
                yield DataTable(id="contacts-table", cursor_type="row", zebra_stripes=True)
            with TabPane("📋 활동 로그", id="tab-log"):
                yield DataTable(id="log-table", cursor_type="row", zebra_stripes=True)
        yield Footer()

    def on_mount(self) -> None:
        self._init_pipeline_table()
        self._init_contacts_table()
        self._init_log_table()
        self._refresh_all()

    # ── Table init ─────────────────────────────────────────────────────────────

    def _init_pipeline_table(self) -> None:
        t = self.query_one("#pipeline-table", DataTable)
        t.add_column("딜 이름", key="title", width=28)
        t.add_column("거래처", key="account", width=18)
        t.add_column("단계", key="stage", width=10)
        t.add_column("금액(만)", key="value", width=9)
        t.add_column("다음 액션", key="next_action", width=22)
        t.add_column("액션 날짜", key="date", width=12)

    def _init_contacts_table(self) -> None:
        t = self.query_one("#contacts-table", DataTable)
        t.add_column("거래처 이름", key="name", width=25)
        t.add_column("분류", key="tier", width=10)
        t.add_column("전화번호", key="phone", width=16)
        t.add_column("주소", key="address", width=30)

    def _init_log_table(self) -> None:
        t = self.query_one("#log-table", DataTable)
        t.add_column("날짜", key="date", width=12)
        t.add_column("유형", key="type", width=8)
        t.add_column("딜", key="deal", width=25)
        t.add_column("내용", key="notes", width=45)

    # ── Refresh helpers ────────────────────────────────────────────────────────

    def _refresh_all(self) -> None:
        self._refresh_dashboard()
        self._refresh_pipeline()
        self._refresh_contacts()
        self._refresh_log()

    def _refresh_dashboard(self) -> None:
        today = date.today().isoformat()
        actions = _db.get_today_actions()
        summary = _db.get_pipeline_summary()

        lines: list[str] = []
        lines.append(f"[bold cyan]오늘 ({today})[/bold cyan]\n")

        if actions:
            lines.append("[bold]처리할 딜[/bold]")
            for d in actions:
                acct = _db.get_account(d.account_id) if d.account_id else None
                acct_name = acct.name if acct else "거래처 미지정"
                overdue = d.next_action_date < today if d.next_action_date else False
                flag = "[bold red]⚠ 지남[/bold red]" if overdue else "[yellow]오늘[/yellow]"
                action_txt = d.next_action or "—"
                lines.append(f"  {flag}  [bold]{d.title}[/bold]  ({acct_name})")
                lines.append(f"        → {action_txt}")
        else:
            lines.append("[green]✓ 오늘 처리할 딜이 없습니다.[/green]")

        lines.append("\n[bold]파이프라인 현황[/bold]")
        total_val = 0
        for stage in STAGES[:-2]:
            info = summary.get(stage, {"count": 0, "total": 0})
            cnt, val = info["count"], info["total"]
            total_val += val
            color = _STAGE_STYLE.get(stage, "white")
            if cnt:
                lines.append(f"  [{color}]{stage}[/{color}]  {cnt}건  {val:,}만원")
        lines.append(f"\n  [bold green]활성 딜 합계: {total_val:,}만원[/bold green]")

        self.query_one("#dashboard-content", Static).update("\n".join(lines))

    def _refresh_pipeline(self) -> None:
        t = self.query_one("#pipeline-table", DataTable)
        t.clear()
        today = date.today().isoformat()
        for d in _db.get_deals():
            acct = _db.get_account(d.account_id) if d.account_id else None
            acct_name = acct.name if acct else ""
            stage_cell = Text(d.stage, style=_STAGE_STYLE.get(d.stage, "white"))
            if d.next_action_date and d.next_action_date < today:
                date_cell = Text(d.next_action_date, style="bold red")
            elif d.next_action_date == today:
                date_cell = Text(d.next_action_date, style="bold yellow")
            else:
                date_cell = Text(d.next_action_date or "")
            t.add_row(
                d.title, acct_name, stage_cell,
                f"{d.value:,}" if d.value else "",
                d.next_action or "",
                date_cell,
                key=str(d.id),
            )

    def _refresh_contacts(self) -> None:
        t = self.query_one("#contacts-table", DataTable)
        t.clear()
        for a in _db.get_accounts():
            t.add_row(
                a.name,
                Text(a.tier, style=_TIER_STYLE.get(a.tier, "white")),
                a.phone or "",
                a.address or "",
                key=str(a.id),
            )

    def _refresh_log(self) -> None:
        t = self.query_one("#log-table", DataTable)
        t.clear()
        for act in _db.get_activities():
            deal = _db.get_deal(act.deal_id) if act.deal_id else None
            t.add_row(
                act.date or "",
                Text(act.type, style=_ACT_STYLE.get(act.type, "white")),
                deal.title if deal else "",
                (act.notes or "")[:60],
                key=str(act.id),
            )

    # ── Current tab ────────────────────────────────────────────────────────────

    def _active_tab(self) -> str:
        return str(self.query_one("#tabs", TabbedContent).active)

    # ── Actions ────────────────────────────────────────────────────────────────

    def action_new_item(self) -> None:
        tab = self._active_tab()
        if tab == "tab-pipeline":
            self._open_deal_form(None)
        elif tab == "tab-contacts":
            self._open_account_form(None)
        elif tab == "tab-log":
            # open activity for first active deal
            deals = _db.get_deals()
            if not deals:
                self.notify("활동 기록할 딜이 없습니다.", severity="warning")
                return
            # Try to use currently highlighted pipeline deal
            deal = _db.get_deal(int(self._pipeline_key)) if self._pipeline_key else deals[0]
            self._open_activity_form(deal or deals[0])

    def action_delete_item(self) -> None:
        tab = self._active_tab()
        if tab == "tab-pipeline" and self._pipeline_key:
            deal = _db.get_deal(int(self._pipeline_key))
            if not deal:
                return

            def cb(confirmed: bool) -> None:
                if confirmed:
                    _db.delete_deal(deal.id)
                    self.notify(f"딜 삭제: {deal.title}", severity="warning")
                    self._pipeline_key = None
                    self._refresh_pipeline()
                    self._refresh_dashboard()

            self.push_screen(ConfirmScreen(f"'{deal.title}' 딜을 삭제하시겠습니까?"), cb)

        elif tab == "tab-contacts" and self._contacts_key:
            acct = _db.get_account(int(self._contacts_key))
            if not acct:
                return

            def cb(confirmed: bool) -> None:
                if confirmed:
                    _db.delete_account(acct.id)
                    self.notify(f"거래처 삭제: {acct.name}", severity="warning")
                    self._contacts_key = None
                    self._refresh_contacts()

            self.push_screen(ConfirmScreen(f"'{acct.name}' 거래처를 삭제하시겠습니까?"), cb)

    def action_add_activity(self) -> None:
        if not self._pipeline_key:
            self.notify("파이프라인 탭에서 딜을 선택하세요.", severity="warning")
            return
        deal = _db.get_deal(int(self._pipeline_key))
        if deal:
            self._open_activity_form(deal)

    def action_refresh_all(self) -> None:
        self._refresh_all()
        self.notify("새로고침 완료")

    # ── Form openers ───────────────────────────────────────────────────────────

    def _open_deal_form(self, deal: Optional[Deal]) -> None:
        def cb(result: Optional[Deal]) -> None:
            if result:
                _db.upsert_deal(result)
                verb = "수정" if result.id else "추가"
                self.notify(f"딜 {verb}: {result.title}")
                self._refresh_pipeline()
                self._refresh_dashboard()

        self.push_screen(DealFormScreen(deal), cb)

    def _open_account_form(self, account: Optional[Account]) -> None:
        def cb(result: Optional[Account]) -> None:
            if result:
                _db.upsert_account(result)
                verb = "수정" if result.id else "추가"
                self.notify(f"거래처 {verb}: {result.name}")
                self._refresh_contacts()

        self.push_screen(AccountFormScreen(account), cb)

    def _open_activity_form(self, deal: Deal) -> None:
        def cb(result: Optional[Activity]) -> None:
            if result:
                _db.create_activity(result)
                self.notify(f"활동 기록: {result.type}")
                self._refresh_log()
                self._refresh_dashboard()

        self.push_screen(ActivityFormScreen(deal), cb)

    # ── Row events (highlight = track selection, selected = open edit) ─────────

    @on(DataTable.RowHighlighted, "#pipeline-table")
    def _pipeline_hl(self, event: DataTable.RowHighlighted) -> None:
        self._pipeline_key = event.row_key.value if event.row_key else None

    @on(DataTable.RowSelected, "#pipeline-table")
    def _pipeline_sel(self, event: DataTable.RowSelected) -> None:
        if event.row_key:
            deal = _db.get_deal(int(event.row_key.value))
            if deal:
                self._open_deal_form(deal)

    @on(DataTable.RowHighlighted, "#contacts-table")
    def _contacts_hl(self, event: DataTable.RowHighlighted) -> None:
        self._contacts_key = event.row_key.value if event.row_key else None

    @on(DataTable.RowSelected, "#contacts-table")
    def _contacts_sel(self, event: DataTable.RowSelected) -> None:
        if event.row_key:
            acct = _db.get_account(int(event.row_key.value))
            if acct:
                self._open_account_form(acct)


if __name__ == "__main__":
    CRMApp().run()
