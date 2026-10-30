/* Greenspan Events HQ - generic, read-only event app.
   All event-specific content lives in /events/*.js (window.EVENTS). */

const TYPES = ['Sales','Support','Build','Visitor'];          // staff types - a person can have several
const TYPE_CLASS = { 'Sales':'sales', 'Support':'support', 'Build':'build', 'Visitor':'visitor' };
const ACC_CLASS = { 'Hotel Booked':'acc-booked', 'Alternative Accommodation':'acc-alt', 'TBC':'acc-tbc' };
const ACC_LABEL = { 'Hotel Booked':'Hotel booked', 'Alternative Accommodation':'Alternative accommodation', 'TBC':'TBC' };
const STATUS_CLASS = { 'Open':'status-open', 'In Progress':'status-progress', 'Done':'status-done', 'Confirmed':'status-done', 'Needs content':'status-progress', 'TBC':'status-open', 'To order':'status-open', 'Ordered':'status-progress', 'On stand':'status-done' };
const TAB_LABEL = { rota:'Staff rota', accom:'Accommodation', flights:'Flights', people:'Staff', info:'Show info', mkt:'MKT Only' };
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];

let EVENT = null;          // currently selected event object
let shifts = [], accom = [], flights = [], actions = [], links = [];
let EVENT_DAYS = [];
let activeTab = 'rota';
let activeDay = null;
const EDIT = new URLSearchParams(location.search).has('admin');   // ?admin=1 shows the edit tools
const DIR_CLASS = { 'Outbound':'build', 'Return':'both', 'Other':'off' };

/* ---------- helpers ---------- */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function parseISO(iso){ const [y,m,d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m-1, d)); }
function fmtDate(iso){
  if (!iso) return '';
  const d = parseISO(iso);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}
