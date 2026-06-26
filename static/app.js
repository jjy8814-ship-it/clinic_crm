/* ── 피부과 영업 CRM ─────────────────────────────────────────────────────────── */

const API = '/api';

const state = {
  page: 'dashboard',
  stageFilter: 'all',
  accounts: [],
  config: { stages: [], tiers: [], activity_types: [], products: [] },
  data: {},
  contactSearch: '',
  contactSort: 'name-asc',
  activitySort: 'newest',
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
      [state.data.orders, state.accounts, state.data.products] = await Promise.all([
        get('/api/orders'), get('/api/accounts'), get('/api/products'),
      ]);
      state.config.products = state.data.products || [];
      state.orderAccountFilter = 'all';
    } else if (page === 'activities') {
      state.data.activities = await get('/api/activities');
      state.activityTypeFilter = 'all';
    } else if (page === 'pl') {
      [state.data.pl, state.data.expenses] = await Promise.all([
        get('/api/pl'), get('/api/expenses'),
      ]);
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
    case 'dashboard':   app.innerHTML = tplDashboard(state.data.dashboard); break;
    case 'pipeline':    app.innerHTML = tplPipeline(state.data.deals); break;
    case 'contacts':    app.innerHTML = tplContacts(state.accounts); break;
    case 'orders':      app.innerHTML = tplOrders(state.data.orders); break;
    case 'activities':  app.innerHTML = tplActivities(state.data.activities); break;
    case 'pl':          app.innerHTML = tplPL(state.data.pl, state.data.expenses); break;
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
  if (n >= 100000000) {
    const oku = (n / 100000000).toFixed(1).replace(/\.0$/, '');
    return `${Number(oku).toLocaleString()}억원`;
  }
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${n.toLocaleString()}원`;
}

// ── Templates ─────────────────────────────────────────────────────────────────

function tplDashboard(d) {
  const {
    active_count    = 0,
    closed_count    = 0,
    total_revenue   = 0,
    month_revenue   = 0,
    hospital_ranking = [],
    monthly_trend   = [],
    summary         = {},
  } = d || {};

  const today = new Date();
  const dayNames = ['일','월','화','수','목','금','토'];
  const dateStr = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일 (${dayNames[today.getDay()]})`;

  // ── KPI 카드 ──
  const kpis = [
    { label: '활성 리드',    value: `${active_count}건`,              color: '#1B64DA', sub: '영업 진행 중' },
    { label: '계약 완료',    value: `${closed_count}건`,              color: '#00B140', sub: '누적 계약' },
    { label: '누적 매출',    value: fmtValShort(total_revenue),       color: '#191F28', sub: '발주 기준' },
    { label: '이번 달 매출', value: fmtValShort(month_revenue),       color: '#FF6D00', sub: today.getMonth()+1 + '월' },
  ].map(k => `
    <div class="stat-card">
      <div class="stat-label">${k.label}</div>
      <div class="stat-value" style="color:${k.color}">${k.value}</div>
      <div style="font-size:12px;color:var(--text-3);margin-top:2px">${k.sub}</div>
    </div>`).join('');

  // ── 병원별 매출 순위 ──
  const ranking = hospital_ranking;
  const maxRev = Math.max(1, ...ranking.map(r => r.revenue));
  const rankRows = ranking.length
    ? ranking.map((r, i) => {
        const pct = Math.max(3, Math.round(r.revenue / maxRev * 100));
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F2F4F6">
            <span style="width:28px;font-size:13px;flex-shrink:0;text-align:center">${medal}</span>
            <span style="flex:1;font-size:14px;font-weight:500;color:#191F28;white-space:normal;word-break:keep-all">${esc(r.name)}</span>
            <div style="flex:2;background:#F2F4F6;border-radius:4px;height:8px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:#1B64DA;border-radius:4px"></div>
            </div>
            <span style="font-size:13px;font-weight:600;color:#191F28;flex-shrink:0;min-width:70px;text-align:right">${fmtValShort(r.revenue)}</span>
          </div>`;
      }).join('')
    : `<div style="padding:32px 0;text-align:center;color:#B0B8C1;font-size:13px">발주 데이터가 없습니다</div>`;

  // ── 월별 매출 추이 ──
  const trend = monthly_trend.slice().reverse();
  const maxTrend = Math.max(1, ...trend.map(t => t.revenue));
  const trendBars = trend.length
    ? trend.map(t => {
        const pct = Math.max(4, Math.round(t.revenue / maxTrend * 100));
        const [y, m] = t.month.split('-');
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
            <span style="font-size:11px;font-weight:600;color:#191F28">${fmtValShort(t.revenue)}</span>
            <div style="width:100%;background:#F2F4F6;border-radius:4px;height:80px;display:flex;align-items:flex-end">
              <div style="width:100%;height:${pct}%;background:#1B64DA;border-radius:4px;transition:height 0.3s"></div>
            </div>
            <span style="font-size:11px;color:#8B95A1">${m}월</span>
          </div>`;
      }).join('')
    : `<div style="padding:32px 0;text-align:center;color:#B0B8C1;font-size:13px;width:100%">발주 데이터가 없습니다</div>`;

  // ── 파이프라인 현황 ──
  const stageColors = { '제안 완료':'#7B61FF', '미팅 확정':'#1B64DA', '계약 대기중':'#FF6D00' };
  const activeStages = (state.config.stages || []).filter(s => s !== '계약완료' && s !== 'Lost');
  const pipeRows = activeStages.map(s => {
    const info = summary[s] || { count: 0, total: 0 };
    if (!info.count) return '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #F2F4F6">
        <span style="width:8px;height:8px;border-radius:50%;background:${stageColors[s]||'#B0B8C1'};flex-shrink:0"></span>
        <span style="flex:1;font-size:14px;color:#191F28">${s}</span>
        <span style="font-size:13px;font-weight:700;color:#191F28">${info.count}건</span>
      </div>`;
  }).join('');

  return `
    <div class="page-header">
      <h1 class="page-title">대시보드</h1>
      <p class="page-subtitle">${dateStr}</p>
    </div>

    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:var(--s6)">${kpis}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s5);margin-bottom:var(--s5)">
      <div class="card">
        <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);font-size:15px;font-weight:700">병원별 매출 순위</div>
        <div style="padding:0 var(--s5) var(--s3)">${rankRows}</div>
      </div>
      <div class="card">
        <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);font-size:15px;font-weight:700">파이프라인 현황</div>
        <div style="padding:0 var(--s5) var(--s3)">
          ${pipeRows || `<div style="padding:32px 0;text-align:center;color:#B0B8C1;font-size:13px">등록된 리드가 없습니다</div>`}
        </div>
      </div>
    </div>

    <div class="card">
      <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);font-size:15px;font-weight:700">월별 매출 추이</div>
      <div style="padding:var(--s4) var(--s5);display:flex;gap:8px;align-items:flex-end">${trendBars}</div>
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
  state.data.deals = await get('/api/deals?include_closed=true');
  render();
}
function dealBody(d) {
  return { title: d.title, account_id: d.account_id, stage: d.stage,
    value: d.value, next_action: d.next_action,
    next_action_date: d.next_action_date, notes: d.notes, source: d.source || '',
    source_detail: d.source_detail || '' };
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
    showToast(`"${newName}"으로 변경되었습니다.`);
    render();
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
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
    const isLost     = stage === '계약완료';

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
          ${d.source ? `<div style="margin-bottom:6px"><span style="font-size:10px;font-weight:600;color:#8B95A1;background:#F2F4F6;border-radius:4px;padding:1px 6px">${esc(d.source)}</span></div>` : ''}
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
  const search = (state.contactSearch || '').toLowerCase();
  const sort   = state.contactSort || 'name-asc';

  let list = [...accounts];
  if (search) {
    list = list.filter(a =>
      (a.name || '').toLowerCase().includes(search) ||
      (a.contact_name || '').toLowerCase().includes(search)
    );
  }
  if (sort === 'name-asc')  list.sort((a,b) => a.name.localeCompare(b.name));
  if (sort === 'name-desc') list.sort((a,b) => b.name.localeCompare(a.name));
  if (sort === 'deals')     list.sort((a,b) => (b.deal_count||0) - (a.deal_count||0));

  const sortBtn = (id, label) =>
    `<button class="filter-tab ${sort===id?'active':''}" onclick="setContactSort('${id}')">${label}</button>`;

  const cards = list.length
    ? list.map(a => `
        <div class="account-card" onclick="openAccountModal(${a.id})">
          <div class="account-card-header">
            <div>
              <div class="account-name clickable-name" onclick="event.stopPropagation();openAccountSidePanel(${a.id})">${esc(a.name)}</div>
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
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--s4)">
      <input class="form-input" style="max-width:260px;height:38px" placeholder="거래처 검색..."
        value="${esc(state.contactSearch||'')}" oninput="setContactSearch(this.value)">
      <div class="filter-tabs" style="margin-bottom:0">
        ${sortBtn('name-asc','이름 ▲')}
        ${sortBtn('name-desc','이름 ▼')}
        ${sortBtn('deals','딜 많은순')}
      </div>
    </div>
    <div class="account-grid">${cards}</div>`;
}

function setContactSearch(v) {
  state.contactSearch = v;
  render();
}

function setContactSort(v) {
  state.contactSort = v;
  render();
}

// ── Activities ─────────────────────────────────────────────────────────────────

function tplActivities(activities) {
  const all = activities || [];
  const filter = state.activityTypeFilter || 'all';
  const sortDir = state.activitySort || 'newest';
  const types = state.config.activity_types || [];

  const typePills = [['all', `전체 (${all.length}건)`],
    ...types.map(t => [t, `${t} (${all.filter(a => a.type === t).length}건)`])
  ].map(([id, label]) =>
    `<button class="filter-tab ${filter === id ? 'active' : ''}" onclick="setActivityTypeFilter('${id}')">${label}</button>`
  ).join('');

  let filtered = filter === 'all' ? [...all] : all.filter(a => a.type === filter);
  if (sortDir === 'oldest') filtered.sort((a,b) => (a.date||'').localeCompare(b.date||''));
  else filtered.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const typeColor = { '통화': '#1B64DA', '미팅': '#00B140', '이메일': '#7B61FF', '문자': '#FF6D00', '기타': '#8B95A1' };
  const typeBadge = t => `<span style="font-size:11px;font-weight:600;color:#fff;background:${typeColor[t]||'#8B95A1'};border-radius:20px;padding:2px 9px">${t}</span>`;

  const rows = filtered.length
    ? filtered.map(a => `
        <tr onclick="openActivityDetail(${a.id})" style="cursor:pointer" title="클릭하면 전체 내용을 볼 수 있습니다">
          <td style="color:#4E5968;font-size:13px;white-space:nowrap">${a.date || '—'}</td>
          <td>${typeBadge(a.type)}</td>
          <td style="font-weight:500;color:#191F28">${esc(a.deal_title || a.account_name || '—')}</td>
          <td style="color:#4E5968;max-width:340px">
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((a.notes || '').slice(0, 100))}${(a.notes||'').length > 100 ? '…' : ''}</div>
          </td>
        </tr>`)
      .join('')
    : `<tr><td colspan="4" style="text-align:center;padding:48px;color:var(--text-3)">활동 기록이 없습니다</td></tr>`;

  return `
    <div class="page-header-row">
      <h1 class="page-title">활동 로그</h1>
      <div style="display:flex;gap:8px">
        <button class="filter-tab ${sortDir==='newest'?'active':''}" onclick="setActivitySort('newest')">최신순</button>
        <button class="filter-tab ${sortDir==='oldest'?'active':''}" onclick="setActivitySort('oldest')">오래된순</button>
      </div>
    </div>
    <div class="filter-tabs" style="margin-bottom:var(--s4)">${typePills}</div>
    <div class="card" style="overflow-x:auto">
      <table class="order-table">
        <thead>
          <tr>
            <th style="width:110px">날짜</th>
            <th style="width:76px">유형</th>
            <th style="width:200px">병원 / 딜</th>
            <th>내용 <span style="font-size:11px;font-weight:400;color:#B0B8C1">(클릭하면 전체 내용)</span></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function setActivityTypeFilter(type) {
  state.activityTypeFilter = type;
  render();
}

function setActivitySort(dir) {
  state.activitySort = dir;
  render();
}

function openActivityDetail(id) {
  const a = (state.data.activities || []).find(x => x.id === id);
  if (!a) return;
  const typeColor = { '통화': '#1B64DA', '미팅': '#00B140', '이메일': '#7B61FF', '문자': '#FF6D00', '기타': '#8B95A1' };
  openModal('활동 상세', `
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:var(--s4)">
        <span style="font-size:12px;font-weight:600;color:#fff;background:${typeColor[a.type]||'#8B95A1'};border-radius:20px;padding:3px 10px">${esc(a.type)}</span>
        <span style="font-size:13px;color:var(--text-3)">${esc(a.date || '날짜 없음')}</span>
      </div>
      ${a.deal_title ? `<div style="font-size:15px;font-weight:600;color:var(--text-1);margin-bottom:var(--s4)">${esc(a.deal_title)}</div>` : ''}
      <div style="white-space:pre-wrap;font-size:14px;color:var(--text-2);line-height:1.75;background:var(--gray-100);border-radius:var(--r-md);padding:var(--s4);min-height:80px">${esc(a.notes || '(내용 없음)')}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:var(--s5)">
        <button class="btn btn-secondary" onclick="closeModal()">닫기</button>
      </div>
    </div>`);
}


// ── P&L ───────────────────────────────────────────────────────────────────────

function tplPL(pl, expenses) {
  const t = pl?.total || {};
  const rows = pl?.rows || [];
  const exps = expenses || [];
  const expensesDetail = pl?.expenses_detail || {};
  const ordersDetail   = pl?.orders_detail   || {};
  const selectedMonth  = state.plSelectedMonth || '';

  const fmt  = v => (v || 0).toLocaleString() + '원';
  const sign = v => v >= 0
    ? `<span style="color:#00B140">${fmt(v)}</span>`
    : `<span style="color:#F04452">${fmt(v)}</span>`;

  const summaryCards = [
    { label: '총 매출',     value: fmt(t.revenue),   color: '#191F28' },
    { label: '매출원가',    value: fmt(t.cogs),      color: '#F04452' },
    { label: '비용 합계',   value: fmt(t.expenses),  color: '#FF6D00' },
    { label: '영업이익',    value: fmt(t.operating), color: (t.operating||0) >= 0 ? '#00B140' : '#F04452' },
  ].map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value" style="color:${c.color}">${c.value}</div>
    </div>`).join('');

  const CATS = ['판관비', '마케팅비', '고정비'];

  const monthRows = rows.length ? rows.map(r => {
    const catCols = CATS.map(cat =>
      `<td style="text-align:right;color:#FF6D00">${((r.cat_totals||{})[cat]||0).toLocaleString()}</td>`
    ).join('');
    return `
      <tr style="cursor:pointer" onclick="setPLMonth('${r.month}')" title="${r.month} 상세 보기">
        <td style="font-weight:600;color:${selectedMonth===r.month?'#1B64DA':'inherit'}">${r.month}${selectedMonth===r.month?' ▶':''}</td>
        <td style="text-align:right">${r.units}대</td>
        <td style="text-align:right">${(r.revenue).toLocaleString()}</td>
        <td style="text-align:right;color:#F04452">${(r.cogs).toLocaleString()}</td>
        ${catCols}
        <td style="text-align:right;font-weight:700">${sign(r.operating)}</td>
      </tr>`;
  }).join('')
  : `<tr><td colspan="${4+CATS.length}" style="text-align:center;padding:24px;color:#B0B8C1">발주 데이터가 없습니다</td></tr>`;

  // Month detail panel
  let detailHtml = '';
  if (selectedMonth) {
    const monthOrders   = ordersDetail[selectedMonth]   || [];
    const monthExpenses = expensesDetail[selectedMonth] || [];
    const monthRevenue  = monthOrders.reduce((s,o) => s+(o.total_price||0), 0);
    const monthCogs     = monthOrders.reduce((s,o) => s+(o.quantity||0), 0) * 111419;
    const monthExpTotal = monthExpenses.reduce((s,e) => s+(e.amount||0), 0);
    const monthOp       = monthRevenue - monthCogs - monthExpTotal;

    const orderRows2 = monthOrders.length ? monthOrders.map(o => `
      <tr>
        <td>${esc(o.account_name||'—')}</td>
        <td>${esc(o.product_name)}</td>
        <td style="text-align:center">${o.quantity}대</td>
        <td style="text-align:right;font-weight:600">${(o.total_price||0).toLocaleString()}원</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#B0B8C1;padding:16px">발주 없음</td></tr>`;

    const expRows2 = monthExpenses.length ? monthExpenses.map(e => `
      <tr>
        <td><span style="font-size:11px;background:#F2F4F6;padding:1px 6px;border-radius:4px">${esc(e.category||'판관비')}</span></td>
        <td>${esc(e.name)}</td>
        <td style="text-align:right;font-weight:600">${(e.amount||0).toLocaleString()}원</td>
        <td>${esc(e.notes||'')}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#B0B8C1;padding:16px">비용 없음</td></tr>`;

    detailHtml = `
      <div class="card" style="margin-bottom:var(--s5)">
        <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:700;font-size:15px">${selectedMonth} 상세</span>
          <button class="btn btn-sm btn-secondary" onclick="setPLMonth('')">닫기</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s4);padding:var(--s4) var(--s5)">
          <div style="font-size:13px;color:var(--text-3)">매출 <strong style="color:#191F28;font-size:15px">${monthRevenue.toLocaleString()}원</strong></div>
          <div style="font-size:13px;color:var(--text-3)">원가 <strong style="color:#F04452;font-size:15px">${monthCogs.toLocaleString()}원</strong></div>
          <div style="font-size:13px;color:var(--text-3)">비용 <strong style="color:#FF6D00;font-size:15px">${monthExpTotal.toLocaleString()}원</strong></div>
          <div style="font-size:13px;color:var(--text-3)">영업이익 <strong style="color:${monthOp>=0?'#00B140':'#F04452'};font-size:15px">${monthOp.toLocaleString()}원</strong></div>
        </div>
        <div style="padding:0 var(--s5) var(--s3)">
          <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:var(--s2)">발주 목록</div>
          <table class="order-table"><thead><tr><th>병원명</th><th>제품</th><th style="text-align:center">수량</th><th style="text-align:right">금액</th></tr></thead>
          <tbody>${orderRows2}</tbody></table>
          <div style="font-size:13px;font-weight:600;color:var(--text-2);margin:var(--s4) 0 var(--s2)">비용 목록</div>
          <table class="order-table"><thead><tr><th>카테고리</th><th>항목명</th><th style="text-align:right">금액</th><th>메모</th></tr></thead>
          <tbody>${expRows2}</tbody></table>
        </div>
      </div>`;
  }

  const expRows = exps.length ? exps.map(e => `
    <tr>
      <td>${esc(e.month || '—')}</td>
      <td><span style="font-size:11px;background:#F2F4F6;padding:1px 6px;border-radius:4px">${esc(e.category||'판관비')}</span></td>
      <td>${esc(e.name)}</td>
      <td style="text-align:right;font-weight:600">${(e.amount).toLocaleString()}원</td>
      <td>${esc(e.notes || '')}</td>
      <td style="text-align:center">
        <button class="btn btn-sm btn-secondary" style="height:26px;padding:0 10px;font-size:11px" onclick="openExpenseModal(${e.id})">수정</button>
        <button class="btn btn-sm btn-danger"    style="height:26px;padding:0 10px;font-size:11px" onclick="confirmDeleteExpense(${e.id},'${esc(e.name).replace(/'/g,"\\'")}')">삭제</button>
      </td>
    </tr>`).join('')
  : `<tr><td colspan="6" style="text-align:center;padding:24px;color:#B0B8C1">등록된 비용 항목이 없습니다</td></tr>`;

  const catHeaders = CATS.map(c => `<th style="text-align:right">${c}</th>`).join('');

  return `
    <div class="page-header-row">
      <h1 class="page-title">P&L 관리</h1>
    </div>
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:var(--s5)">${summaryCards}</div>

    ${detailHtml}

    <div class="card" style="margin-bottom:var(--s5);overflow-x:auto">
      <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);font-weight:700;font-size:15px">월별 손익 <span style="font-size:12px;font-weight:400;color:var(--text-3)">(행 클릭 시 상세)</span></div>
      <table class="order-table">
        <thead><tr>
          <th>월</th><th style="text-align:right">판매량</th>
          <th style="text-align:right">매출</th><th style="text-align:right">원가</th>
          ${catHeaders}
          <th style="text-align:right">영업이익</th>
        </tr></thead>
        <tbody>${monthRows}</tbody>
      </table>
    </div>

    <div class="card" style="overflow-x:auto">
      <div style="padding:var(--s4) var(--s5);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:15px">비용 항목</span>
        <button class="btn btn-primary" style="height:34px;padding:0 14px;font-size:13px" onclick="openExpenseModal(null)">+ 항목 추가</button>
      </div>
      <table class="order-table">
        <thead><tr><th>월</th><th>카테고리</th><th>항목명</th><th style="text-align:right">금액</th><th>메모</th><th style="text-align:center">관리</th></tr></thead>
        <tbody>${expRows}</tbody>
      </table>
    </div>`;
}

function setPLMonth(m) {
  state.plSelectedMonth = m;
  render();
}

function openExpenseModal(idOrNull) {
  const e = typeof idOrNull === 'number'
    ? (state.data.expenses || []).find(x => x.id === idOrNull) || {}
    : {};
  const today = new Date().toISOString().slice(0, 7);
  const CATS = ['판관비', '마케팅비', '고정비'];
  const catOpts = CATS.map(c => `<option value="${c}" ${(e.category||'판관비')===c?'selected':''}>${c}</option>`).join('');
  openModal(e.id ? '비용 수정' : '비용 추가', `
    <form class="form" id="expense-form" onsubmit="saveExpense(event)" data-id="${e.id || ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">월 <span class="req">*</span></label>
          <input class="form-input" name="month" type="month" value="${e.month || today}" required>
        </div>
        <div class="form-group">
          <label class="form-label">카테고리</label>
          <select class="form-select" name="category">${catOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">항목명 <span class="req">*</span></label>
          <input class="form-input" name="name" value="${esc(e.name || '')}" placeholder="인건비, 임대료, 마케팅비 등" required>
        </div>
        <div class="form-group">
          <label class="form-label">금액 (원) <span class="req">*</span></label>
          <input class="form-input" name="amount" type="number" value="${e.amount || ''}" placeholder="0" min="0" required>
        </div>
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
    name:     fd.get('name').trim(),
    amount:   parseInt(fd.get('amount')) || 0,
    month:    fd.get('month') || '',
    notes:    fd.get('notes').trim(),
    category: fd.get('category') || '판관비',
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

  const FREE_RETURN_DAYS = 60;
  const returnBadge = o => {
    if (!o.delivery_date || o.status !== '납품완료') return '<span style="color:#D1D5DB;font-size:12px">—</span>';
    const today = new Date(); today.setHours(0,0,0,0);
    const delivery = new Date(o.delivery_date + 'T00:00:00'); delivery.setHours(0,0,0,0);
    const daysSince = Math.floor((today - delivery) / 86400000);
    const remaining = FREE_RETURN_DAYS - daysSince;
    if (remaining > 7)  return `<span style="font-size:12px;font-weight:600;color:#00B140">D-${remaining}</span>`;
    if (remaining > 0)  return `<span style="font-size:12px;font-weight:700;color:#FF6D00">D-${remaining}</span>`;
    if (remaining === 0) return `<span style="font-size:12px;font-weight:700;color:#F04452">D-0</span>`;
    return `<span style="font-size:12px;color:#B0B8C1">만료</span>`;
  };

  const rows = filtered.length
    ? filtered.map(o => `
        <tr onclick="openOrderModal(${o.id})" style="cursor:pointer">
          <td><span class="clickable-name" onclick="event.stopPropagation();${o.account_id?`openAccountSidePanel(${o.account_id})`:''}">${esc(o.account_name || '—')}</span></td>
          <td>${esc(o.product_name)}</td>
          <td style="text-align:center;font-weight:600">${o.quantity}대</td>
          <td style="text-align:right">${fmtVal(o.unit_price)}</td>
          <td style="text-align:right;font-weight:600">${fmtVal(o.total_price)}</td>
          <td>${o.order_date || '—'}</td>
          <td>${o.delivery_date || '—'}</td>
          <td>${statusBadge(o.status)}</td>
          <td style="text-align:center">${returnBadge(o)}</td>
          <td onclick="event.stopPropagation()" style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary" onclick="printOrderPDF(${o.id})">발주서</button>
            <button class="btn btn-sm btn-danger" onclick="confirmDeleteOrder(${o.id},'${esc(o.account_name||'').replace(/'/g,"\\'")}')">삭제</button>
          </td>
        </tr>`)
      .join('')
    : `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-3)">발주 내역이 없습니다</td></tr>`;

  return `
    <div class="page-header-row">
      <h1 class="page-title">발주 현황</h1>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary" onclick="openProductsModal()">제품 관리</button>
        <button class="btn btn-primary" onclick="openOrderModal(null)">+ 발주 등록</button>
      </div>
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
            <th>발주일</th><th>납품일</th><th>상태</th>
            <th style="text-align:center" title="납품 후 60일 이내 무료 반품">반품 가능</th>
            <th></th>
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
  const stageOpts    = state.config.stages.map(s =>
    `<option value="${s}" ${(d.stage || '제안 완료') === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  // source_detail visibility
  const detailSources = ['부스/행사', '소개/레퍼럴', '기타'];
  const showDetail = detailSources.includes(d.source || '');

  openModal(d.id ? '리드 편집' : '새 리드 추가', `
    <form class="form" id="deal-form" onsubmit="saveDeal(event)" data-id="${d.id || ''}">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">병원명 <span class="req">*</span></label>
          <input class="form-input" name="hospital_name"
            value="${esc(hospitalName)}" placeholder="강남스킨케어의원" required>
        </div>
        <div class="form-group">
          <label class="form-label">고객명 (담당자)</label>
          <input class="form-input" name="contact_name" value="${esc(contactName)}" placeholder="홍길동 원장">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">연락처</label>
          <input class="form-input" name="phone" id="deal-phone-input" value="${esc(phone)}" placeholder="010-1234-5678"
            oninput="checkPhoneDuplicate(this, ${d.id || 'null'})">
          <div id="phone-dup-msg" style="display:none;font-size:12px;color:var(--red-500);margin-top:4px"></div>
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
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group">
          <label class="form-label">리드 출처</label>
          <select class="form-select" name="source" onchange="onSourceChange(this)">
            <option value="" ${!d.source ? 'selected' : ''}>미지정</option>
            <option value="아웃바운드" ${d.source === '아웃바운드' ? 'selected' : ''}>아웃바운드</option>
            <option value="인바운드" ${d.source === '인바운드' ? 'selected' : ''}>인바운드</option>
            <option value="부스/행사" ${d.source === '부스/행사' ? 'selected' : ''}>부스/행사</option>
            <option value="소개/레퍼럴" ${d.source === '소개/레퍼럴' ? 'selected' : ''}>소개/레퍼럴</option>
            <option value="기타" ${d.source === '기타' ? 'selected' : ''}>기타</option>
          </select>
        </div>
        <div class="form-group" id="source-detail-group" style="${showDetail ? '' : 'display:none'}">
          <label class="form-label">출처 상세</label>
          <input class="form-input" name="source_detail" value="${esc(d.source_detail||'')}" placeholder="행사명, 소개자 등">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <textarea class="form-textarea" name="notes" placeholder="특이사항, 원장 성향, 예산 메모 등">${esc(d.notes||'')}</textarea>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        ${d.id ? `<button type="button" class="btn btn-secondary btn-full" onclick="closeModal();openSidePanel(${d.id})">↗ 사이드뷰로 보기</button>` : ''}
        <button type="button" class="btn btn-secondary btn-full" onclick="closeModal()">취소</button>
      </div>
    </form>`);
}

function onSourceChange(sel) {
  const detailSources = ['부스/행사', '소개/레퍼럴', '기타'];
  const grp = document.getElementById('source-detail-group');
  if (grp) grp.style.display = detailSources.includes(sel.value) ? '' : 'none';
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

function getProductPriceMap() {
  const map = {};
  (state.config.products || []).forEach(p => { map[p.name] = p.unit_price; });
  // fallback hardcoded if products empty
  if (!Object.keys(map).length) {
    map['톰더글로우'] = 0;
    map['톰더글로우 프로'] = 438900;
  }
  return map;
}

function calcOrderTotal() {
  const qty   = parseInt(document.getElementById('order-quantity')?.value) || 0;
  const price = parseInt(document.getElementById('order-unit-price')?.value) || 0;
  const el    = document.getElementById('order-total');
  if (el) el.textContent = (qty * price).toLocaleString() + '원';
}

function onProductChange(sel) {
  const map = getProductPriceMap();
  const price = map[sel.value];
  const priceInput = document.getElementById('order-unit-price');
  if (priceInput && price != null) { priceInput.value = price || ''; calcOrderTotal(); }
}

function openOrderModal(idOrNull) {
  const o = typeof idOrNull === 'number'
    ? (state.data.orders || []).find(x => x.id === idOrNull) || {}
    : {};
  const today = new Date().toISOString().split('T')[0];
  const statusOpts = (state.config.order_statuses || ['발주완료','납품완료','취소']).map(s =>
    `<option value="${s}" ${(o.status || '발주완료') === s ? 'selected' : ''}>${s}</option>`
  ).join('');
  const PRODUCT_PRICES = getProductPriceMap();
  const productNames = Object.keys(PRODUCT_PRICES);
  const currentProduct = o.product_name || (productNames[0] || '톰더글로우 프로');
  const productOpts = productNames.map(p =>
    `<option value="${p}" ${currentProduct === p ? 'selected' : ''}>${p}${PRODUCT_PRICES[p] ? ' — ' + PRODUCT_PRICES[p].toLocaleString() + '원' : ''}</option>`
  ).join('');

  const acctDatalistOrder = state.accounts.map(a => `<option value="${esc(a.name)}">`).join('');
  const currentAcctName = o.account_id ? (state.accounts.find(a => a.id === o.account_id)?.name || '') : '';

  openModal(o.id ? '발주 편집' : '발주 등록', `
    <form class="form" id="order-form" onsubmit="saveOrder(event)" data-id="${o.id || ''}">
      <div class="form-group">
        <label class="form-label">병원명 <span class="req">*</span></label>
        <input class="form-input" name="account_name_search" list="order-acct-datalist"
          value="${esc(currentAcctName)}" placeholder="병원명 검색..." autocomplete="off" required>
        <datalist id="order-acct-datalist">${acctDatalistOrder}</datalist>
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
  const searchedName = (fd.get('account_name_search') || '').trim();
  const matchedAcct = state.accounts.find(a => a.name === searchedName);
  const body = {
    account_id:    matchedAcct ? matchedAcct.id : null,
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
  const label = type === 'deals' ? '리드' : '거래처';
  const endpoint = type === 'deals' ? '/api/import/deals' : '/api/import/accounts';

  const dealsRequired = '병원명,이름,전화번호,이메일';
  const dealsOptional = '단계,리드 이름,금액(원),다음 액션,날짜(YYYY-MM-DD),메모,분류,주소,거래처 메모';
  const dealsCols = dealsRequired + ',' + dealsOptional;
  const dealsEx = '강남스킨케어의원,홍길동,02-1234-5678,hong@skinclinic.com,제안 완료,강남스킨케어의원 리드,,첫 미팅 제안,,개인의원,,';

  const accountsCols = '거래처 이름,분류,고객명,이메일,전화번호,주소,메모';
  const accountsEx = '강남스킨케어의원,개인의원,홍길동,hong@skinclinic.com,02-1234-5678,서울시 강남구,';

  const templateCols = type === 'deals' ? dealsCols : accountsCols;
  const templateEx   = type === 'deals' ? dealsEx   : accountsEx;

  const stagesHint = type === 'deals'
    ? `<div style="font-size:12px;color:var(--text-3);margin-top:6px">
        <b>단계 값:</b> 제안 완료 / 미팅 확정 / 계약 대기중 / 계약완료 / Lost<br>
        <span style="color:var(--text-4)">(비워두면 "제안 완료"로 자동 설정)</span>
       </div>`
    : `<div style="font-size:12px;color:var(--text-3);margin-top:6px">
        <b>분류 값:</b> 개인의원 / 네트워크 / 대형병원
       </div>`;

  const requiredNote = type === 'deals'
    ? `<div style="font-size:12px;color:var(--red-500);margin-top:6px"><b>필수:</b> 병원명, 이름, 전화번호, 이메일</div>`
    : '';

  openModal(`${label} CSV 가져오기`, `
    <div class="form">
      <div style="background:var(--blue-50);border-radius:var(--r-md);padding:var(--s4)">
        <div style="font-size:13px;font-weight:600;color:var(--blue-500);margin-bottom:6px">CSV 파일 형식</div>
        <div style="font-size:12px;color:var(--text-2);font-family:monospace;word-break:break-all">${templateCols}</div>
        ${requiredNote}
        ${stagesHint}
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
    closeModal();
    state.accounts = await get('/api/accounts');
    await navigate(state.page);
    showImportResultPanel(result);
  } catch (e) {
    resultEl.innerHTML = `<div style="background:#FFF0F0;border-radius:var(--r-md);padding:var(--s3) var(--s4);color:var(--red-500);font-size:13px">오류: ${esc(e.message)}</div>`;
  }
}

function showImportResultPanel(result) {
  const panel = document.getElementById('import-result-panel');
  if (!panel) return;

  const imported = result.imported || 0;
  const duplicates = result.duplicates || 0;
  const errors = result.errors || [];
  const otherErrors = errors.filter(e => !e.includes('중복 리드'));
  const totalFail = errors.length;

  const isSuccess = imported > 0 && totalFail === 0;
  const headerBg = isSuccess ? '#EDF7ED' : imported > 0 ? '#FFF8E1' : '#FFF0F0';
  const headerColor = isSuccess ? '#2E7D32' : imported > 0 ? '#E65100' : '#C62828';
  const icon = isSuccess ? '✓' : imported > 0 ? '⚠' : '✕';

  let bodyHtml = `
    <div style="display:flex;gap:16px;padding:14px 16px;border-bottom:1px solid #F0F0F0">
      <div style="flex:1;text-align:center">
        <div style="font-size:11px;color:#888;margin-bottom:2px">성공</div>
        <div style="font-size:22px;font-weight:700;color:#2E7D32">${imported}<span style="font-size:13px;font-weight:400">건</span></div>
      </div>
      <div style="width:1px;background:#F0F0F0"></div>
      <div style="flex:1;text-align:center">
        <div style="font-size:11px;color:#888;margin-bottom:2px">실패</div>
        <div style="font-size:22px;font-weight:700;color:${totalFail ? '#C62828' : '#9E9E9E'}">${totalFail}<span style="font-size:13px;font-weight:400">건</span></div>
      </div>
    </div>`;

  if (duplicates > 0) {
    bodyHtml += `
    <div style="padding:10px 16px;border-bottom:1px solid #F0F0F0;font-size:13px;color:#C62828">
      실패 이유: <strong>중복 리드 ${duplicates}건</strong>
    </div>`;
  }

  if (otherErrors.length > 0) {
    bodyHtml += `
    <div style="padding:10px 16px;border-bottom:1px solid #F0F0F0">
      <div style="font-size:12px;font-weight:600;color:#555;margin-bottom:6px">기타 오류 (${otherErrors.length}건)</div>
      <div style="font-size:12px;color:#C62828;max-height:130px;overflow-y:auto;line-height:1.7">${otherErrors.map(esc).join('<br>')}</div>
    </div>`;
  }

  if (imported === 0 && result.columns?.length) {
    bodyHtml += `
    <div style="padding:10px 16px;font-size:12px;color:#888">
      파일에서 읽은 열: <code style="background:#F5F5F5;padding:1px 4px;border-radius:3px">${esc(result.columns.join(', '))}</code>
    </div>`;
  }

  panel.innerHTML = `
    <div style="background:${headerBg};padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
      <div style="font-size:14px;font-weight:700;color:${headerColor}">${icon} CSV 가져오기 결과</div>
      <button onclick="document.getElementById('import-result-panel').style.display='none'"
        style="background:none;border:none;cursor:pointer;padding:4px;color:#888;line-height:1;font-size:18px">✕</button>
    </div>
    ${bodyHtml}`;

  panel.style.display = 'block';
}

let _phoneDupTimer = null;
async function checkPhoneDuplicate(input, currentDealId) {
  clearTimeout(_phoneDupTimer);
  const msg = document.getElementById('phone-dup-msg');
  if (!msg) return;
  const phone = input.value.trim();
  if (!phone) { msg.style.display = 'none'; return; }
  _phoneDupTimer = setTimeout(async () => {
    try {
      const res = await get(`/api/check-phone?phone=${encodeURIComponent(phone)}`);
      if (res.exists) {
        const sameAcct = currentDealId
          ? (state.data.deals || []).find(d => d.id === currentDealId)?.account_id === res.account?.id
          : false;
        if (!sameAcct) {
          msg.textContent = `이미 등록된 거래처입니다 — ${res.account?.name || ''}`;
          msg.style.display = 'block';
          return;
        }
      }
      msg.style.display = 'none';
    } catch (_) { msg.style.display = 'none'; }
  }, 400);
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
    title:            hospitalName,
    account_id,
    stage:            fd.get('stage') || '제안 완료',
    value:            parseInt(fd.get('value')) || 0,
    next_action:      (fd.get('next_action')      || '').trim(),
    next_action_date: fd.get('next_action_date')  || '',
    notes:            (fd.get('notes')            || '').trim(),
    source:           (fd.get('source')           || '').trim(),
    source_detail:    (fd.get('source_detail')    || '').trim(),
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

// ── Side Panel ────────────────────────────────────────────────────────────────

function openSidePanel(dealId) {
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('side-panel-backdrop');
  const title = document.getElementById('side-panel-title');
  const body = document.getElementById('side-panel-body');
  if (!panel) return;

  const deal = (state.data.deals || []).find(d => d.id === dealId);
  title.textContent = deal ? deal.title : '리드 정보';
  body.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:40px">불러오는 중...</div>';
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('open');

  get(`/api/activities?deal_id=${dealId}`).then(activities => {
    const typeColor = { '통화': '#1B64DA', '미팅': '#00B140', '이메일': '#7B61FF', '문자': '#FF6D00', '기타': '#8B95A1' };
    const acct = deal?.account_id ? state.accounts.find(a => a.id === deal.account_id) : null;

    const infoHtml = deal ? `
      <div style="background:var(--gray-50);border-radius:10px;padding:var(--s4);margin-bottom:var(--s5)">
        <div style="font-size:15px;font-weight:700;margin-bottom:var(--s3)">${esc(deal.title)}</div>
        ${deal.stage ? `<div style="margin-bottom:var(--s2)">${badge(deal.stage)}</div>` : ''}
        ${deal.value ? `<div style="font-size:14px;color:var(--text-2);margin-bottom:var(--s1)">금액: <strong>${fmtVal(deal.value)}</strong></div>` : ''}
        ${deal.source ? `<div style="font-size:13px;color:var(--text-3)">출처: ${esc(deal.source)}${deal.source_detail ? ' / ' + esc(deal.source_detail) : ''}</div>` : ''}
        ${acct ? `<div style="font-size:13px;color:var(--text-3);margin-top:var(--s1)">거래처: <span class="clickable-name" onclick="openAccountSidePanel(${acct.id})">${esc(acct.name)}</span></div>` : ''}
        ${deal.next_action ? `<div style="font-size:13px;color:var(--text-2);margin-top:var(--s2)">다음 액션: ${esc(deal.next_action)} ${deal.next_action_date ? '('+deal.next_action_date+')' : ''}</div>` : ''}
      </div>` : '';

    const actHtml = activities.length ? activities.map(a => `
      <div style="display:flex;gap:var(--s3);padding:var(--s3) 0;border-bottom:1px solid var(--gray-100)">
        <div style="flex-shrink:0;text-align:center;width:52px">
          <div style="font-size:11px;color:var(--text-3)">${a.date||''}</div>
          <span style="font-size:11px;font-weight:600;color:#fff;background:${typeColor[a.type]||'#8B95A1'};border-radius:20px;padding:1px 6px;display:inline-block;margin-top:4px">${esc(a.type)}</span>
        </div>
        <div style="flex:1;font-size:13px;color:var(--text-2);line-height:1.5;white-space:pre-wrap">${esc(a.notes||'')}</div>
      </div>`).join('')
    : `<div style="text-align:center;color:var(--text-3);padding:24px;font-size:13px">활동 기록이 없습니다</div>`;

    body.innerHTML = `
      ${infoHtml}
      <div style="font-size:14px;font-weight:700;color:var(--text-1);margin-bottom:var(--s3)">활동 로그 (${activities.length}건)</div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--s3)">
        <button class="btn btn-sm btn-primary" onclick="openActivityModal(${dealId},'${esc(deal?.title||'').replace(/'/g,"\\'")}')">+ 활동 기록</button>
      </div>
      ${actHtml}`;
  }).catch(() => {
    body.innerHTML = '<div style="color:var(--red-500);padding:16px">불러오기 실패</div>';
  });
}

async function openAccountSidePanel(accountId) {
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('side-panel-backdrop');
  const title = document.getElementById('side-panel-title');
  const body = document.getElementById('side-panel-body');
  if (!panel) return;

  const acct = state.accounts.find(a => a.id === accountId);
  title.textContent = acct ? acct.name : '거래처 정보';
  body.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:40px">불러오는 중...</div>';
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('open');

  try {
    const [deals, orders] = await Promise.all([
      get('/api/deals?include_closed=true'),
      get(`/api/orders?account_id=${accountId}`),
    ]);
    const acctDeals = deals.filter(d => d.account_id === accountId);
    const acctOrders = orders;

    const infoHtml = acct ? `
      <div style="background:var(--gray-50);border-radius:10px;padding:var(--s4);margin-bottom:var(--s5)">
        <div style="font-size:15px;font-weight:700;margin-bottom:var(--s2)">${esc(acct.name)}</div>
        ${badge2(acct.tier, tierBadgeCls(acct.tier))}
        <div style="margin-top:var(--s3);display:flex;flex-direction:column;gap:var(--s1);font-size:13px;color:var(--text-2)">
          ${acct.contact_name ? `<div>👤 ${esc(acct.contact_name)}</div>` : ''}
          ${acct.phone ? `<div>📞 ${esc(acct.phone)}</div>` : ''}
          ${acct.email ? `<div>✉ ${esc(acct.email)}</div>` : ''}
          ${acct.address ? `<div>📍 ${esc(acct.address)}</div>` : ''}
        </div>
        <div style="margin-top:var(--s3)">
          <button class="btn btn-sm btn-secondary" onclick="openAccountModal(${accountId})">정보 수정</button>
        </div>
      </div>` : '';

    const dealRows = acctDeals.length ? acctDeals.map(d => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--s2) 0;border-bottom:1px solid var(--gray-100);cursor:pointer" onclick="openDealById(${d.id})">
        <div>
          <div style="font-size:14px;font-weight:500">${esc(d.title)}</div>
          <div style="margin-top:2px">${badge(d.stage)}</div>
        </div>
        <div style="font-size:13px;font-weight:600">${d.value ? fmtValShort(d.value) : '—'}</div>
      </div>`).join('')
    : `<div style="text-align:center;color:var(--text-3);padding:16px;font-size:13px">리드 없음</div>`;

    const orderRows = acctOrders.length ? acctOrders.map(o => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--s2) 0;border-bottom:1px solid var(--gray-100)">
        <div>
          <div style="font-size:13px;font-weight:500">${esc(o.product_name)}</div>
          <div style="font-size:12px;color:var(--text-3)">${o.order_date||''} · ${o.status||''}</div>
        </div>
        <div style="font-size:13px;font-weight:600">${fmtValShort(o.total_price||0)}</div>
      </div>`).join('')
    : `<div style="text-align:center;color:var(--text-3);padding:16px;font-size:13px">발주 없음</div>`;

    body.innerHTML = `
      ${infoHtml}
      <div style="font-size:14px;font-weight:700;margin-bottom:var(--s3)">리드 (${acctDeals.length}건)</div>
      <div style="margin-bottom:var(--s5)">${dealRows}</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:var(--s3)">발주 (${acctOrders.length}건)</div>
      ${orderRows}`;
  } catch(e) {
    body.innerHTML = '<div style="color:var(--red-500);padding:16px">불러오기 실패</div>';
  }
}

function closeSidePanel() {
  const panel = document.getElementById('side-panel');
  const backdrop = document.getElementById('side-panel-backdrop');
  if (panel) panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// ── Products Modal ─────────────────────────────────────────────────────────────

async function openProductsModal() {
  const products = await get('/api/products');
  state.config.products = products;
  state.data.products = products;
  renderProductsModal();
}

function renderProductsModal() {
  const products = state.data.products || [];
  const rows = products.length ? products.map(p => `
    <tr>
      <td style="font-weight:600">${esc(p.name)}</td>
      <td style="text-align:right">${(p.unit_price||0).toLocaleString()}원</td>
      <td>${esc(p.notes||'')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-secondary" style="height:26px;padding:0 10px;font-size:11px" onclick="openProductEditModal(${p.id})">수정</button>
        <button class="btn btn-sm btn-danger" style="height:26px;padding:0 10px;font-size:11px" onclick="confirmDeleteProduct(${p.id},'${esc(p.name).replace(/'/g,"\\'")}')">삭제</button>
      </td>
    </tr>`).join('')
  : `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-3)">등록된 제품이 없습니다</td></tr>`;

  openModal('제품 관리', `
    <div>
      <div style="display:flex;justify-content:flex-end;margin-bottom:var(--s4)">
        <button class="btn btn-primary" style="height:36px;font-size:13px" onclick="openProductEditModal(null)">+ 제품 추가</button>
      </div>
      <div style="overflow-x:auto">
        <table class="order-table">
          <thead><tr><th>제품명</th><th style="text-align:right">단가</th><th>메모</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`);
}

function openProductEditModal(idOrNull) {
  const p = typeof idOrNull === 'number'
    ? (state.data.products || []).find(x => x.id === idOrNull) || {}
    : {};
  openModal(p.id ? '제품 수정' : '제품 추가', `
    <form class="form" onsubmit="saveProduct(event)" data-id="${p.id||''}">
      <div class="form-group">
        <label class="form-label">제품명 <span class="req">*</span></label>
        <input class="form-input" name="name" value="${esc(p.name||'')}" required>
      </div>
      <div class="form-group">
        <label class="form-label">단가 (원)</label>
        <input class="form-input" name="unit_price" type="number" value="${p.unit_price||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">메모</label>
        <input class="form-input" name="notes" value="${esc(p.notes||'')}">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-full">저장</button>
        <button type="button" class="btn btn-secondary btn-full" onclick="openProductsModal()">취소</button>
      </div>
    </form>`);
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const body = {
    name: fd.get('name').trim(),
    unit_price: parseInt(fd.get('unit_price')) || 0,
    notes: fd.get('notes').trim(),
  };
  const id = form.dataset.id;
  if (id) await put(`/api/products/${id}`, body);
  else await post('/api/products', body);
  showToast(id ? '제품이 수정되었습니다' : '제품이 추가되었습니다');
  const products = await get('/api/products');
  state.config.products = products;
  state.data.products = products;
  renderProductsModal();
}

function confirmDeleteProduct(id, name) {
  openModal('제품 삭제', `
    <div class="confirm-body">
      <div class="confirm-icon">🗑</div>
      <div class="confirm-msg">'${esc(name)}' 제품을 삭제하시겠습니까?</div>
      <button class="btn btn-danger btn-full" onclick="deleteProduct(${id})">삭제</button>
      <div style="margin-top:12px"><button class="btn-ghost" onclick="openProductsModal()">취소</button></div>
    </div>`);
}

async function deleteProduct(id) {
  await del(`/api/products/${id}`);
  showToast('삭제되었습니다');
  const products = await get('/api/products');
  state.config.products = products;
  state.data.products = products;
  renderProductsModal();
}

// ── Start ─────────────────────────────────────────────────────────────────────

init();
