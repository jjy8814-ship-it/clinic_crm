/* ── 피부과 영업 CRM ─────────────────────────────────────────────────────────── */

const API = '/api';

const state = {
  page: 'dashboard',
  stageFilter: 'all',
  accounts: [],
  config: { stages: [], tiers: [], activity_types: [] },
  data: {},
};

// ── Init ───────────────────────────────────────────────────────────────────────

async function init() {
  state.config = await get('/api/config');
  state.accounts = await get('/api/accounts');
  navigate('dashboard');
}

// ── Routing ────────────────────────────────────────────────────────────────────

async function navigate(page) {
  state.page = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page)
  );
  document.getElementById('app').innerHTML = '<div class="loading">불러오는 중...</div>';

  try {
    if (page === 'dashboard') {
      state.data.dashboard = await get('/api/dashboard');
    } else if (page === 'pipeline') {
      [state.data.deals, state.accounts] = await Promise.all([
        get('/api/deals?include_closed=true'), get('/api/accounts'),
      ]);
    } else if (page === 'contacts') {
      state.accounts = await get('/api/accounts');
    } else if (page === 'orders') {
      [state.data.orders, state.accounts] = await Promise.all([
        get('/api/orders'), get('/api/accounts'),
      ]);
      state.orderAccountFilter = 'all';
    }
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div style="padding:60px 40px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-size:16px;font-weight:600;color:var(--gray-900);margin-bottom:8px">데이터를 불러오지 못했습니다</div>
        <div style="font-size:13px;color:var(--text-3);margin-bottom:20px">${esc(e.message)}</div>
        <button class="btn btn-primary" onclick="navigate('${page}')">다시 시도</button>
      </div>`;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app');
  const main = document.querySelector('.main');
  if (state.page !== 'pipeline') {
    app.className = '';
    if (main) main.style.overflow = '';
  } else {
    if (main) main.style.overflow = 'hidden';
  }
  switch (state.page) {
    case 'dashboard':  app.innerHTML = tplDashboard(state.data.dashboard); break;
    case 'pipeline':   app.innerHTML = tplPipeline(state.data.deals); break;
    case 'contacts':   app.innerHTML = tplContacts(state.accounts); break;
    case 'orders':     app.innerHTML = tplOrders(state.data.orders); break;
  }
}

// ── Currency helpers ───────────────────────────────────────────────────────────

function fmtVal(v) {
  if (!v) return '';
  return `${Number(v).toLocaleString()}원`;
}

function fmtValShort(v) {
  if (!v) return '0원';
  const n = Number(v);
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')}억원`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString()}원`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

function tplDashboard(d) {
  const today = new Date();
  const dayNames = ['일','월','화','수','목','금','토'];
  const dateStr = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일 (${dayNames[today.getDay()]})`;

  const todayCount = d.today_actions.length;
  const stages = state.config.stages.slice(0, -2);
  const maxTotal = Math.max(1, ...stages.map(s => (d.summary[s]?.total || 0)));
  const stageColors = {
    '제안 완료': '#7B61FF', '미팅 확정': '#1B64DA', '계약 대기중': '#FF6D00',
  };

  const summaryRows = stages.map(s => {
    const info = d.summary[s] || { count: 0, total: 0 };
    if (!info.count) return '';
    const pct = Math.max(4, Math.round((info.total / maxTotal) * 100));
    return `
      <div class="pipeline-row">
        <span class="pipeline-stage">${badge(s)}</span>
        <div class="pipeline-bar-wrap">
          <div class="pipeline-bar" style="width:${pct}%;background:${stageColors[s]||'#8B95A1'}"></div>
        </div>
        <span class="pipeline-numbers"><strong>${info.count}건</strong>  ${fmtValShort(info.total)}</span>
      </div>`;
  }).join('');

  const actionItems = d.today_actions.length
    ? d.today_actions.map(a => {
        const cls = a.is_overdue ? 'overdue' : 'today';
        const dtxt = a.is_overdue ? overdueText(a.next_action_date) : '오늘';
        return `
          <div class="action-item" onclick="openDealById(${a.id})">
            ${badge(a.stage)}
            <div class="action-info">
              <div class="action-deal">${esc(a.title)} ${a.account_name ? `<span style="font-weight:400;color:var(--text-3)">· ${esc(a.account_name)}</span>` : ''}</div>
              <div class="action-text">${esc(a.next_action) || '—'}</div>
            </div>
            <span class="action-date ${cls}">${dtxt}</span>
          </div>`;
      }).join('')
    : `<div class="empty-state" style="padding:var(--s8) var(--s5)">
         <div class="empty-state-icon">✓</div>
         <div class="empty-state-title">오늘 처리할 딜이 없습니다</div>
       </div>`;

  return `
    <div class="page-header">
      <h1 class="page-title">대시보드</h1>
      <p class="page-subtitle">${dateStr}</p>
    </div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">활성 리드</div>
        <div class="stat-value highlight">${d.active_count}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 예상 금액</div>
        <div class="stat-value">${fmtValShort(d.total_value) || '0원'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 처리할 딜</div>
        <div class="stat-value ${todayCount ? 'urgent' : ''}">${todayCount}건</div>
      </div>
    </div>
    <div class="section">
      <div class="section-header"><span class="section-title">오늘 할 일</span></div>
      <div class="card"><div class="action-list">${actionItems}</div></div>
    </div>
    <div class="section">
      <div class="section-header"><span class="section-title">파이프라인 현황</span></div>
      <div class="card">
        ${summaryRows || `<div class="empty-state" style="padding:var(--s6)"><div class="empty-state-title">등록된 리드가 없습니다</div></div>`}
      </div>
    </div>`;
}

// ── Kanban drag state ──────────────────────────────────────────────────────────
let _dragId = null;

function dragStart(event, id) {
  _dragId = id;
  event.dataTransfer.effectAllowed = 'move';
  setTimeout(() => event.target.classList.add('dragging'), 0);
}
function dragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}
function dragLeave(event) {
  event.currentTarget.classList.remove('drag-over');
}
async function dropCard(event, stage) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!_dragId) return;
  const deal = (state.data.deals || []).find(d => d.id === _dragId);
  _dragId = null;
  if (!deal || deal.stage === stage) return;
  await put(`/api/deals/${deal.id}`, { ...dealBody(deal), stage });
  showToast(`${esc(deal.title)} → ${stage}`);
  state.data.deals = await get('/api/deals?include_lost=true');
  render();
}
function dealBody(d) {
  return { title: d.title, account_id: d.account_id, stage: d.stage,
    value: d.value, next_action: d.next_action,
    next_action_date: d.next_action_date, notes: d.notes };
}
function openDealModalInStage(stage) { openDealModal({ stage }); }