function nightsBetween(checkin, checkout){
  if (!checkin || !checkout) return '';
  const diff = Math.round((parseISO(checkout) - parseISO(checkin)) / 86400000);
  return diff > 0 ? diff : '';
}
function timeRange(s){ return s.activity==='Off' ? '&ndash;' : `${s.start||''}&ndash;${s.end||''}`; }
function mapEmbed(q){ return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed`; }
function mapLink(q){ return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`; }
function bindPeople(root){
  root.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click', ()=>openPersonModal(b.getAttribute('data-person'))));
}
const $ = id => document.getElementById(id);
function uid(){ return 'r' + Math.random().toString(36).slice(2,10); }
const ICON = {
  rota:  '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  accom: '<path d="M3 20V8l9-5 9 5v12M9 20v-6h6v6"/>',
  people:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.3 3.5 5.2"/>',
  info:  '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  mkt:   '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l2 2 3-4"/>',
  flights:'<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.2.4c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  edit:  '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  plus:  '<path d="M12 5v14M5 12h14"/>',
  download:'<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>',
  visitor:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  total: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.3 3.5 5.2"/>',
  build: '<path d="M14.5 6.5l3 3M3 21l7.5-7.5M13 4l7 7-3 3-7-7z"/>',
  sales: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  support:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
  hotel: '<path d="M3 20V8l9-5 9 5v12M9 20v-6h6v6"/>',
  alt:   '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>',
  tbc:   '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01"/>',
  go:    '<path d="M7 17L17 7M8 7h9v9"/>'
};
const svg = (name, size=18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
function metric(label, value, icon, tone){
  return `<div class="metric"><div class="m-ico t-${tone}">${svg(icon)}</div><div><div class="label">${label}</div><div class="value">${value}</div></div></div>`;
}
function initials(name){
  const p = name.trim().split(/\s+/);
  return ((p[0]||'')[0] + (p.length>1 ? p[p.length-1][0] : '')).toUpperCase();
}
/* ---- staff types (person level) ---- */
function legacyTypes(name){            // old exports used role/team on each shift
  const t = new Set();
  shifts.filter(s=>s.name===name).forEach(s=>{
    if (s.role==='Build Crew' || s.role==='Both') t.add('Build');
    if (s.role==='Customer-Facing' || s.role==='Both') t.add(s.team==='Support' ? 'Support' : 'Sales');
    if (s.team==='Sales' || s.team==='Support') t.add(s.team);
  });
  return [...t];
}
function personTypes(name){
  const p = (EVENT.people||[]).find(x=>x.name===name);
  const arr = p ? (p.types||[]) : legacyTypes(name);
  return TYPES.filter(t=>arr.includes(t));
}
function typeBadges(name, grey){
  const t = personTypes(name);
  if (!t.length) return EDIT ? '<span class="badge off">Set type</span>' : '&ndash;';
  return t.map(x=>`<span class="badge ${grey ? 'off' : TYPE_CLASS[x]}">${x}</span>`).join(' ');
}
function phaseClass(p){
  const t = (p||'').toLowerCase();
  if (t.includes('show')) return 'p-show';
  if (t.includes('takedown') || t.includes('breakdown') || t.includes('move-out')) return 'p-takedown';
  if (t.includes('build') || t.includes('move-in')) return 'p-build';
  return '';
}

/* ---------- event selection ---------- */
function getEvents(){ return (window.EVENTS || []); }

function initSelector(){
  const events = getEvents();
  const sel = $('eventSelect');
  sel.innerHTML = events.map(e=>`<option value="${escapeHtml(e.id)}">${escapeHtml(e.label)}</option>`).join('');
  const wanted = new URLSearchParams(location.search).get('event');
  const start = events.find(e=>e.id===wanted) || events.find(e=>e.default) || events[0];
  sel.value = start.id;
  sel.addEventListener('change', ()=>{
    const url = new URL(location.href);
    url.searchParams.set('event', sel.value);
    history.replaceState(null, '', url);
    loadEvent(sel.value);
  });
  loadEvent(start.id);
}

function recomputeDays(){
  EVENT_DAYS = (EVENT.days || []).map(d=>{
    const dt = parseISO(d.date);
    return { date:d.date, phase:d.phase, dow:DOW[dt.getUTCDay()], num:String(dt.getUTCDate()) };
  });
}

function loadEvent(id){
  EVENT = getEvents().find(e=>e.id===id);
  // arrays live on the event object itself, so edits (admin mode) survive switching events
  ['shifts','accom','flights','actions','links','info','days','people'].forEach(k=>{ EVENT[k] = EVENT[k] || []; });
  shifts = EVENT.shifts; accom = EVENT.accom; flights = EVENT.flights; actions = EVENT.actions; links = EVENT.links;
  activeDay = null;
  document.title = `${EVENT.title} | Greenspan Events HQ`;
  renderTabs();
  const tabs = EVENT.tabs || ['rota','accom','people','info','mkt'];
  switchTab(tabs.includes(activeTab) ? activeTab : tabs[0]);
  renderAll();
}

function renderAll(){
  recomputeDays();
  renderHeader(); render(); renderAccom(); renderFlights(); renderPeopleNotice();
  renderActions(); renderInfo(); renderLinks(); renderExpenses();
  if (activeTab==='people') renderPeople();
  syncEditUI();
}

/* admin-mode helpers (the edit logic itself lives in edit.js) */
function rowActions(kind, id){
  if (!EDIT) return '';
  return `<td class="row-actions" data-label=""><button class="icon-btn" type="button" data-edit="${kind}" data-id="${escapeHtml(String(id))}" aria-label="Edit">${svg('edit',15)}</button><button class="icon-btn del" type="button" data-del="${kind}" data-id="${escapeHtml(String(id))}" aria-label="Delete">${svg('trash',15)}</button></td>`;
}
function syncEditUI(){
  document.body.classList.toggle('is-edit', EDIT);
  if (!EDIT) return;
  document.querySelectorAll('table[data-editable] thead tr').forEach(tr=>{
    if (!tr.querySelector('.edit-col')) tr.insertAdjacentHTML('beforeend','<th class="edit-col"></th>');
  });
  document.querySelectorAll('[data-add]').forEach(el=>{
    el.innerHTML = `<button class="btn" type="button" data-add-btn="${el.dataset.add}">${svg('plus',14)} ${el.dataset.label}</button>`;
  });
  if (window.updateEditBar) window.updateEditBar();
}

/* ---------- header / tabs ---------- */
function renderHeader(){
  $('eventEyebrow').textContent = EVENT.eyebrow || EVENT.label.replace(/\s+[–-]\s+/, ' \u00b7 ');
  $('eventTitle').textContent = EVENT.title;
  $('eventSub').innerHTML = EVENT.subtitle || '';
  const badge = $('standBadge');
  if (EVENT.standNumber){
    $('standNum').textContent = EVENT.standNumber;
    if (EVENT.standUrl){ badge.href = EVENT.standUrl; badge.style.pointerEvents=''; }
    else { badge.removeAttribute('href'); badge.style.pointerEvents='none'; }
    badge.style.display = 'inline-flex';
  } else { badge.style.display = 'none'; }
  $('draftBanner').innerHTML = EVENT.draftNote ? `<div class="draft-banner">${EVENT.draftNote}</div>` : '';
}

function renderTabs(){
  const tabs = EVENT.tabs || ['rota','accom','people','info','mkt'];
  const el = $('tabs');
  el.innerHTML = tabs.map(t=>`<button class="tab-btn" role="tab" data-tab="${t}">${svg(t,16)}${TAB_LABEL[t]}</button>`).join('');
  el.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click', ()=>switchTab(b.getAttribute('data-tab'))));
}

function switchTab(tab){
  activeTab = tab;
  document.querySelectorAll('#tabs .tab-btn').forEach(b=>{ const on = b.getAttribute('data-tab')===tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  ['rota','accom','flights','people','info','mkt'].forEach(t=>{ $(t+'View').style.display = t===tab ? '' : 'none'; });
  if (tab==='people') renderPeople();
}

/* ---------- rota ---------- */
function computeDayCounts(iso){
  const rows = shifts.filter(s=>s.date===iso && s.activity !== 'Off');
  return { total: rows.length };
}

function renderDaystrip(){
  const el = $('daystrip');
  if (!EVENT_DAYS.length){ el.style.display='none'; return; }
  el.style.display = '';
  el.style.gridTemplateColumns = `repeat(${Math.min(EVENT_DAYS.length, 6)},1fr)`;
  el.innerHTML = EVENT_DAYS.map(d=>{
    const c = computeDayCounts(d.date);
    const active = activeDay===d.date ? 'active' : '';
    return `<button class="daycard ${active}" data-date="${d.date}" style="border:none; font-family:inherit;">
      <div class="dow">${d.dow}</div>
      <div class="datenum">${d.num}</div>
      <span class="phase-tag ${phaseClass(d.phase)}">${escapeHtml(d.phase)}</span>
      <div class="count"><b>${c.total}</b> on site</div>
    </button>`;
  }).join('');
  el.querySelectorAll('.daycard').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const date = btn.getAttribute('data-date');
      activeDay = (activeDay === date) ? null : date;
      render();
    });
  });
}