function editStageName(oldName) {
  openModal('단계명 수정', `
    <div class="form">
      <div class="form-group">
        <label class="form-label">단계 이름</label>
        <input class="form-input" id="stage-rename-input" value="${esc(oldName)}" maxlength="30">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-secondary" onclick="closeModal()">취소</button>
        <button class="btn btn-primary" onclick="saveStageRename('${oldName.replace(/'/g,"\\'")}')">저장</button>
      </div>
    </div>
  `);
  setTimeout(() => { const el = document.getElementById('stage-rename-input'); if(el){el.focus();el.select();} }, 50);
}

async function saveStageRename(oldName) {
  const input = document.getElementById('stage-rename-input');
  const newName = (input ? input.value : '').trim();
  if (!newName || newName === oldName) { closeModal(); return; }
  try {
    const r = await fetch('/api/stages/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    if (!r.ok) throw new Error((await r.json()).detail || '오류');
    const data = await r.json();
    state.config.stages = data.stages;
    (state.data.deals || []).forEach(d => { if (d.stage === oldName) d.stage = newName; });
    closeModal();
    toast(`"${newName}"으로 변경되었습니다.`);
    render();
  } catch(e) { toast('저장 실패: ' + e.message, 'error'); }
}

function tplPipeline(deals) {
  document.getElementById('app').className = 'app-kanban';

  const kanbanStages = state.config.stages || [];
  const today = new Date().toISOString().split('T')[0];

  const COL = {
    '제안 완료':   { dot:'#7B61FF', avatarBg:'#F0EEFF', avatarFg:'#7B61FF' },
    '미팅 확정':   { dot:'#1B64DA', avatarBg:'#EEF4FF', avatarFg:'#1B64DA' },
    '계약 대기중': { dot:'#FF6D00', avatarBg:'#FFF4EB', avatarFg:'#E65100' },
    '계약완료':    { dot:'#00B140', avatarBg:'#EDFAF4', avatarFg:'#00B140' },
    'Lost':        { dot:'#B0B8C1', avatarBg:'#F2F4F6', avatarFg:'#8B95A1' },
  };

  const cols = kanbanStages.map(stage => {
    const c = COL[stage] || { dot:'#B0B8C1', avatarBg:'#F9FAFB', avatarFg:'#8B95A1' };
    const stageDeals = (deals || []).filter(d => d.stage === stage);
    const totalVal   = stageDeals.reduce((s, d) => s + (d.value || 0), 0);
    const isLost     = stage === 'Lost' || stage === '계약완료';

    const cards = stageDeals.map(d => {
      const overdue = d.next_action_date && d.next_action_date < today;
      const isToday = d.next_action_date === today;
      const dateCls = overdue ? 'overdue' : isToday ? 'today' : '';
      const dateTxt = overdue ? overdueText(d.next_action_date) : isToday ? '오늘' : (d.next_action_date || '');
      const titleEsc = esc(d.title).replace(/'/g, "\\'");
      const initial = (d.title || d.account_name || '?')[0];
      const acct = d.account_id ? state.accounts.find(a => a.id === d.account_id) : null;
      const contact = acct?.contact_name || '';

      return `
        <div class="kboard-card" draggable="true"
          ondragstart="dragStart(event,${d.id})"
          ondragend="this.classList.remove('dragging')"
          onclick="openDealById(${d.id})">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:9px">
            <div style="width:32px;height:32px;border-radius:7px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:${c.avatarBg};color:${c.avatarFg}">${esc(initial)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:600;color:#191F28;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.title)}</div>
              ${contact ? `<div style="font-size:12px;color:#8B95A1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(contact)}</div>` : (d.account_name && d.account_name !== d.title ? `<div style="font-size:12px;color:#8B95A1">${esc(d.account_name)}</div>` : '')}
            </div>
          </div>
          ${d.value ? `<div style="font-size:15px;font-weight:700;color:#191F28;margin-bottom:8px;letter-spacing:-0.3px">${fmtVal(d.value)}</div>` : ''}
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding-top:8px;border-top:1px solid #F0F1F3">
            <span style="font-size:12px;color:#8B95A1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.next_action ? esc(d.next_action) : '<span style="color:#D1D5DB">다음 액션 없음</span>'}</span>
            ${dateTxt ? `<span class="deal-date ${dateCls}" style="flex-shrink:0;font-size:12px">${dateTxt}</span>` : ''}
            <div class="kcard-btns" onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-secondary" style="height:26px;padding:0 10px;font-size:11px" onclick="openActivityModal(${d.id},'${titleEsc}')">활동</button>
              <button class="btn btn-sm btn-danger" style="height:26px;padding:0 10px;font-size:11px" onclick="confirmDeleteDeal(${d.id},'${titleEsc}')">삭제</button>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div style="flex:1;min-width:0;border-radius:10px;background:#F4F5F7;overflow-y:auto"
        ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropCard(event,'${stage}')">
        <div style="position:sticky;top:0;z-index:2;background:#F4F5F7;border-radius:10px 10px 0 0;padding:14px 14px 10px;border-bottom:1px solid rgba(0,0,0,0.07)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="width:9px;height:9px;border-radius:50%;background:${c.dot};display:inline-block;flex-shrink:0"></span>
            <span style="font-size:13px;font-weight:700;color:#191F28;flex:1">${stage}</span>
            <button onclick="event.stopPropagation();editStageName('${stage.replace(/'/g,"\\'")}')" title="단계명 수정"
              style="background:none;border:none;cursor:pointer;color:#B0B8C1;font-size:13px;padding:2px 4px;border-radius:4px;line-height:1"
              onmouseover="this.style.color='#4E5968'" onmouseout="this.style.color='#B0B8C1'">✏</button>
            <span style="font-size:11px;font-weight:600;background:rgba(0,0,0,0.08);color:#4E5968;border-radius:20px;padding:1px 7px">${stageDeals.length}</span>
          </div>
          <div style="font-size:17px;font-weight:700;color:#191F28;padding-left:17px;letter-spacing:-0.4px">${totalVal ? fmtValShort(totalVal) : '—'}</div>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:7px">
          ${cards || `<div style="text-align:center;padding:32px 0;color:#D1D5DB;font-size:13px">리드 없음</div>`}
        </div>
        ${!isLost ? `<div style="position:sticky;bottom:0;background:#F4F5F7;padding:4px 8px 10px">
          <button style="display:block;width:100%;padding:9px;background:transparent;border:1.5px dashed #D1D5DB;border-radius:7px;color:#8B95A1;font-size:13px;cursor:pointer" onclick="openDealModalInStage('${stage}')">+ 추가</button>
        </div>` : ''}
      </div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 20px 0;flex-shrink:0">
      <h1 class="page-title" style="margin:0">리드 관리</h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="openImportModal('deals')">CSV 가져오기</button>
        <button class="btn btn-primary" onclick="openDealModal(null)">+ 새 리드 추가</button>
      </div>
    </div>
    <div style="display:flex;flex-direction:row;gap:12px;flex:1;min-height:0;padding:12px 20px 16px;overflow-x:auto;align-items:stretch">${cols}</div>`;
}


function tplContacts(accounts) {
  const cards = accounts.length
    ? accounts.map(a => `
        <div class="account-card" onclick="openAccountModal(${a.id})">
          <div class="account-card-header">
            <div>
              <div class="account-name">${esc(a.name)}</div>
              <div style="margin-top:6px">${badge2(a.tier, tierBadgeCls(a.tier))}</div>
            </div>
            <div class="account-card-actions" onclick="event.stopPropagation()">
              <button class="btn btn-sm btn-secondary" onclick="openAccountModal(${a.id})">수정</button>
              <button class="btn btn-sm btn-danger" onclick="confirmDeleteAccount(${a.id},'${esc(a.name).replace(/'/g,"\\'")}')">삭제</button>
            </div>
          </div>
          <div class="account-info">
            ${a.contact_name ? `<div class="account-info-row">👤 ${esc(a.contact_name)}</div>` : ''}
            ${a.phone        ? `<div class="account-info-row">📞 ${esc(a.phone)}</div>` : ''}
            ${a.email        ? `<div class="account-info-row">✉ ${esc(a.email)}</div>` : ''}
            ${a.address      ? `<div class="account-info-row">📍 ${esc(a.address)}</div>` : ''}
          </div>
          <div class="account-card-footer">
            <span class="account-deal-count">딜 <strong>${a.deal_count}</strong>건</span>
            <button class="btn-ghost btn btn-sm" onclick="event.stopPropagation();addDealForAccount(${a.id})">+ 리드 추가</button>
          </div>
        </div>`)
      .join('')
    : `<div class="empty-state" style="grid-column:1/-1">
         <div class="empty-state-icon">🏥</div>
         <div class="empty-state-title">등록된 거래처가 없습니다</div>
         <div class="empty-state-desc">+ 거래처 추가 버튼으로 첫 번째 피부과 클리닉을 등록해보세요</div>
         <button class="btn btn-primary" onclick="openAccountModal(null)">+ 거래처 추가</button>
       </div>`;

  return `
    <div class="page-header-row">
      <h1 class="page-title">거래처</h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="openImportModal('accounts')">CSV 가져오기</button>
        <button class="btn btn-primary" onclick="openAccountModal(null)">+ 거래처 추가</button>
      </div>
    </div>
    <div class="account-grid">${cards}</div>`;
}

// ── P&L ───────────────────────────────────────────────────────────────────────

function tplPL(pl, expenses) {
  const t = pl?.total || {};
  const rows = pl?.rows || [];
  const exps = expenses || [];

  const fmt  = v => (v || 0).toLocaleString() + '원';
  const sign = v => v >= 0
    ? `<span style="color:#00B140">${fmt(v)}</span>`
    : `<span style="color:#F04452">${fmt(v)}</span>`;

  const summaryCards = [
    { label: '총 매출',     value: fmt(t.revenue),   color: '#191F28' },
    { label: '매출원가',    value: fmt(t.cogs),      color: '#F04452' },
    { label: '판관비 합계', value: fmt(t.expenses),  color: '#FF6D00' },
    { label: '영업이익',    value: t.operating >= 0 ? fmt(t.operating) : fmt(t.operating), color: (t.operating||0) >= 0 ? '#00B140' : '#F04452' },
  ].map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value" style="color:${c.color}">${c.value}</div>
    </div>`).join('');

  const monthRows = rows.length ? rows.map(r => `
    <tr>
      <td style="font-weight:600">${r.month}</td>
      <td style="text-align:right">${r.units}대</td>
      <td style="text-align:right">${(r.revenue).toLocaleString()}</td>
      <td style="text-align:right;color:#F04452">${(r.cogs).toLocaleString()}</td>
      <td style="text-align:right;color:#FF6D00">${(r.expenses).toLocaleString()}</td>
      <td style="text-align:right;font-weight:700">${sign(r.operating)}</td>
    </tr>`).join('')
  : `<tr><td colspan="6" style="text-align:center;padding:24px;color:#B0B8C1">발주 데이터가 없습니다</td></tr>`;

  const expRows = exps.length ? exps.map(e => `
    <tr>
      <td>${esc(e.month || '—')}</td>
      <td>${esc(e.name)}</td>
      <td style="text-align:right;font-weight:600">${(e.amount).toLocaleString()}원</td>
      <td>${esc(e.notes || '')}</td>
      <td style="text-align:center">
        <button class="btn btn-sm btn-secondary" style="height:26px;padding:0 10px;font-size:11px" onclick="openExpenseModal(${e.id})">수정</button>
        <button class="btn btn-sm btn-danger"    style="height:26px;padding:0 10px;font-size:11px" onclick="confirmDeleteExpense(${e.id},'${esc(e.name).replace(/'/g,"\\'")}')">삭제</button>
      </td>
    </tr>`).join('')
  : `<tr><td colspan="5" style="text-align:center;padding:24px;color:#B0B8C1">등록된 판관비 항목이 없습니다</td></tr>`;

  return `
    <div class="page-header-row">
      <h1 class="page-title">P&L 관리</h1>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:var(--s5)">${summaryCards}</div>

    <div class="card" style="margin-bottom:var(--s5);overflow-x:auto">
      <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);font-weight:700;font-size:15px">월별 손익</div>
      <table class="order-table">
        <thead><tr>
          <th>월</th><th style="text-align:right">판매량</th>
          <th style="text-align:right">매출</th><th style="text-align:right">원가</th>
          <th style="text-align:right">판관비</th><th style="text-align:right">영업이익</th>
        </tr></thead>
        <tbody>${monthRows}</tbody>
      </table>
    </div>

    <div class="card" style="overflow-x:auto">
      <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:15px">판관비 항목</span>
        <button class="btn btn-primary" style="height:34px;padding:0 14px;font-size:13px" onclick="openExpenseModal(null)">+ 항목 추가</button>
      </div>
      <table class="order-table">
        <thead><tr><th>월</th><th>항목명</th><th style="text-align:right">금액</th><th>메모</th><th style="text-align:center">관리</th></tr></thead>
        <tbody>${expRows}</tbody>
      </table>
    </div>`;
}

function openExpenseModal(idOrNull) {
  const e = typeof idOrNull === 'number'
    ? (state.data.expenses || []).find(x => x.id === idOrNull) || {}
    : {};
  const today = new Date().toISOString().slice(0, 7);
  openModal(e.id ? '판관비 수정' : '판관비 추가', `
    <form class="form" id="expense-form" onsubmit="saveExpense(event)" data-id="${e.id || ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">월 <span class="req">*</span></label>
          <input class="form-input" name="month" type="month" value="${e.month || today}" required>
        </div>
        <div class="form-group">
          <label class="form-label">금액 (원) <span class="req">*</span></label>
          <input class="form-input" name="amount" type="number" value="${e.amount || ''}" placeholder="0" min="0" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">항목명 <span class="req">*</span></label>
        <input class="form-input" name="name" value="${esc(e.name || '')}" placeholder="인건비, 임대료, 마케팅비 등" required>
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <input class="form-input" name="notes" value="${esc(e.notes || '')}">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

async function saveExpense(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const body = {
    name:   fd.get('name').trim(),
    amount: parseInt(fd.get('amount')) || 0,
    month:  fd.get('month') || '',
    notes:  fd.get('notes').trim(),
  };
  const id = form.dataset.id;
  await (id ? put(`/api/expenses/${id}`, body) : post('/api/expenses', body));
  closeModal();
  showToast(id ? '수정되었습니다' : '항목이 추가되었습니다');
  [state.data.pl, state.data.expenses] = await Promise.all([get('/api/pl'), get('/api/expenses')]);
  render();
}

function confirmDeleteExpense(id, name) {
  openModal('판관비 삭제', `
    <div style="text-align:center;padding:var(--s4) 0">
      <p style="margin-bottom:var(--s5)">"${esc(name)}" 항목을 삭제할까요?</p>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn btn-secondary" onclick="closeModal()">취소</button>
        <button class="btn btn-danger"    onclick="deleteExpense(${id})">삭제</button>
      </div>
    </div>`);
}

async function deleteExpense(id) {
  await del(`/api/expenses/${id}`);
  closeModal();
  showToast('삭제되었습니다');
  [state.data.pl, state.data.expenses] = await Promise.all([get('/api/pl'), get('/api/expenses')]);
  render();
}

function tplOrders(orders) {
  const all = orders || [];
  const filter = state.orderAccountFilter || 'all';

  // Build per-hospital summary
  const byAccount = {};
  all.forEach(o => {
    const key = o.account_id || 0;
    if (!byAccount[key]) byAccount[key] = { name: o.account_name || '거래처 미지정', qty: 0, total: 0 };
    byAccount[key].qty   += o.quantity;
    byAccount[key].total += o.total_price || 0;
  });

  const filtered = filter === 'all' ? all : all.filter(o => String(o.account_id) === filter);

  // Hospital filter pills
  const accountPills = [['all', `전체 (${all.length}건)`],
    ...Object.entries(byAccount).map(([id, v]) => [id, `${v.name} (${v.qty}대)`])
  ].map(([id, label]) => `
    <button class="filter-tab ${filter === id ? 'active' : ''}" onclick="setOrderFilter('${id}')">${label}</button>
  `).join('');

  const totalQty   = all.reduce((s, o) => s + o.quantity, 0);
  const totalValue = all.reduce((s, o) => s + (o.total_price || 0), 0);

  const statusBadge = s => {
    const cls = s === '납품완료' ? 'badge-계약완료' : s === '취소' ? 'badge-이탈' : 'badge-제안';
    return `<span class="badge ${cls}">${s}</span>`;
  };

  const rows = filtered.length
    ? filtered.map(o => `
        <tr onclick="openOrderModal(${o.id})" style="cursor:pointer">
          <td>${esc(o.account_name || '—')}</td>
          <td>${esc(o.product_name)}</td>
          <td style="text-align:center;font-weight:600">${o.quantity}대</td>
          <td style="text-align:right">${fmtVal(o.unit_price)}</td>
          <td style="text-align:right;font-weight:600">${fmtVal(o.total_price)}</td>
          <td>${o.order_date || '—'}</td>
          <td>${o.delivery_date || '—'}</td>
          <td>${statusBadge(o.status)}</td>
          <td onclick="event.stopPropagation()" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" onclick="printOrderPDF(${o.id})">발주서</button>
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteOrder(${o.id},'${esc(o.account_name||'').replace(/'/g,"\\'")}')">삭제</button>
          </td>
        </tr>`)
      .join('')
    : `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-3)">발주 내역이 없습니다</td></tr>`;

  return `
    <div class="page-header-row">
      <h1 class="page-title">발주 현황</h1>
      <button class="btn btn-primary" onclick="openOrderModal(null)">+ 발주 등록</button>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:var(--s5)">
      <div class="stat-card">
        <div class="stat-label">총 발주 건수</div>
        <div class="stat-value highlight">${all.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 발주 수량</div>
        <div class="stat-value">${totalQty}대</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 발주 금액</div>
        <div class="stat-value">${fmtValShort(totalValue)}</div>
      </div>
    </div>
    <div class="filter-tabs" style="margin-bottom:var(--s4)">${accountPills}</div>
    <div class="card" style="overflow-x:auto">
      <table class="order-table">
        <thead>
          <tr>
            <th>병원명</th><th>제품명</th><th style="text-align:center">수량</th>
            <th style="text-align:right">단가</th><th style="text-align:right">합계</th>
            <th>발주일</th><th>납품일</th><th>상태</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}


// ── Modals ─────────────────────────────────────────────────────────────────────

function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-backdrop').classList.add('open');
  document.getElementById('modal-wrap').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  document.getElementById('modal-wrap').classList.remove('open');
}

function openDealModal(dealOrNull) {
  const d = dealOrNull || {};
  const acct = d.account_id ? state.accounts.find(a => a.id === d.account_id) : null;
  const hospitalName = d.account_name || acct?.name || '';
  const contactName  = acct?.contact_name || '';
  const phone        = acct?.phone || '';
  const email        = acct?.email || '';
  const acctDatalist = state.accounts.map(a => `<option value="${esc(a.name)}">`).join('');
  const stageOpts    = state.config.stages.map(s =>
    `<option value="${s}" ${(d.stage || '제안 완료') === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  openModal(d.id ? '리드 편집' : '새 리드 추가', `
    <form class="form" id="deal-form" onsubmit="saveDeal(event)" data-id="${d.id || ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">병원명 <span class="req">*</span></label>
          <input class="form-input" name="hospital_name" list="acct-datalist"
            value="${esc(hospitalName)}" placeholder="강남스킨케어의원" required>
          <datalist id="acct-datalist">${acctDatalist}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">고객명 (담당자)</label>
          <input class="form-input" name="contact_name" value="${esc(contactName)}" placeholder="홍길동 원장">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">연락처</label>
          <input class="form-input" name="phone" value="${esc(phone)}" placeholder="010-1234-5678">
        </div>
        <div class="form-group">
          <label class="form-label">이메일</label>
          <input class="form-input" name="email" type="email" value="${esc(email)}" placeholder="doctor@clinic.com">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">단계</label>
          <select class="form-select" name="stage">${stageOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">금액 (원)</label>
          <input class="form-input" name="value" type="number" value="${d.value || ''}" placeholder="0" min="0">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">다음 액션</label>
        <input class="form-input" name="next_action" value="${esc(d.next_action||'')}" placeholder="제안서 발송, 팔로업 통화">
      </div>
      <div class="form-group">
        <label class="form-label">다음 액션 날짜</label>
        <input class="form-input" name="next_action_date" type="date" value="${d.next_action_date||''}">
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" name="notes" placeholder="특이사항, 원장 성향, 예산 메모 등">${esc(d.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

async function openDealById(id) {
  const deals = state.data.deals || await get('/api/deals');
  const deal = deals.find(d => d.id === id);
  if (deal) openDealModal(deal);
}


function openAccountModal(idOrNull) {
  const a = typeof idOrNull === 'number'
    ? state.accounts.find(x => x.id === idOrNull) || {}
    : {};
  const tierOpts = state.config.tiers.map(t =>
    `<option value="${t}" ${(a.tier || '개인의원') === t ? 'selected' : ''}>${t}</option>`
  ).join('');

  openModal(a.id ? '거래처 편집' : '새 거래처 추가', `
    <form class="form" id="account-form" onsubmit="saveAccount(event)" data-id="${a.id || ''}">
      <div class="form-group">
        <label class="form-label">병원명 <span class="req">*</span></label>
        <input class="form-input" name="name" value="${esc(a.name||'')}" placeholder="예: 강남스킨케어의원" required>
      </div>
      <div class="form-group">
        <label class="form-label">분류</label>
        <select class="form-select" name="tier">${tierOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">고객명 (담당자)</label>
          <input class="form-input" name="contact_name" value="${esc(a.contact_name||'')}" placeholder="홍길동 원장">
        </div>
        <div class="form-group">
          <label class="form-label">전화번호</label>
          <input class="form-input" name="phone" value="${esc(a.phone||'')}" placeholder="02-1234-5678">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">이메일</label>
        <input class="form-input" name="email" type="email" value="${esc(a.email||'')}" placeholder="doctor@clinic.com">
      </div>
      <div class="form-group">
        <label class="form-label">주소</label>
        <input class="form-input" name="address" value="${esc(a.address||'')}" placeholder="서울시 강남구...">
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" name="notes" placeholder="원장 성향, 특이사항 등">${esc(a.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

function openActivityModal(dealId, dealTitle) {
  const actOpts = state.config.activity_types.map(t =>
    `<option value="${t}">${t}</option>`
  ).join('');
  const today = new Date().toISOString().split('T')[0];

  openModal('활동 기록', `
    <form class="form" id="activity-form" onsubmit="saveActivity(event)" data-deal-id="${dealId}">
      <div class="form-group">
        <label class="form-label">리드</label>
        <div style="font-size:15px;font-weight:600;color:var(--text-1);padding:12px 14px;background:var(--gray-100);border-radius:var(--r-md)">${esc(dealTitle)}</div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">활동 유형</label>
          <select class="form-select" name="type">${actOpts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">날짜</label>
          <input class="form-input" name="date" type="date" value="${today}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">내용 <span class="req">*</span></label>
        <textarea class="form-textarea" name="notes" placeholder="통화 내용, 미팅 결과, 다음 단계 등..." required style="min-height:120px"></textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

// ── Orders ────────────────────────────────────────────────────────────────────

function setOrderFilter(id) {
  state.orderAccountFilter = id;
  render();
}

const PRODUCT_PRICES = {
  '톰더글로우':     0,
  '톰더글로우 프로': 438900,
};

function calcOrderTotal() {
  const qty   = parseInt(document.getElementById('order-quantity')?.value) || 0;
  const price = parseInt(document.getElementById('order-unit-price')?.value) || 0;
  const el    = document.getElementById('order-total');
  if (el) el.textContent = (qty * price).toLocaleString() + '원';
}

function onProductChange(sel) {
  const price = PRODUCT_PRICES[sel.value];
  const priceInput = document.getElementById('order-unit-price');
  if (priceInput && price != null) { priceInput.value = price || ''; calcOrderTotal(); }
}

function openOrderModal(idOrNull) {
  const o = typeof idOrNull === 'number'
    ? (state.data.orders || []).find(x => x.id === idOrNull) || {}
    : {};
  const today = new Date().toISOString().split('T')[0];
  const acctOpts = state.accounts.map(a =>
    `<option value="${a.id}" ${o.account_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`
  ).join('');
  const statusOpts = (state.config.order_statuses || ['발주완료','납품완료','취소']).map(s =>
    `<option value="${s}" ${(o.status || '발주완료') === s ? 'selected' : ''}>${s}</option>`
  ).join('');
  const currentProduct = o.product_name || '톰더글로우 프로';
  const productOpts = Object.keys(PRODUCT_PRICES).map(p =>
    `<option value="${p}" ${currentProduct === p ? 'selected' : ''}>${p}${PRODUCT_PRICES[p] ? ' — ' + PRODUCT_PRICES[p].toLocaleString() + '원' : ''}</option>`
  ).join('');

  openModal(o.id ? '발주 편집' : '발주 등록', `
    <form class="form" id="order-form" onsubmit="saveOrder(event)" data-id="${o.id || ''}">
      <div class="form-group">
        <label class="form-label">병원명 <span class="req">*</span></label>
        <select class="form-select" name="account_id" required>
          <option value="">선택</option>
          ${acctOpts}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">제품명</label>
          <select class="form-select" name="product_name" onchange="onProductChange(this)">
            ${productOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">수량 (대)</label>
          <input class="form-input" id="order-quantity" name="quantity" type="number" value="${o.quantity || 1}" min="1" oninput="calcOrderTotal()">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">공급가 (원, VAT포함)</label>
        <input class="form-input" id="order-unit-price" name="unit_price" type="number" value="${o.unit_price || PRODUCT_PRICES[currentProduct] || ''}" placeholder="0" min="0" oninput="calcOrderTotal()">
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;background:#F4F5F7;border-radius:8px;padding:12px 16px">
        <span style="font-size:13px;font-weight:600;color:#4E5968">총 매출</span>
        <span id="order-total" style="font-size:18px;font-weight:700;color:#191F28">${((o.quantity||1)*(o.unit_price||PRODUCT_PRICES[currentProduct]||0)).toLocaleString()}원</span>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">발주일</label>
          <input class="form-input" name="order_date" type="date" value="${o.order_date || today}">
        </div>
        <div class="form-group">
          <label class="form-label">납품 요청일</label>
          <input class="form-input" name="delivery_date" type="date" value="${o.delivery_date || ''}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">상태</label>
        <select class="form-select" name="status">${statusOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" name="notes">${esc(o.notes || '')}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        ${o.id ? `<button type="button" class="btn btn-secondary btn-full" onclick="closeModal();printOrderPDF(${o.id})">발주서 PDF</button>` : ''}
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

async function saveOrder(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const body = {
    account_id:    parseInt(fd.get('account_id')) || null,
    product_name:  fd.get('product_name').trim() || '톰더글로우',
    quantity:      parseInt(fd.get('quantity')) || 1,
    unit_price:    parseInt(fd.get('unit_price')) || 0,
    order_date:    fd.get('order_date') || '',
    delivery_date: fd.get('delivery_date') || '',
    status:        fd.get('status') || '발주완료',
    notes:         fd.get('notes').trim(),
  };
  const id = form.dataset.id;
  const saved = await (id ? put(`/api/orders/${id}`, body) : post('/api/orders', body));
  closeModal();
  showToast(id ? '발주가 수정되었습니다' : '발주가 등록되었습니다');
  state.data.orders = await get('/api/orders');
  render();
  // Offer PDF after new order
  if (!id) printOrderPDF(saved.id);
}

function confirmDeleteOrder(id, name) {
  openModal('발주 삭제', `
    <div class="confirm-body">
      <div class="confirm-icon">🗑</div>
      <div class="confirm-msg">'${esc(name)}' 발주를 삭제하시겠습니까?</div>
      <div class="confirm-sub">삭제된 발주는 복구할 수 없습니다.</div>
      <button class="btn btn-danger btn-full" onclick="deleteOrder(${id})">삭제</button>
      <div style="margin-top:12px"><button class="btn-ghost" onclick="closeModal()">취소</button></div>
    </div>`);
}

async function deleteOrder(id) {
  await del(`/api/orders/${id}`);
  closeModal();
  showToast('발주가 삭제되었습니다');
  state.data.orders = await get('/api/orders');
  render();
}

function printOrderPDF(id) {
  const o = (state.data.orders || []).find(x => x.id === id);
  if (!o) return;
  const acct = state.accounts.find(a => a.id === o.account_id) || {};
  const total = (o.quantity * o.unit_price).toLocaleString();
  const unitFmt = Number(o.unit_price).toLocaleString();
  const orderNo = String(o.id).padStart(4, '0');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>발주서 #${orderNo}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif; font-size:12pt; color:#191F28; padding:20mm; }
  h1 { font-size:22pt; font-weight:700; text-align:center; margin-bottom:6mm; letter-spacing:6px; }
  .meta { display:flex; justify-content:space-between; margin-bottom:8mm; font-size:10pt; color:#4E5968; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:6mm; margin-bottom:8mm; }
  .party-box { border:1px solid #D1D5DB; border-radius:6px; padding:4mm 5mm; }
  .party-box h3 { font-size:9pt; color:#8B95A1; margin-bottom:3mm; }
  .party-box p { font-size:11pt; font-weight:600; margin-bottom:1.5mm; }
  .party-box span { font-size:9pt; color:#4E5968; }
  table { width:100%; border-collapse:collapse; margin-bottom:6mm; }
  thead tr { background:#1B64DA; color:#fff; }
  th { padding:3mm 4mm; font-size:10pt; font-weight:600; text-align:left; }
  td { padding:3mm 4mm; font-size:10pt; border-bottom:1px solid #E8EAED; }
  .num { text-align:right; }
  .center { text-align:center; }
  .total-row { background:#F2F4F6; }
  .total-row td { font-size:12pt; font-weight:700; }
  .footer { margin-top:10mm; text-align:right; font-size:10pt; color:#4E5968; }
  .sign { display:inline-block; border-top:1px solid #191F28; margin-top:12mm; padding-top:2mm; min-width:40mm; text-align:center; font-size:9pt; }
  @media print { body { padding:15mm; } }
</style>
</head>
<body>
  <h1>발 주 서</h1>
  <div class="meta">
    <span>발주번호: PO-${orderNo}</span>
    <span>발주일: ${o.order_date || ''}</span>
    ${o.delivery_date ? `<span>납품 요청일: ${o.delivery_date}</span>` : ''}
  </div>
  <div class="parties">
    <div class="party-box">
      <h3>수 신 (병원)</h3>
      <p>${esc(o.account_name || '—')}</p>
      ${acct.contact_name ? `<span>담당: ${esc(acct.contact_name)}</span><br>` : ''}
      ${acct.phone ? `<span>연락처: ${esc(acct.phone)}</span><br>` : ''}
      ${acct.address ? `<span>주소: ${esc(acct.address)}</span>` : ''}
    </div>
    <div class="party-box">
      <h3>공 급 자</h3>
      <p>주식회사 앳홈</p>
      <span>사업자번호: 136-81-34676</span><br>
      <span>대표: 양정호</span><br>
      <span>주소: 서울시 성동구 아차산로 6, 6-7층</span>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>번호</th><th>품명</th><th class="center">수량</th><th class="num">단가</th><th class="num">금액</th><th>비고</th></tr>
    </thead>
    <tbody>
      <tr>
        <td class="center">1</td>
        <td>${esc(o.product_name)}</td>
        <td class="center">${o.quantity}대</td>
        <td class="num">${unitFmt}원</td>
        <td class="num">${total}원</td>
        <td>${esc(o.notes || '')}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" style="text-align:right">합 계</td>
        <td class="num">${total}원</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="footer">
    <div class="sign">공급자 (인) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
  </div>
  <script>window.onload=()=>{window.print();}<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  w.document.write(html);
  w.document.close();
}

// ── CSV Import modal ───────────────────────────────────────────────────────────

function openImportModal(type) {
  const label = type === 'deals' ? '리드/딜' : '거래처';
  const endpoint = type === 'deals' ? '/api/import/deals' : '/api/import/accounts';

  const templateCols = type === 'deals'
    ? '병원명,고객명,이메일,전화번호'
    : '거래처 이름,분류,고객명,이메일,전화번호,주소,메모';
  const templateEx = type === 'deals'
    ? '강남스킨케어의원,홍길동,hong@skinclinic.com,02-1234-5678'
    : '강남스킨케어의원,개인의원,홍길동,hong@skinclinic.com,02-1234-5678,서울시 강남구,';

  openModal(`${label} CSV 가져오기`, `
    <div class="form">
      <div style="background:var(--blue-50);border-radius:var(--r-md);padding:var(--s4)">
        <div style="font-size:13px;font-weight:600;color:var(--blue-500);margin-bottom:6px">CSV 파일 형식</div>
        <div style="font-size:12px;color:var(--text-2);font-family:monospace;word-break:break-all">${templateCols}</div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn-ghost" onclick="downloadTemplate('${type}','${templateCols}','${templateEx}')">📥 템플릿 다운로드</button>
      </div>
      <div class="form-group">
        <label class="form-label">CSV 파일 선택 <span class="req">*</span></label>
        <input class="form-input" id="csv-file-input" type="file" accept=".csv,.txt" style="padding:10px 14px;height:auto;cursor:pointer">
      </div>
      <div id="import-result" style="display:none"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-primary btn-full" onclick="handleImport('${endpoint}')">가져오기</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </div>`);
}

async function handleImport(endpoint) {
  const input = document.getElementById('csv-file-input');
  if (!input?.files?.length) {
    showToast('CSV 파일을 선택해주세요.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', input.files[0]);

  const resultEl = document.getElementById('import-result');
  resultEl.style.display = 'block';
  resultEl.innerHTML = `<div style="text-align:center;color:var(--text-3);padding:8px">가져오는 중...</div>`;

  try {
    const r = await fetch(endpoint, { method: 'POST', body: formData });

    if (!r.ok) {
      const text = await r.text();
      resultEl.innerHTML = `<div style="background:#FFF0F0;border-radius:var(--r-md);padding:var(--s3) var(--s4)">
        <div style="font-size:14px;font-weight:600;color:var(--red-500)">서버 오류 (${r.status})</div>
        <div style="font-size:12px;color:var(--red-500);margin-top:4px">${esc(text.slice(0, 300))}</div>
      </div>`;
      return;
    }

    const result = await r.json();
    const errCount = result.errors?.length || 0;

    if (result.imported === 0) {
      // Nothing went in — show failure clearly
      const colInfo = result.columns?.length
        ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px">파일에서 읽은 열: <code style="background:var(--gray-100);padding:1px 4px;border-radius:3px">${esc(result.columns.join(', '))}</code></div>`
        : '<div style="font-size:12px;color:var(--text-3);margin-top:4px">파일이 비어 있거나 헤더를 읽지 못했습니다.</div>';
      const errList = errCount
        ? `<div style="margin-top:8px;font-size:12px;color:var(--red-500);background:#FFF0F0;border-radius:6px;padding:8px;max-height:150px;overflow-y:auto">${result.errors.map(esc).join('<br>')}</div>`
        : '';
      resultEl.innerHTML = `<div style="background:#FFF0F0;border-radius:var(--r-md);padding:var(--s3) var(--s4)">
        <div style="font-size:14px;font-weight:600;color:var(--red-500)">✕ 가져오기 실패 — 저장된 항목이 없습니다</div>
        ${colInfo}
        ${errList || '<div style="font-size:12px;color:var(--text-3);margin-top:4px">열 이름이 템플릿과 다르거나 파일에 내용이 없습니다.</div>'}
      </div>`;
      return;
    }

    // Some or all imported successfully
    const errHtml = errCount
      ? `<div style="margin-top:8px">
           <div style="font-size:12px;font-weight:600;color:#E65100;margin-bottom:4px">실패 항목 (${errCount}건):</div>
           <div style="font-size:12px;color:#E65100;background:#FFF3E0;border-radius:6px;padding:8px;max-height:150px;overflow-y:auto">${result.errors.map(esc).join('<br>')}</div>
         </div>`
      : '';
    const bg = errCount ? '#FFF8E1' : 'var(--green-50)';
    const fg = errCount ? '#E65100' : 'var(--green-500)';
    const icon = errCount ? '⚠' : '✓';
    const msg = errCount
      ? `${result.imported}건 완료, ${errCount}건 실패`
      : `${result.imported}건 가져오기 완료`;

    resultEl.innerHTML = `<div style="background:${bg};border-radius:var(--r-md);padding:var(--s3) var(--s4)">
      <div style="font-size:14px;font-weight:600;color:${fg}">${icon} ${esc(msg)}</div>
      ${errHtml}
    </div>`;

    showToast(`${result.imported}건 가져오기 완료`);
    state.accounts = await get('/api/accounts');

    if (!errCount) {
      // Full success — close modal and refresh
      setTimeout(async () => {
        closeModal();
        await navigate(state.page);
      }, 700);
    } else {
      // Partial — refresh data behind the modal
      if (state.page === 'pipeline') {
        state.data.deals = await get('/api/deals');
        render();
      } else if (state.page === 'contacts') {
        render();
      }
    }
  } catch (e) {
    resultEl.innerHTML = `<div style="background:#FFF0F0;border-radius:var(--r-md);padding:var(--s3) var(--s4);color:var(--red-500);font-size:13px">오류: ${esc(e.message)}</div>`;
  }
}

function downloadTemplate(type, cols, example) {
  const csv = '﻿' + cols + '\n' + example;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${type}_template.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function addDealForAccount(accountId) {
  const acct = state.accounts.find(a => a.id === accountId) || {};
  openDealModal({ account_id: accountId, account_name: acct.name, stage: '제안 완료' });
}

function confirmDeleteDeal(id, title) {
  openModal('리드 삭제', `
    <div class="confirm-body">
      <div class="confirm-icon">🗑</div>
      <div class="confirm-msg">'${esc(title)}'을(를) 삭제하시겠습니까?</div>
      <div class="confirm-sub">삭제된 딜은 복구할 수 없습니다.</div>
      <button class="btn btn-danger btn-full" onclick="deleteDeal(${id})">삭제</button>
      <div style="margin-top:12px"><button class="btn-ghost" onclick="closeModal()">취소</button></div>
    </div>`);
}

function confirmDeleteAccount(id, name) {
  openModal('거래처 삭제', `
    <div class="confirm-body">
      <div class="confirm-icon">🗑</div>
      <div class="confirm-msg">'${esc(name)}'을(를) 삭제하시겠습니까?</div>
      <div class="confirm-sub">삭제된 거래처는 복구할 수 없습니다.</div>
      <button class="btn btn-danger btn-full" onclick="deleteAccount(${id})">삭제</button>
      <div style="margin-top:12px"><button class="btn-ghost" onclick="closeModal()">취소</button></div>
    </div>`);
}

// ── Form handlers ──────────────────────────────────────────────────────────────

async function saveDeal(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);

  const hospitalName = (fd.get('hospital_name') || '').trim();
  const contactName  = (fd.get('contact_name')  || '').trim();
  const phone        = (fd.get('phone')          || '').trim();
  const email        = (fd.get('email')          || '').trim();

  // Upsert account with contact info, then link to deal
  let account_id = null;
  let newAcctCreated = false;
  if (hospitalName) {
    const existing = state.accounts.find(a => a.name === hospitalName);
    if (existing) {
      account_id = existing.id;
      // Merge contact info into existing account
      await put(`/api/accounts/${existing.id}`, {
        name:         existing.name,
        tier:         existing.tier || '개인의원',
        contact_name: contactName  || existing.contact_name || '',
        phone:        phone        || existing.phone        || '',
        email:        email        || existing.email        || '',
        address:      existing.address || '',
        notes:        existing.notes   || '',
      });
    } else {
      const newAcct = await post('/api/accounts', {
        name: hospitalName, tier: '개인의원',
        contact_name: contactName, phone, email, address: '', notes: '',
      });
      account_id = newAcct.id;
      newAcctCreated = true;
    }
    state.accounts = await get('/api/accounts');
  }

  const body = {
    title:            hospitalName,   // 병원명 = 딜 제목
    account_id,
    stage:            fd.get('stage') || '제안 완료',
    value:            parseInt(fd.get('value')) || 0,
    next_action:      (fd.get('next_action')      || '').trim(),
    next_action_date: fd.get('next_action_date')  || '',
    notes:            (fd.get('notes')            || '').trim(),
  };
  const id = form.dataset.id;
  await (id ? put(`/api/deals/${id}`, body) : post('/api/deals', body));
  closeModal();
  showToast(newAcctCreated
    ? `리드 추가 완료 (거래처 '${hospitalName}' 자동 등록됨)`
    : id ? '리드가 수정되었습니다' : '새 리드가 추가되었습니다');
  navigate(state.page);
}

async function saveAccount(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const body = {
    name:         fd.get('name').trim(),
    tier:         fd.get('tier') || '개인의원',
    contact_name: fd.get('contact_name').trim(),
    phone:        fd.get('phone').trim(),
    email:        fd.get('email').trim(),
    address:      fd.get('address').trim(),
    notes:        fd.get('notes').trim(),
  };
  const id = form.dataset.id;
  await (id ? put(`/api/accounts/${id}`, body) : post('/api/accounts', body));
  closeModal();
  showToast(id ? '거래처가 수정되었습니다' : '거래처가 추가되었습니다');
  state.accounts = await get('/api/accounts');
  navigate(state.page);
}

async function saveActivity(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const body = {
    deal_id: parseInt(form.dataset.dealId) || null,
    type:    fd.get('type') || '통화',
    date:    fd.get('date') || '',
    notes:   fd.get('notes').trim(),
  };
  await post('/api/activities', body);
  closeModal();
  showToast('활동이 기록되었습니다');
}

async function deleteDeal(id) {
  await del(`/api/deals/${id}`);
  closeModal();
  showToast('딜이 삭제되었습니다');
  navigate(state.page);
}

async function deleteAccount(id) {
  await del(`/api/accounts/${id}`);
  closeModal();
  showToast('거래처가 삭제되었습니다');
  state.accounts = await get('/api/accounts');
  navigate(state.page);
}

function setStageFilter(filter) {
  state.stageFilter = filter;
  render();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function badge(stage) {
  const cls = stage.replace(/\s+/g, '-');
  return `<span class="badge badge-${cls}">${stage}</span>`;
}

function badge2(label, cls) {
  return `<span class="badge ${cls}">${label}</span>`;
}

function tierBadgeCls(tier) {
  const map = { '개인의원': 'badge-tier-개인의원', '네트워크': 'badge-tier-네트워크', '대형병원': 'badge-tier-대형병원' };
  return map[tier] || 'badge-tier-개인의원';
}

function overdueText(dateStr) {
  if (!dateStr) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00'); d.setHours(0,0,0,0);
  const days = Math.round((today - d) / 86400000);
  return days === 1 ? '1일 지남' : `${days}일 지남`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function put(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function del(url) {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