function renderSummary(){
  const names = getAllNames();
  const count = t => names.filter(n=>personTypes(n).includes(t)).length;
  $('summaryRow').innerHTML =
    metric('Total people', names.length, 'total', 'lav') + metric('Sales', count('Sales'), 'sales', 'peach') +
    metric('Support', count('Support'), 'support', 'pink') + metric('Build', count('Build'), 'build', 'teal') +
    metric('Visitor', count('Visitor'), 'visitor', 'blue');
}

function renderTable(){
  const title = $('tableTitle'), countEl = $('tableCount');
  let rows = [...shifts];
  if (activeDay){
    title.textContent = `Roster - ${fmtDate(activeDay)}`;
    rows = rows.filter(s=>s.date===activeDay && s.activity !== 'Off');
  } else { title.textContent = 'All staff movements'; }
  rows.sort((a,b)=> a.date===b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date));
  countEl.textContent = rows.length ? `${rows.length} shift${rows.length===1?'':'s'}` : '';
  const body = $('rotaBody');
  if (!rows.length){
    body.innerHTML = `<tr class="empty"><td colspan="6">No shifts ${activeDay ? 'on this day' : 'yet'}.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(s=>`
    <tr>
      <td data-label="Name"><button class="person-link" data-person="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button></td>
      <td data-label="Type">${typeBadges(s.name, s.activity==='Off')}</td>
      <td data-label="Date">${fmtDate(s.date)}</td>
      <td data-label="Activity">${escapeHtml(s.activity)}</td>
      <td data-label="Time">${timeRange(s)}</td>
      <td data-label="Notes">${escapeHtml(s.notes||'')}</td>${rowActions('shifts', s.id)}
    </tr>`).join('');
  bindPeople(body);
}

function render(){
  $('accessNotice').innerHTML = EVENT.accessNotice ? `<div class="notice warn">${EVENT.accessNotice}</div>` : '';
  renderDaystrip(); renderSummary(); renderTable();
}

/* ---------- accommodation ---------- */
function renderAccom(){
  const booked = accom.filter(a=>a.type==='Hotel Booked').length;
  const alt = accom.filter(a=>a.type==='Alternative Accommodation').length;
  const tbc = accom.filter(a=>a.type==='TBC').length;
  $('accomSummaryRow').innerHTML =
    metric('Total staff', accom.length, 'total', 'lav') + metric('Hotel booked', booked, 'hotel', 'teal') +
    metric('Alternative', alt, 'alt', 'peach') + metric('Still TBC', tbc, 'tbc', 'pink');
  $('accomCount').textContent = accom.length ? `${accom.length} ${accom.length===1?'person':'people'}` : '';
  const body = $('accomBody');
  if (!accom.length){ body.innerHTML = `<tr class="empty"><td colspan="8">No accommodation entries yet.</td></tr>`; return; }
  const sorted = [...accom].sort((a,b)=>a.name.localeCompare(b.name));
  body.innerHTML = sorted.map(a=>`
    <tr>
      <td data-label="Name"><button class="person-link" data-person="${escapeHtml(a.name)}">${escapeHtml(a.name)}</button></td>
      <td data-label="Type"><span class="badge ${ACC_CLASS[a.type] || 'acc-tbc'}">${ACC_LABEL[a.type] || escapeHtml(a.type)}</span></td>
      <td data-label="Hotel">${escapeHtml(a.hotel||'')}</td>
      <td data-label="Check-in">${a.checkin ? fmtDate(a.checkin) : '&ndash;'}</td>
      <td data-label="Check-out">${a.checkout ? fmtDate(a.checkout) : '&ndash;'}</td>
      <td data-label="Nights">${nightsBetween(a.checkin, a.checkout) || '&ndash;'}</td>
      <td data-label="Booking ref">${escapeHtml(a.ref||'')}</td>
      <td data-label="Notes">${escapeHtml(a.notes||'')}</td>${rowActions('accom', a.id)}
    </tr>`).join('');
  bindPeople(body);
}

/* ---------- flights ---------- */
function flightWhen(date, time){
  if (!date && !time) return '&ndash;';
  return `${date ? fmtDate(date) : ''}${time ? `${date ? ' &middot; ' : ''}${escapeHtml(time)}` : ''}`;
}
function renderFlights(){
  const key = f => (f.name||'').trim().toLowerCase();
  const travellers = new Set(flights.map(key).filter(Boolean)).size;
  const out = flights.filter(f=>f.direction==='Outbound').length;
  const ret = flights.filter(f=>f.direction==='Return').length;
  const tbc = flights.filter(f=>f.status==='TBC').length;
  $('flightsSummaryRow').innerHTML =
    metric('Travellers', travellers, 'total', 'lav') + metric('Outbound', out, 'flights', 'teal') +
    metric('Return', ret, 'flights', 'peach') + metric('Still TBC', tbc, 'tbc', 'pink');
  $('flightsCount').textContent = flights.length ? `${flights.length} flight${flights.length===1?'':'s'}` : '';
  const body = $('flightsBody');
  if (!flights.length){ body.innerHTML = `<tr class="empty"><td colspan="8">No flights added yet.</td></tr>`; return; }
  const sorted = [...flights].sort((a,b)=> ((a.departDate||'9999')+(a.departTime||'')).localeCompare((b.departDate||'9999')+(b.departTime||'')) || a.name.localeCompare(b.name));
  body.innerHTML = sorted.map(f=>`
    <tr>
      <td data-label="Name"><button class="person-link" data-person="${escapeHtml(f.name)}">${escapeHtml(f.name)}</button></td>
      <td data-label="Direction"><span class="badge ${DIR_CLASS[f.direction]||'off'}">${escapeHtml(f.direction||'Flight')}</span>${f.status==='TBC' ? ' <span class="badge acc-tbc">TBC</span>' : ''}</td>
      <td data-label="Flight"><b>${escapeHtml(((f.airline||'')+' '+(f.flightNo||'')).trim()) || '&ndash;'}</b></td>
      <td data-label="Route">${f.from||f.to ? `${escapeHtml(f.from||'?')} &rarr; ${escapeHtml(f.to||'?')}` : '&ndash;'}</td>
      <td data-label="Departs">${flightWhen(f.departDate, f.departTime)}</td>
      <td data-label="Arrives">${flightWhen(f.arriveDate, f.arriveTime)}</td>
      <td data-label="Booking ref">${escapeHtml(f.ref||'')}</td>
      <td data-label="Notes">${escapeHtml(f.notes||'')}</td>${rowActions('flights', f.id)}
    </tr>`).join('');
  bindPeople(body);
}

/* ---------- people ---------- */
function getAllNames(){
  return [...new Set([...shifts.map(s=>s.name), ...accom.map(a=>a.name), ...flights.map(f=>f.name), ...(EVENT.people||[]).map(p=>p.name)])].sort((a,b)=>a.localeCompare(b));
}
function daysOnSite(name){
  return new Set(shifts.filter(s=>s.name===name && s.activity!=='Off').map(s=>s.date)).size;
}
function renderPeopleNotice(){
  $('peopleNotice').innerHTML = EVENT.peopleNotice ? `<div class="notice info">${EVENT.peopleNotice}</div>` : '';
}
function renderPeople(){
  const names = getAllNames();
  const grid = $('peopleGrid');
  if (!names.length){ grid.innerHTML = `<div class="empty-note">No staff added for this event yet.</div>`; return; }
  const ex = EVENT.expenses;
  grid.innerHTML = names.map(name=>{
    const types = personTypes(name);
    const days = daysOnSite(name);
    const accEntry = accom.find(a=>a.name===name);
    const accLabel = accEntry ? (ACC_LABEL[accEntry.type] || accEntry.type) : 'Not entered';
    const accClass = accEntry ? (ACC_CLASS[accEntry.type] || 'acc-tbc') : 'acc-tbc';
    return `
      <button class="person-card" data-person="${escapeHtml(name)}" type="button">
        <div class="avatar ${types.length ? TYPE_CLASS[types[0]] : 'none'}">${escapeHtml(initials(name))}</div>
        <div class="pname">${escapeHtml(name)}</div>
        <div class="ptags">
          ${typeBadges(name)}
        </div>
        <div class="pmeta"><span><b style="color:var(--ink);">${days}</b> day${days===1?'':'s'} on site${ex ? ` &middot; ${ex.symbol}${days*ex.perDay} allowance` : ''}</span><span class="badge ${accClass}" style="font-size:11px;">${escapeHtml(accLabel)}</span></div>
      </button>`;
  }).join('');
  bindPeople(grid);
}

function openPersonModal(name){
  $('personModalTitle').textContent = name;
  $('personTags').innerHTML = personTypes(name).map(t=>`<span class="badge ${TYPE_CLASS[t]}">${t}</span>`).join('') || '<span class="empty-note">No staff type set</span>';
  const mine = shifts.filter(s=>s.name===name).sort((a,b)=>a.date.localeCompare(b.date));
  $('personSchedule').innerHTML = !mine.length ? `<div class="empty-note">No shifts recorded yet.</div>` : mine.map(s=>`
    <div class="schedule-row">
      <div class="sr-date">${fmtDate(s.date)}</div>
      <div class="sr-mid">${escapeHtml(s.activity)}${s.notes ? ` &middot; ${escapeHtml(s.notes)}` : ''}</div>
      <div class="sr-time">${timeRange(s)}</div>
    </div>`).join('');
  const myAcc = accom.filter(a=>a.name===name);
  $('personAccom').innerHTML = !myAcc.length ? `<div class="empty-note">No accommodation entry yet.</div>` : myAcc.map(a=>`
    <div class="accom-row">
      <div class="ar-top">
        <span class="badge ${ACC_CLASS[a.type] || 'acc-tbc'}">${ACC_LABEL[a.type] || escapeHtml(a.type)}</span>
        <span class="ar-detail">${a.checkin && a.checkout ? `${fmtDate(a.checkin)} &ndash; ${fmtDate(a.checkout)} (${nightsBetween(a.checkin,a.checkout) || '?'} nights)` : ''}</span>
      </div>
      ${a.hotel ? `<div class="ar-detail">${escapeHtml(a.hotel)}</div>` : ''}
      ${a.ref ? `<div class="ar-detail">Ref: ${escapeHtml(a.ref)}</div>` : ''}
      ${a.notes ? `<div class="ar-detail">${escapeHtml(a.notes)}</div>` : ''}
    </div>`).join('');
  const myFlights = flights.filter(f=>f.name===name).sort((a,b)=>((a.departDate||'')+(a.departTime||'')).localeCompare((b.departDate||'')+(b.departTime||'')));
  const showFlights = myFlights.length || (EVENT.tabs||[]).includes('flights');
  $('personFlightsBlock').style.display = showFlights ? '' : 'none';
  $('personFlights').innerHTML = !myFlights.length ? `<div class="empty-note">No flights recorded yet.</div>` : myFlights.map(f=>`
    <div class="accom-row">
      <div class="ar-top">
        <span class="badge ${DIR_CLASS[f.direction]||'off'}">${escapeHtml(f.direction||'Flight')}${f.status==='TBC' ? ' &middot; TBC' : ''}</span>
        <span class="ar-detail">${flightWhen(f.departDate, f.departTime)}</span>
      </div>
      <div class="ar-detail"><b style="color:var(--ink);">${escapeHtml(((f.airline||'')+' '+(f.flightNo||'')).trim())}</b>${f.from||f.to ? ` &middot; ${escapeHtml(f.from||'?')} &rarr; ${escapeHtml(f.to||'?')}` : ''}${f.arriveDate||f.arriveTime ? ` &middot; arrives ${flightWhen(f.arriveDate, f.arriveTime)}` : ''}</div>
      ${f.ref ? `<div class="ar-detail">Ref: ${escapeHtml(f.ref)}</div>` : ''}
      ${f.notes ? `<div class="ar-detail">${escapeHtml(f.notes)}</div>` : ''}
    </div>`).join('');
  $('personModalBackdrop').classList.add('show');
  if (window.onPersonModal) window.onPersonModal(name);
}
function closePersonModal(){ $('personModalBackdrop').classList.remove('show'); }

/* ---------- show info (config-driven sections) ---------- */
function renderInfo(){
  const sections = EVENT.info || [];
  $('infoSections').innerHTML = sections.map((sec, idx)=>{
    let inner = '';
    if (sec.type==='venue' || sec.type==='hotel'){
      inner = `<div class="info-pad">
        ${sec.heading ? `<h4 class="info-h4">${escapeHtml(sec.heading)}</h4>` : ''}
        ${sec.tagline ? `<p class="info-strong">${escapeHtml(sec.tagline)}</p>` : ''}
        ${sec.address ? `<p class="info-soft" style="margin-bottom:${sec.extra ? 4 : 14}px;">${escapeHtml(sec.address)}</p>` : ''}
        ${sec.extra ? `<p class="info-soft">${escapeHtml(sec.extra)}</p>` : ''}
        ${sec.mapQuery ? `<iframe class="venue-map" loading="lazy" src="${mapEmbed(sec.mapQuery)}"></iframe>
        <p style="margin:10px 0 ${sec.directions ? 14 : 0}px;"><a class="info-map-link" href="${mapLink(sec.mapLinkQuery || sec.mapQuery)}" target="_blank" rel="noopener">Open in Google Maps &rarr;</a></p>` : ''}
        ${sec.directions ? `<div class="info-body" style="border-top:1px solid var(--hairline); padding-top:14px; color:var(--ink-soft); font-size:14px; line-height:1.6;">${sec.directions}</div>` : ''}
      </div>`;
    } else if (sec.type==='floorplan'){
      inner = `<div class="info-pad">
        ${sec.caption ? `<p style="margin:0 0 12px; color:var(--ink-soft); font-size:14px;">${sec.caption}</p>` : ''}
        ${sec.image ? `<img class="info-img" src="${escapeHtml(sec.image)}" alt="${escapeHtml(sec.alt||'Floor plan')}">` : `<div class="empty-note">Floor plan to be added.</div>`}
      </div>`;
    } else if (sec.type==='uniform'){
      inner = `<div class="info-pad" style="display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start;">
        ${sec.image ? `<img class="uniform-img" src="${escapeHtml(sec.image)}" alt="${escapeHtml(sec.alt||'Uniform')}">` : ''}
        <div style="flex:1; min-width:220px;">
          <p style="margin:0 0 12px; color:var(--ink-soft); font-size:14px; line-height:1.6;">${escapeHtml(sec.intro || 'What to wear on the stand:')}</p>
          <ul style="margin:0; padding-left:18px; font-size:14px; line-height:1.9; color:var(--ink);">
            ${(sec.items||[]).map(i=>`<li>${escapeHtml(i.text)}${i.note ? ` <span style="color:var(--ink-soft);">&ndash; ${escapeHtml(i.note)}</span>` : ''}</li>`).join('')}
          </ul>
        </div>
      </div>`;
    } else { // generic notes section
      inner = `<div class="info-pad info-body" style="font-size:14px; line-height:1.6;">${sec.html || ''}</div>`;
    }
    const ctrl = EDIT ? `<span class="panel-tools"><button class="icon-btn" type="button" data-edit="info" data-id="${idx}" aria-label="Edit section">${svg('edit',15)}</button><button class="icon-btn del" type="button" data-del="info" data-id="${idx}" aria-label="Delete section">${svg('trash',15)}</button></span>` : '';
    return `<section class="panel"><div class="panel-head"><h2>${escapeHtml(sec.title)}</h2>${ctrl}</div>${inner}</section>`;
  }).join('') + (EDIT ? `<div style="margin-bottom:22px;"><button class="btn" type="button" data-add-btn="info">${svg('plus',14)} Add info section</button></div>` : '');
}

function renderLinks(){
  $('linksCount').textContent = links.length ? `${links.length} link${links.length===1?'':'s'}` : '';
  const grid = $('linkGrid');
  if (!links.length){ grid.innerHTML = `<div class="empty-note">No links added yet.</div>`; return; }
  grid.innerHTML = links.map(l=> EDIT
    ? `<div class="link-card ${l.url ? '' : 'is-pending'}">
        <div><div class="lc-label">${escapeHtml(l.label)}</div>${l.url ? `<div class="lc-notes">${escapeHtml(l.url)}</div>` : ''}${l.notes ? `<div class="${l.url ? 'lc-notes' : 'lc-empty'}">${escapeHtml(l.notes)}</div>` : ''}</div>
        <span class="panel-tools"><button class="icon-btn" type="button" data-edit="links" data-id="${escapeHtml(l.id)}" aria-label="Edit">${svg('edit',15)}</button><button class="icon-btn del" type="button" data-del="links" data-id="${escapeHtml(l.id)}" aria-label="Delete">${svg('trash',15)}</button></span></div>`
    : l.url
    ? `<a class="link-card" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
        <div><div class="lc-label">${escapeHtml(l.label)}</div>${l.notes ? `<div class="lc-notes">${escapeHtml(l.notes)}</div>` : ''}</div>
        <span class="lc-go">${svg('go',16)}</span></a>`
    : `<div class="link-card is-pending">
        <div><div class="lc-label">${escapeHtml(l.label)}</div>${l.notes ? `<div class="lc-empty">${escapeHtml(l.notes)}</div>` : ''}</div></div>`).join('');
}

/* ---------- MKT only ---------- */
function renderActions(){
  const openCount = actions.filter(a=>a.status!=='Done').length;
  $('actionsCount').textContent = actions.length ? `${openCount} open of ${actions.length}` : '';
  const body = $('actionsBody');
  if (!actions.length){ body.innerHTML = `<tr class="empty"><td colspan="4">No actions yet.</td></tr>`; return; }
  const order = { 'Open':0, 'In Progress':1, 'Done':2 };
  const sorted = [...actions].sort((a,b)=> (order[a.status]??1) - (order[b.status]??1));
  body.innerHTML = sorted.map(a=>`
    <tr>
      <td data-label="Category"><b>${escapeHtml(a.category||'')}</b></td>
      <td data-label="Task">${escapeHtml(a.task)}</td>
      <td data-label="Status"><span class="badge ${STATUS_CLASS[a.status]||'status-open'}">${escapeHtml(a.status)}</span></td>
      <td data-label="Notes">${escapeHtml(a.notes||'')}</td>${rowActions('actions', a.id)}
    </tr>`).join('');
}

function renderExpenses(){
  const ex = EVENT.expenses;
  $('expensesPanel').style.display = ex ? '' : 'none';
  if (!ex) return;
  $('expensesIntro').textContent = `${ex.symbol}${ex.perDay}/day for every day on the rota that isn't marked "Off" - calculated automatically from the Staff Rota tab.`;
  $('expensesNote').innerHTML = ex.note ? `<div class="notice info" style="margin:14px 22px 0;">${ex.note}</div>` : '';
  const names = [...new Set(shifts.map(s=>s.name))].sort((a,b)=>a.localeCompare(b));
  const rows = names.map(n=>({ name:n, days:daysOnSite(n) }));
  const total = rows.reduce((t,r)=>t + r.days*ex.perDay, 0);
  $('expensesCount').textContent = rows.length ? `Total ${ex.symbol}${total}` : '';
  $('expensesBody').innerHTML = rows.length ? rows.map(r=>`
    <tr><td data-label="Name"><b>${escapeHtml(r.name)}</b></td><td data-label="Days">${r.days}</td><td data-label="Amount owed"><b>${ex.symbol}${r.days*ex.perDay}</b></td></tr>`).join('')
    : `<tr class="empty"><td colspan="3">No staff yet.</td></tr>`;
}

/* ---------- Excel export ---------- */
function exportExcel(){
  const header = ['Staff Name','Staff Type','Date','Activity','Start Time','End Time','Location / Notes'];
  const sorted = [...shifts].sort((a,b)=> a.date===b.date ? a.name.localeCompare(b.name) : a.date.localeCompare(b.date));
  const ws = XLSX.utils.aoa_to_sheet([header, ...sorted.map(s=>[
    s.name, personTypes(s.name).join(', '), new Date(s.date + 'T00:00:00'), s.activity, s.start, s.end, s.notes || '' ])]);
  ws['!cols'] = [{wch:22},{wch:20},{wch:12},{wch:18},{wch:11},{wch:11},{wch:32}];
  for (let r=1; r<=sorted.length; r++){ const c = ws[XLSX.utils.encode_cell({r, c:2})]; if (c) c.z = 'dd-mmm-yyyy'; }

  const accSorted = [...accom].sort((a,b)=>a.name.localeCompare(b.name));
  const aws = XLSX.utils.aoa_to_sheet([
    ['Staff Name','Accommodation Type','Hotel / Address','Check-in','Check-out','Nights','Booking Reference','Notes'],
    ...accSorted.map(a=>[ a.name, a.type, a.hotel || '',
      a.checkin ? new Date(a.checkin + 'T00:00:00') : '', a.checkout ? new Date(a.checkout + 'T00:00:00') : '',
      nightsBetween(a.checkin, a.checkout) || '', a.ref || '', a.notes || '' ])]);
  aws['!cols'] = [{wch:22},{wch:22},{wch:38},{wch:12},{wch:12},{wch:9},{wch:18},{wch:28}];
  for (let r=1; r<=accSorted.length; r++){
    [3,4].forEach(c=>{ const cell = aws[XLSX.utils.encode_cell({r, c})]; if (cell) cell.z = 'dd-mmm-yyyy'; });
  }
  const names = getAllNames();
  const pws = XLSX.utils.aoa_to_sheet([['Name','Staff Type'], ...names.map(n=>[n, personTypes(n).join(', ')])]);
  pws['!cols'] = [{wch:24},{wch:28}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, pws, 'People');
  XLSX.utils.book_append_sheet(wb, ws, 'Staff Movements');
  XLSX.utils.book_append_sheet(wb, aws, 'Accommodation');
  if (flights.length || (EVENT.tabs||[]).includes('flights')){
    const fs = [...flights].sort((a,b)=>((a.departDate||'')+(a.departTime||'')).localeCompare((b.departDate||'')+(b.departTime||'')));
    const fws = XLSX.utils.aoa_to_sheet([
      ['Staff Name','Direction','Status','Airline','Flight No','From','To','Depart Date','Depart Time','Arrive Date','Arrive Time','Booking Reference','Notes'],
      ...fs.map(f=>[f.name, f.direction||'', f.status||'', f.airline||'', f.flightNo||'', f.from||'', f.to||'',
        f.departDate ? new Date(f.departDate+'T00:00:00') : '', f.departTime||'', f.arriveDate ? new Date(f.arriveDate+'T00:00:00') : '', f.arriveTime||'', f.ref||'', f.notes||''])]);
    fws['!cols'] = [{wch:22},{wch:11},{wch:9},{wch:16},{wch:10},{wch:8},{wch:8},{wch:12},{wch:11},{wch:12},{wch:11},{wch:16},{wch:30}];
    for (let r=1; r<=fs.length; r++){ [7,9].forEach(c=>{ const cell = fws[XLSX.utils.encode_cell({r, c})]; if (cell) cell.z = 'dd-mmm-yyyy'; }); }
    XLSX.utils.book_append_sheet(wb, fws, 'Flights');
  }
  const mws = XLSX.utils.aoa_to_sheet([['Category','Task','Status','Notes'], ...actions.map(a=>[a.category||'', a.task, a.status, a.notes||''])]);
  mws['!cols'] = [{wch:18},{wch:70},{wch:12},{wch:30}];
  XLSX.utils.book_append_sheet(wb, mws, 'MKT Only');
  const lws = XLSX.utils.aoa_to_sheet([['Label','URL','Notes'], ...links.map(l=>[l.label, l.url||'', l.notes||''])]);
  lws['!cols'] = [{wch:30},{wch:50},{wch:40}];
  XLSX.utils.book_append_sheet(wb, lws, 'Key Links');
  XLSX.writeFile(wb, `${EVENT.id}_export.xlsx`);
}

/* ---------- wiring ---------- */
$('personBtnClose').addEventListener('click', closePersonModal);
$('personModalBackdrop').addEventListener('click', e=>{ if (e.target.id==='personModalBackdrop') closePersonModal(); });
$('btnExport').addEventListener('click', exportExcel);
$('btnTheme').addEventListener('click', ()=>{
  const root = document.documentElement;
  const dark = (root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  root.setAttribute('data-theme', dark ? 'light' : 'dark');
});
$('btnPrint').addEventListener('click', ()=>window.print());
initSelector();
