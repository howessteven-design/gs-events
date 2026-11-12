/* Greenspan Events HQ - generic, read-only event app.
   All event-specific content lives in /events/*.js (window.EVENTS). */

const TYPES = ['Sales','Support','Build','Visitor'];          // staff types - a person can have several
const TYPE_CLASS = { 'Sales':'sales', 'Support':'support', 'Build':'build', 'Visitor':'visitor' };
const ACC_CLASS = { 'Hotel Booked':'acc-booked', 'Alternative Accommodation':'acc-alt', 'TBC':'acc-tbc' };
const ACC_LABEL = { 'Hotel Booked':'Hotel booked', 'Alternative Accommodation':'Alternative accommodation', 'TBC':'TBC' };
const STATUS_CLASS = { 'Open':'status-open', 'In Progress':'status-progress', 'Done':'status-done', 'Confirmed':'status-done', 'Needs content':'status-progress', 'TBC':'status-open', 'To order':'status-open', 'Ordered':'status-progress', 'On stand':'status-done' };
const TAB_LABEL = { rota:'Staff rota', evenings:'Evenings', accom:'Accommodation', flights:'Flights', people:'Staff', info:'Show info', mkt:'MKT Only' };
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];

let EVENT = null;          // currently selected event object
let shifts = [], accom = [], flights = [], actions = [], links = [];
let EVENT_DAYS = [];
let activeTab = 'rota';
let activeDay = null;
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch(e){ return ''; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch(e){} };
let ME = lsGet('gs_me');          // 'Show only me' choice, remembered on this device
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
  go:    '<path d="M7 17L17 7M8 7h9v9"/>',
  evenings:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  cal:   '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14v4M10 16h4"/>',
  pin:   '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
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
/* Are this person's flights booked? Worked out from the Flights tab. */
function flightStatus(name){
  const legs = flights.filter(f=>f.name===name);
  if (!legs.length) return { label:'No flights listed', cls:'off' };
  if (legs.some(f=>f.status==='TBC')) return { label:'Flights TBC', cls:'custfacing' };
  const out = legs.some(f=>f.direction==='Outbound'), ret = legs.some(f=>f.direction==='Return');
  if (out && ret) return { label:'Flights booked', cls:'build' };
  return { label: out ? 'Outbound only' : ret ? 'Return only' : 'Flights booked', cls:'custfacing' };
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

function tabsFor(ev){
  const t = [...(ev.tabs || ['rota','accom','people','info','mkt'])];
  if ((ev.evenings||[]).length && !t.includes('evenings')) t.splice(Math.min(1, t.length), 0, 'evenings');   // evenings never get hidden once added
  return t;
}
function loadEvent(id){
  EVENT = getEvents().find(e=>e.id===id);
  // arrays live on the event object itself, so edits (admin mode) survive switching events
  ['shifts','accom','flights','actions','links','info','days','people','evenings'].forEach(k=>{ EVENT[k] = EVENT[k] || []; });
  shifts = EVENT.shifts; accom = EVENT.accom; flights = EVENT.flights; actions = EVENT.actions; links = EVENT.links;
  activeDay = null;
  document.title = `${EVENT.title} | Greenspan Events HQ`;
  renderTabs();
  const tabs = tabsFor(EVENT);
  switchTab(tabs.includes(activeTab) ? activeTab : tabs[0]);
  renderAll();
}

function renderAll(){
  recomputeDays();
  renderHeader(); render(); renderAccom(); renderFlights(); renderPeopleNotice();
  renderActions(); renderInfo(); renderLinks(); renderExpenses(); renderEvenings();
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
  const tabs = tabsFor(EVENT);
  const el = $('tabs');
  el.innerHTML = tabs.map(t=>`<button class="tab-btn" role="tab" data-tab="${t}">${svg(t,16)}${TAB_LABEL[t]}</button>`).join('');
  el.querySelectorAll('.tab-btn').forEach(b=>b.addEventListener('click', ()=>switchTab(b.getAttribute('data-tab'))));
}

function switchTab(tab){
  activeTab = tab;
  document.querySelectorAll('#tabs .tab-btn').forEach(b=>{ const on = b.getAttribute('data-tab')===tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
  ['rota','evenings','accom','flights','people','info','mkt'].forEach(t=>{ $(t+'View').style.display = t===tab ? '' : 'none'; });
  if (tab==='people') renderPeople();
  if (tab==='evenings') renderEvenings();
}

/* ---------- rota ---------- */
/* Flights next to the stand: show landing / take-off times on cover days and flag tight connections */
const ARRIVE_BUFFER = 60;    // minutes needed between landing and the stand starting (airport -> venue)
const DEPART_BUFFER = 150;   // minutes needed between the stand ending and take-off (venue -> airport + security)
const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t||''); return m ? (+m[1])*60 + (+m[2]) : null; };
function travelFor(s){
  if (!s || s.activity !== 'On Stand') return null;
  const bits = [], warn = [];
  flights.filter(f=>f.name===s.name).forEach(f=>{
    const dir = f.direction || '';
    if (dir !== 'Return' && f.arriveDate===s.date && f.arriveTime){
      bits.push(`lands ${f.arriveTime}${f.to ? ' ' + f.to : ''}`);
      const a = toMin(f.arriveTime), st = toMin(s.start);
      if (a!=null && st!=null && a + ARRIVE_BUFFER > st) warn.push(`lands ${f.arriveTime}, stand starts ${s.start}`);
    }
    if (dir !== 'Outbound' && f.departDate===s.date && f.departTime){
      bits.push(`flies ${f.departTime}${f.from ? ' ' + f.from : ''}`);
      const d = toMin(f.departTime), en = toMin(s.end);
      if (d!=null && en!=null && d - DEPART_BUFFER < en) warn.push(`flies ${f.departTime}, stand ends ${s.end}`);
    }
  });
  return bits.length ? { text:bits.join(' \u00b7 '), warn } : null;
}
const travelHTML = s => { const t = travelFor(s); return t ? ` <span class="trav${t.warn.length ? ' warn' : ''}" title="${escapeHtml(t.warn.join('; '))}">${escapeHtml(t.text)}</span>${t.warn.length ? ' <span class="badge custfacing">Check</span>' : ''}` : ''; };

/* Default stand cover: Sales + Support are on the stand for show hours unless they have a shift of their own that day */
function standCoverDays(){ const sc = EVENT.standCover; return (sc && Array.isArray(sc.days)) ? sc.days : []; }
function effectiveShifts(){
  const days = standCoverDays(); if (!days.length) return shifts;
  const types = (EVENT.standCover.types && EVENT.standCover.types.length) ? EVENT.standCover.types : ['Sales','Support'];
  const byDate = {}; days.forEach(d=>{ byDate[d.date] = d; });
  // an "On Stand" shift with no times of its own simply means "default hours"
  const out = shifts.map(s=>{ const d = byDate[s.date]; return (d && s.activity==='On Stand' && !s.start && !s.end) ? { ...s, start:d.start, end:d.end, defaulted:true } : s; });
  getAllNames().filter(n=>personTypes(n).some(t=>types.includes(t))).forEach(n=>{
    days.forEach(d=>{
      const own = shifts.some(s=>s.name===n && s.date===d.date && !/evening|network|social|dinner|party|travel|flight/i.test(s.activity||''));
      if (!own) out.push({ id:'v:'+n+':'+d.date, name:n, date:d.date, activity:'On Stand', start:d.start, end:d.end, virtual:true });
    });
  });
  return out;
}
function meName(){ return (ME && getAllNames().includes(ME)) ? ME : ''; }
function computeDayCounts(iso){
  const rows = effectiveShifts().filter(s=>s.date===iso && s.activity !== 'Off');
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

function shiftRow(s, cls){
  const virt = !!s.virtual, eve = !!s.evening;
  return `
    <tr class="${cls||''}${virt ? ' virtual' : ''}${eve ? ' evening-row' : ''}">
      <td data-label="Name"><button class="person-link" data-person="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button></td>
      <td data-label="Type">${typeBadges(s.name, s.activity==='Off')}</td>
      <td data-label="Date">${fmtDate(s.date)}</td>
      <td data-label="Activity">${escapeHtml(s.activity)}</td>
      <td data-label="Time">${timeRange(s)}</td>
      <td data-label="Notes">${escapeHtml(s.notes || (virt ? 'Default stand cover' : ''))}${eve ? '' : travelHTML(s)}</td>${(virt || eve) ? (EDIT ? '<td class="row-actions" data-label=""></td>' : '') : rowActions('shifts', s.id)}
    </tr>`;
}
function renderTable(){
  const title = $('tableTitle'), countEl = $('tableCount');
  const me = meName();
  const all = effectiveShifts();
  let rows = [...all];
  if (me){ rows = rows.filter(s=>s.name===me); title.textContent = `My schedule - ${me}`; }
  else if (activeDay) title.textContent = `Roster - ${fmtDate(activeDay)}`;
  else title.textContent = 'All staff movements';
  if (me && !activeDay){                              // my schedule also lists the evenings I can get to
    (EVENT.evenings||[]).filter(e=>appliesTo(e,me) && attendance(e,me).status!=='no').forEach(e=>rows.push({ id:'e:'+e.id, name:me, date:e.date, activity:'Evening: '+e.title, start:e.start, end:e.end, notes:e.venue||'', evening:true }));
  }
  if (activeDay) rows = rows.filter(s=>s.date===activeDay);
  if (activeDay && !me) rows = rows.filter(s=>s.activity !== 'Off');
  rows.sort((a,b)=> a.date===b.date ? (me ? (a.start||'99').localeCompare(b.start||'99') : (a.virtual===b.virtual ? a.name.localeCompare(b.name) : (a.virtual ? -1 : 1))) : a.date.localeCompare(b.date));
  const group = !me && !activeDay && rows.some(s=>s.virtual || s.defaulted);      // overview: one line per day for the default cover
  const body = $('rotaBody');
  let html = '', shown = 0;
  if (group){
    const byDate = {};
    rows.filter(s=>s.virtual || s.defaulted).forEach(s=>{ (byDate[s.date] = byDate[s.date] || []).push(s); });
    const real = rows.filter(s=>!s.virtual && !s.defaulted);
    const dates = [...new Set([...Object.keys(byDate), ...real.map(s=>s.date)])].sort();
    dates.forEach(d=>{
      const v = byDate[d];
      if (v){
        v.sort((a,b)=>a.name.localeCompare(b.name));
        const names = v.map(s=>`<button class="person-link" data-person="${escapeHtml(s.name)}">${escapeHtml(s.name)}</button>${travelHTML(s)}`).join(', ');
        const checks = v.filter(s=>{ const t = travelFor(s); return t && t.warn.length; }).length;
        html += `<tr class="cover-row"><td data-label="Name"><b>Stand cover</b><div class="cover-names">${names}</div></td>
          <td data-label="Type"><span class="badge sales">Sales</span> <span class="badge support">Support</span></td>
          <td data-label="Date">${fmtDate(d)}</td><td data-label="Activity">On Stand</td><td data-label="Time">${timeRange(v[0])}</td>
          <td data-label="Notes">${v.length} people &middot; default cover${checks ? ` &middot; <span class="badge custfacing">${checks} to check</span>` : ''}</td>${EDIT ? '<td class="row-actions" data-label=""></td>' : ''}</tr>`;
        shown++;
      }
      real.filter(s=>s.date===d).forEach(s=>{ html += shiftRow(s); shown++; });
    });
    countEl.textContent = `${real.length} listed shift${real.length===1?'':'s'} + default cover`;
  } else {
    rows.forEach(s=>{ html += shiftRow(s); shown++; });
    countEl.textContent = rows.length ? `${rows.length} shift${rows.length===1?'':'s'}` : '';
  }
  if (!shown){
    body.innerHTML = `<tr class="empty"><td colspan="6">${me ? 'Nothing scheduled for you yet.' : `No shifts ${activeDay ? 'on this day' : 'yet'}.`}</td></tr>`;
    return;
  }
  body.innerHTML = html;
  bindPeople(body);
}

/* ---------- view-as / cover note / evening strip (rota tab) ---------- */
function renderMe(){
  const el = $('meRow'), names = getAllNames();
  if (!names.length){ el.innerHTML = ''; return; }
  const me = meName();
  el.innerHTML = `<label for="meSelect">Show</label><select id="meSelect"><option value="">Everyone</option>${names.map(n=>`<option value="${escapeHtml(n)}" ${n===me?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select>${me ? '<span class="me-hint">Just your schedule &middot; remembered on this device</span>' : ''}`;
  $('meSelect').addEventListener('change', e=>{ ME = e.target.value; lsSet('gs_me', ME); render(); renderEvenings(); setTimeout(()=>{ const r = $('meRow'); if (r && r.scrollIntoView) r.scrollIntoView({ block:'start', behavior:'smooth' }); }, 60); });
}
function coverNoteHTML(){
  const days = standCoverDays();
  if (!days.length) return '';
  const groups = {};
  days.forEach(d=>{ const k = `${d.start}&ndash;${d.end}`; (groups[k] = groups[k] || []).push(d.date); });
  const parts = Object.entries(groups).map(([k,ds])=>`${ds.map(fmtDate).join(', ')}: <b>${k}</b>`).join(' &middot; ');
  const types = ((EVENT.standCover.types && EVENT.standCover.types.length) ? EVENT.standCover.types : ['Sales','Support']).join(' and ');
  return `<div class="notice info"><b>Stand cover</b> &ndash; ${types} are on the stand by default: ${parts}. Cover lunch and breaks between you. Only changes to this (half days, days off, late starts) are listed below &ndash; tap a day to see everyone, or pick your name to see just yours.</div>`;
}
function renderEveningStrip(){
  const el = $('eveningStrip'), all = [...(EVENT.evenings||[])];
  if (!all.length){ el.innerHTML = ''; return; }
  const list = all.filter(e=>!activeDay || e.date===activeDay).sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
  el.innerHTML = `<div class="evening-strip"><span class="es-label">${svg('evenings',14)} Evenings</span>${list.map(e=>`<button type="button" class="es-chip" data-goto-evenings="1"><b>${fmtDate(e.date)}</b> ${escapeHtml(e.title)}${e.start ? ` &middot; ${escapeHtml(e.start)}` : ''}</button>`).join('') || '<span class="es-none">No evening event on this day</span>'}</div>`;
}

function render(){
  const me = meName(), access = EVENT.accessNotice ? `<div class="notice warn">${EVENT.accessNotice}</div>` : '', cover = coverNoteHTML();
  $('rotaView').classList.toggle('me-mode', !!me);      // phone-friendly: my own schedule straight under the picker
  if (me){
    $('accessNotice').innerHTML = (access || cover) ? `<details class="rules-fold"><summary>Key rules &amp; stand cover</summary>${access}${cover}</details>` : '';
    $('coverNote').innerHTML = '';
  } else { $('accessNotice').innerHTML = access; $('coverNote').innerHTML = cover; }
  renderMe(); renderDaystrip(); renderEveningStrip(); renderSummary(); renderTable();
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
  return new Set(effectiveShifts().filter(s=>s.name===name && s.activity!=='Off').map(s=>s.date)).size;
}
/* ---------- expense allowance ----------
   Applies only to people ticked "Daily expense allowance: Yes" (edit mode, Staff tab -> Edit person).
   Travel days = the day they land on their first outbound flight and the day they land on their last return flight.
   Those two days are expensed separately; every day in between earns the daily allowance. */
function expRate(){ const ex = EVENT.expenses; return ex && Number(ex.perDay) > 0 ? Number(ex.perDay) : 0; }
function expSymbol(){ return (EVENT.expenses && EVENT.expenses.symbol) || '\u00a3'; }
function expOn(name){ const p = (EVENT.people||[]).find(x=>x.name===name); return !!(p && p.allowance === 'Yes'); }
function fmtMoney(sym, n){ n = Math.round(n*100)/100; return sym + (Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits:2, maximumFractionDigits:2 })); }
function addDaysISO(iso, n){ return new Date(parseISO(iso).getTime() + n*86400000).toISOString().slice(0,10); }
function expWindow(name){
  const p = (EVENT.people||[]).find(x=>x.name===name);
  const fl = flights.filter(f=>f.name===name);
  const outs = fl.filter(f=>f.direction==='Outbound' && f.arriveDate).map(f=>f.arriveDate);
  const rets = fl.filter(f=>f.direction==='Return' && (f.arriveDate || f.departDate)).map(f=>f.arriveDate || f.departDate);
  const first = outs.length ? outs.reduce((x,y)=>x>y?x:y) : '';                 // landing day of the last outbound leg
  let last = rets.length ? rets.reduce((x,y)=>x>y?x:y) : '';                    // landing day of the last return leg
  if (!last && p && p.lastTravelDay) last = p.lastTravelDay;                      // manual last travel day (no return flight entered)
  if (!first) return { name, ok:false, need:'Arrival flight needed', first, last, days:0, dates:[], total:0 };
  if (!last)  return { name, ok:false, need:'Return date needed', first, last, days:0, dates:[], total:0 };
  const dates = []; for (let d = addDaysISO(first, 1); d < last; d = addDaysISO(d, 1)) dates.push(d);
  return { name, ok:true, first, last, days:dates.length, dates, total:dates.length * expRate() };
}
function renderPeopleNotice(){
  $('peopleNotice').innerHTML = EVENT.peopleNotice ? `<div class="notice info">${EVENT.peopleNotice}</div>` : '';
}
function renderPeople(){
  const names = getAllNames();
  const grid = $('peopleGrid');
  if (!names.length){ grid.innerHTML = `<div class="empty-note">No staff added for this event yet.</div>`; return; }
  grid.innerHTML = names.map(name=>{
    const types = personTypes(name);
    const fs = flightStatus(name);
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
        <div class="pmeta"><span><b style="color:var(--ink);">${days}</b> day${days===1?'':'s'} on site</span><span style="display:flex; gap:6px; flex-wrap:wrap;"><span class="badge ${accClass}" style="font-size:11px;">${escapeHtml(accLabel)}</span><span class="badge ${fs.cls}" style="font-size:11px;">${fs.label}</span></span></div>
      </button>`;
  }).join('');
  bindPeople(grid);
}

function openPersonModal(name){
  $('personModalTitle').textContent = name;
  $('personTags').innerHTML = (personTypes(name).map(t=>`<span class="badge ${TYPE_CLASS[t]}">${t}</span>`).join('') || '<span class="empty-note">No staff type set</span>') + (() => { const f = flightStatus(name); return ` <span class="badge ${f.cls}">${f.label}</span>`; })();
  const mine = effectiveShifts().filter(s=>s.name===name).map(s=>({ date:s.date, sort:s.start||'', label:s.activity, note:[s.notes || (s.virtual ? 'Default stand cover' : ''), (()=>{ const t = travelFor(s); return t ? t.text + (t.warn.length ? ' (check timing)' : '') : ''; })()].filter(Boolean).join(' \u00b7 '), time:timeRange(s) }));
  (EVENT.evenings||[]).filter(e=>appliesTo(e,name) && attendance(e,name).status!=='no').forEach(e=>mine.push({ date:e.date, sort:e.start||'99', label:'Evening: '+e.title, note:e.venue||'', time:e.start ? `${e.start}${e.end ? '&ndash;'+e.end : ''}` : '' }));
  mine.sort((a,b)=>(a.date+a.sort).localeCompare(b.date+b.sort));
  $('personSchedule').innerHTML = !mine.length ? `<div class="empty-note">No shifts recorded yet.</div>` : mine.map(s=>`
    <div class="schedule-row">
      <div class="sr-date">${fmtDate(s.date)}</div>
      <div class="sr-mid">${escapeHtml(s.label)}${s.note ? ` &middot; ${escapeHtml(s.note)}` : ''}</div>
      <div class="sr-time">${s.time}</div>
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
  renderPersonExpense(name);
  $('personModalBackdrop').classList.add('show');
  if (window.onPersonModal) window.onPersonModal(name);
}
function renderPersonExpense(name){
  let el = $('personExpBlock');
  if (!el){ el = document.createElement('div'); el.id = 'personExpBlock'; el.className = 'summary-block'; const ref = $('personFlightsBlock'); ref.parentNode.insertBefore(el, ref.nextSibling); }
  if (!expOn(name)){ el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  const w = expWindow(name), rate = expRate(), sym = expSymbol();
  let body;
  if (!w.ok) body = `<div class="empty-note">${escapeHtml(w.need)}, so the allowance cannot be worked out yet.</div>`;
  else if (!rate) body = `<div class="empty-note">Daily rate not set yet.</div>`;
  else body = `<div class="accom-row">
      <div class="ar-top"><span class="badge both">${w.days} allowance day${w.days===1?'':'s'}</span><span class="ar-detail">${w.days ? `${fmtDate(w.dates[0])} &ndash; ${fmtDate(w.dates[w.dates.length-1])}` : ''}</span></div>
      <div class="ar-detail"><b style="color:var(--ink);">${w.days} &times; ${fmtMoney(sym, rate)} = ${fmtMoney(sym, w.total)}</b> &middot; travel days ${fmtDate(w.first)} and ${fmtDate(w.last)} are expensed separately</div>
      <div style="margin-top:10px;"><button class="btn" type="button" data-exp-card="${escapeHtml(name)}">Open expense card</button></div>
    </div>`;
  el.innerHTML = `<h4>Expense allowance</h4>${body}`;
}
function closePersonModal(){ $('personModalBackdrop').classList.remove('show'); }

/* ---------- evenings ---------- */
const KIND_CLASS = { 'Internal':'build', 'Industry':'both', 'GS sponsored':'custfacing' };
function appliesTo(e, name){
  const a = e.audience || 'Everyone';
  if (a === 'Everyone') return true;
  if (a === 'Sales & Support') return personTypes(name).some(t=>t==='Sales' || t==='Support');
  const list = (e.invited||'').split(/[\n,]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(name).toLowerCase());
}
/* Who can actually get to an evening event, worked out from flights (Outbound landing / Return take-off) */
const EVE_ARRIVE_BUFFER = 60;    // minutes between landing and the event starting (airport -> hotel -> venue)
const EVE_DEPART_BUFFER = 150;   // minutes between the event ending and take-off
const stampOf = (date, time, dflt) => Math.round(parseISO(date).getTime()/60000) + (toMin(time) ?? toMin(dflt));
function attendance(e, name){
  const fl = flights.filter(f=>f.name===name);
  const outs = fl.filter(f=>f.direction==='Outbound' && f.arriveDate);
  const rets = fl.filter(f=>f.direction==='Return' && f.departDate);
  const start = stampOf(e.date, e.start, '18:00');
  let end = e.end ? stampOf(e.date, e.end, '23:00') : start + 180;
  if (e.end && end <= start) end += 1440;
  let reason = '';
  if (outs.length){                                   // last Outbound leg = when they actually arrive
    const last = outs.reduce((a,b)=>stampOf(a.arriveDate,a.arriveTime,'12:00') >= stampOf(b.arriveDate,b.arriveTime,'12:00') ? a : b);
    if (stampOf(last.arriveDate, last.arriveTime, '12:00') + EVE_ARRIVE_BUFFER > start) reason = `lands ${fmtDate(last.arriveDate)}${last.arriveTime ? ' ' + last.arriveTime : ''}`;
  }
  if (!reason && rets.length){                         // first Return leg = when they leave
    const first = rets.reduce((a,b)=>stampOf(a.departDate,a.departTime,'12:00') <= stampOf(b.departDate,b.departTime,'12:00') ? a : b);
    if (stampOf(first.departDate, first.departTime, '12:00') < end + EVE_DEPART_BUFFER) reason = `flies ${fmtDate(first.departDate)}${first.departTime ? ' ' + first.departTime : ''}`;
  }
  if (reason) return { status:'no', reason };
  return { status: (outs.length && rets.length) ? 'yes' : 'unknown', reason:'' };
}
function eveningAttendees(e){
  const out = { yes:[], no:[], unknown:[] };
  getAllNames().filter(n=>appliesTo(e,n)).forEach(n=>{ const a = attendance(e,n); (out[a.status]).push({ name:n, reason:a.reason }); });
  return out;
}

function renderEvenings(){
  const list = $('eveningList'); if (!list) return;
  const evs = [...(EVENT.evenings||[])].sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
  const me = meName();
  $('eveningCount').textContent = evs.length ? `${evs.length} event${evs.length===1?'':'s'}` : '';
  $('eveningMe').innerHTML = me ? `<div class="notice info" style="margin:0 22px 4px;">Showing what applies to <b>${escapeHtml(me)}</b>. Events not for you are faded.</div>` : '';
  if (!evs.length){ list.innerHTML = `<div class="empty-note" style="padding:8px 0;">No evening events added yet.</div>`; return; }
  list.innerHTML = evs.map(e=>{
    const d = parseISO(e.date);
    const att = flights.length ? eveningAttendees(e) : null;
    const myAtt = me && appliesTo(e, me) ? attendance(e, me) : null;
    const mine = me ? (appliesTo(e, me) && !(myAtt && myAtt.status==='no')) : true;
    const when = e.start ? `${escapeHtml(e.start)}${e.end ? '&ndash;'+escapeHtml(e.end) : ''}` : 'Time TBC';
    const place = [e.venue, e.address].filter(Boolean).join(', ');
    const aud = (e.audience||'Everyone') === 'Invited only' && (e.invited||'').trim()
      ? `Invited: ${escapeHtml((e.invited||'').split(/[\n,]/).map(x=>x.trim()).filter(Boolean).join(', '))}` : escapeHtml(e.audience || 'Everyone');
    return `<article class="evening-card${mine ? '' : ' dim'}">
      <div class="ev-date"><div class="dow">${DOW[d.getUTCDay()]}</div><div class="num">${d.getUTCDate()}</div><div class="mon">${MONTH[d.getUTCMonth()]}</div></div>
      <div class="ev-main">
        <div class="ev-top"><h3>${escapeHtml(e.title)}</h3>${e.kind ? `<span class="badge ${KIND_CLASS[e.kind]||'off'}">${escapeHtml(e.kind)}</span>` : ''}${me && mine ? '<span class="badge build">You</span>' : ''}${me && myAtt && myAtt.status==='no' ? `<span class="badge off">Away &middot; ${escapeHtml(myAtt.reason)}</span>` : ''}</div>
        <div class="ev-line"><b>${when}</b>${e.host ? ` &middot; Hosted by ${escapeHtml(e.host)}` : ''}</div>
        ${place ? `<div class="ev-line">${svg('pin',14)} <a href="${mapLink(place)}" target="_blank" rel="noopener">${escapeHtml(place)}</a></div>` : ''}
        <div class="ev-line ev-soft">For: ${aud}${e.dress ? ` &middot; Dress: ${escapeHtml(e.dress)}` : ''}</div>
        ${e.notes ? `<div class="ev-notes">${escapeHtml(e.notes)}</div>` : ''}
        ${att && (att.yes.length + att.no.length + att.unknown.length) ? `<details class="ev-attend"><summary><b>${att.yes.length}</b> can attend${att.no.length ? ` &middot; <span class="away">${att.no.length} can&rsquo;t</span>` : ''}${att.unknown.length ? ` &middot; ${att.unknown.length} no flight info` : ''}</summary>
          <div class="ev-att-list">
            ${att.no.length ? `<div><b>Can&rsquo;t attend (flights):</b> ${att.no.map(x=>`${escapeHtml(x.name)} <span class="ev-soft">(${escapeHtml(x.reason)})</span>`).join(', ')}</div>` : ''}
            ${att.yes.length ? `<div><b>Can attend:</b> ${att.yes.map(x=>escapeHtml(x.name)).join(', ')}</div>` : ''}
            ${att.unknown.length ? `<div><b>No/partial flight info:</b> ${att.unknown.map(x=>escapeHtml(x.name)).join(', ')}</div>` : ''}
          </div></details>` : ''}
        <div class="ev-actions">
          <button class="btn" type="button" data-ics="${escapeHtml(String(e.id))}">${svg('cal',14)} Add to calendar</button>
          ${e.link ? `<a class="btn" href="${escapeHtml(e.link)}" target="_blank" rel="noopener">More info</a>` : ''}
          ${EDIT ? `<span class="ev-edit">${rowActions('evenings', e.id).replace(/<\/?td[^>]*>/g,'')}</span>` : ''}
        </div>
      </div>
    </article>`;
  }).join('');
}
function icsEscape(t){ return String(t||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n'); }
function downloadIcs(id){
  const e = (EVENT.evenings||[]).find(x=>String(x.id)===String(id)); if (!e) return;
  const ymd = iso => iso.replace(/-/g,''), hm = t => t.replace(':','') + '00';
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Greenspan XP//Events HQ//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    `UID:${e.id}@gs-events.netlify.app`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')}`];
  if (e.start){
    let endDate = e.date, end = e.end;
    if (!end){ const [h,m] = e.start.split(':').map(Number); end = String((h+2)%24).padStart(2,'0')+':'+String(m).padStart(2,'0'); if (h+2>=24) endDate = new Date(parseISO(e.date).getTime()+86400000).toISOString().slice(0,10); }
    else if (end <= e.start) endDate = new Date(parseISO(e.date).getTime()+86400000).toISOString().slice(0,10);
    L.push(`DTSTART:${ymd(e.date)}T${hm(e.start)}`, `DTEND:${ymd(endDate)}T${hm(end)}`);
  } else {
    const next = new Date(parseISO(e.date).getTime()+86400000).toISOString().slice(0,10);
    L.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(next)}`);
  }
  L.push(`SUMMARY:${icsEscape(e.title)}`);
  const loc = [e.venue, e.address].filter(Boolean).join(', '); if (loc) L.push(`LOCATION:${icsEscape(loc)}`);
  const desc = [e.host && `Hosted by ${e.host}`, e.dress && `Dress: ${e.dress}`, e.notes, e.link].filter(Boolean).join('\n'); if (desc) L.push(`DESCRIPTION:${icsEscape(desc)}`);
  L.push('END:VEVENT','END:VCALENDAR');
  const blob = new Blob([L.join('\r\n')+'\r\n'], { type:'text/calendar' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (e.title||'event').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener('click', ev=>{
  const ics = ev.target.closest('[data-ics]'); if (ics){ downloadIcs(ics.dataset.ics); return; }
  if (ev.target.closest('[data-goto-evenings]')) switchTab('evenings');
});

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
  const ex = EVENT.expenses, rate = expRate(), sym = expSymbol();
  $('expensesPanel').style.display = (rate || (EDIT && ex)) ? '' : 'none';
  if (!(rate || (EDIT && ex))) return;
  $('expensesIntro').textContent = rate
    ? `${fmtMoney(sym, rate)} a day for each full day between a person's first and last travel day. The two travel days are expensed separately. Only people set up for the allowance are listed (Staff tab, Edit person).`
    : 'Daily rate not set yet. Add it under Event details (edit mode) to switch the allowance on.';
  $('expensesNote').innerHTML = ex && ex.note ? `<div class="notice info" style="margin:14px 22px 0;">${ex.note}</div>` : '';
  const ws = getAllNames().filter(expOn).map(expWindow);
  const total = ws.reduce((t,w)=>t + (w.ok ? w.total : 0), 0);
  $('expensesCount').textContent = ws.length && rate ? `Total ${fmtMoney(sym, total)}` : '';
  $('expensesBody').innerHTML = ws.length ? ws.map(w=>`
    <tr><td data-label="Name"><b>${escapeHtml(w.name)}</b></td><td data-label="Days">${w.ok ? w.days : `<span class="empty-note">${escapeHtml(w.need)}</span>`}</td><td data-label="Amount owed"><b>${w.ok && rate ? fmtMoney(sym, w.total) : '&ndash;'}</b></td></tr>`).join('')
    : `<tr class="empty"><td colspan="3">No one is set up for the daily allowance yet.</td></tr>`;
}

/* ---------- expense card (image people can screenshot or save) ---------- */
function drawExpenseCard(ctx, W, H, d){
  const FONT = 'Inter, "Segoe UI", Helvetica, Arial, sans-serif';
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0F152F'); bg.addColorStop(1, '#1A2350');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  [['0','#35D6D0'],['.38','#7B5CF0'],['.72','#E8507A'],['1','#F4845A']].forEach(s=>bar.addColorStop(Number(s[0]), s[1]));
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 14);
  const fit = (txt, weight, size, maxW)=>{ let s = size; ctx.font = `${weight} ${s}px ${FONT}`; while (ctx.measureText(txt).width > maxW && s > 18){ s -= 2; ctx.font = `${weight} ${s}px ${FONT}`; } };
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const X = 72, R = W - 72, MW = W - 144;
  ctx.fillStyle = '#8FA2FF'; fit(d.title.toUpperCase(), 700, 30, MW); ctx.fillText(d.title.toUpperCase(), X, 120);
  ctx.fillStyle = '#FFFFFF'; fit('Expense Allowance', 800, 72, MW); ctx.fillText('Expense Allowance', X, 210);
  ctx.fillStyle = '#35D6D0'; fit(d.name, 700, 48, MW); ctx.fillText(d.name, X, 288);
  ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(X, 330, MW, 2);
  // rows
  const row = (label, sub, value, y)=>{
    ctx.fillStyle = '#9AA6C4'; ctx.font = `600 30px ${FONT}`; ctx.textAlign = 'left'; ctx.fillText(label, X, y);
    if (sub){ ctx.fillStyle = '#6E7BA0'; ctx.font = `500 24px ${FONT}`; ctx.fillText(sub, X, y + 38); }
    ctx.fillStyle = '#FFFFFF'; ctx.font = `800 54px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(value, R, y + (sub ? 18 : 12));
  };
  row('Allowance days', d.range, String(d.days), 420);
  row('Daily allowance', '', d.rate, 560);
  // total panel
  const py = 650, ph = 270;
  ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, py, MW, ph, 28) : ctx.rect(X, py, MW, ph); ctx.fill();
  ctx.strokeStyle = 'rgba(53,214,208,.55)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#9AA6C4'; ctx.font = `600 30px ${FONT}`; ctx.fillText('TOTAL', W/2, py + 70);
  ctx.fillStyle = '#35D6D0'; fit(d.total, 800, 132, MW - 60); ctx.fillText(d.total, W/2, py + 200);
  // footer
  ctx.textAlign = 'left'; ctx.fillStyle = '#6E7BA0'; ctx.font = `500 22px ${FONT}`;
  ctx.fillText('Travel days are expensed separately', X, 1000);
  ctx.fillStyle = '#FFFFFF'; ctx.font = `800 30px ${FONT}`; ctx.fillText('Greenspan', X, 1052);
  const gw = ctx.measureText('Greenspan').width; ctx.fillStyle = '#7B5CF0'; ctx.fillText('XP', X + gw + 4, 1052);
}
async function openExpenseCard(name){
  const w = expWindow(name), rate = expRate(), sym = expSymbol();
  if (!expOn(name) || !w.ok || !rate) return;
  try { await Promise.all([document.fonts.load('800 40px Inter'), document.fonts.load('600 30px Inter')]); } catch(e){}
  const W = 900, H = 1120, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  drawExpenseCard(cv.getContext('2d'), W, H, {
    title: (EVENT.expenses && EVENT.expenses.title) || EVENT.label, name,
    days: w.days, range: w.days ? `${fmtDate(w.dates[0])} \u2013 ${fmtDate(w.dates[w.dates.length-1])}` : '',
    rate: fmtMoney(sym, rate), total: fmtMoney(sym, w.total) });
  const url = cv.toDataURL('image/png');
  const bd = document.createElement('div'); bd.className = 'modal-backdrop show';
  bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:560px;">
    <img src="${url}" alt="Expense allowance card for ${escapeHtml(name)}" style="display:block; margin:0 auto; max-width:100%; max-height:72vh; width:auto; height:auto; border-radius:14px;">
    <div class="modal-actions"><button class="btn" type="button" data-x="close">Close</button><button class="btn primary" type="button" data-x="save">Save image</button></div></div>`;
  document.body.appendChild(bd);
  bd.addEventListener('click', e=>{
    if (e.target === bd || e.target.closest('[data-x="close"]')) bd.remove();
    else if (e.target.closest('[data-x="save"]')){
      cv.toBlob(b=>{ const a = document.createElement('a'); a.href = URL.createObjectURL(b);
        a.download = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-expense-allowance.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000); }, 'image/png');
    }
  });
}

/* ---------- expenses Excel (editors only - button lives in the edit bar) ---------- */
function exportExpensesExcel(){
  const sym = expSymbol(), rate = expRate();
  const ws = getAllNames().filter(expOn).map(expWindow);
  if (!ws.length){ alert('No one is set up for the daily allowance yet. Edit a person and set "Daily expense allowance" to Yes.'); return; }
  const good = ws.filter(w=>w.ok);
  if (!good.length){ alert('None of the people on the allowance have both an arrival flight and a return date yet.'); return; }
  const start = good.map(w=>w.first).reduce((x,y)=>x<y?x:y), end = good.map(w=>w.last).reduce((x,y)=>x>y?x:y);
  const dates = []; for (let d = start; d <= end; d = addDaysISO(d, 1)) dates.push(d);
  const nD = dates.length, colDays = 1 + nD, colAmt = 2 + nD;               // zero-based column indexes
  const L = c => XLSX.utils.encode_col(c);
  const rateRow = ws.length + 3;                                              // 1-based row holding the daily rate
  const aoa = [['Name', ...dates.map(d=>new Date(d + 'T00:00:00')), 'Total allowance days', 'Total amount']];
  ws.forEach(w=>aoa.push([w.name, ...dates.map(d=> !w.ok ? '' : (d === w.first || d === w.last) ? 'Travel' : w.dates.includes(d) ? 'Allowance' : ''), '', '']));
  aoa.push([]); aoa.push(['Daily rate', rate || '']);
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  for (let c = 1; c <= nD; c++){ const cell = sheet[XLSX.utils.encode_cell({ r:0, c })]; if (cell) cell.z = 'ddd d mmm'; }
  const money = sym + '#,##0.00';
  ws.forEach((w, i)=>{
    const r = i + 1, rowN = r + 1;
    if (w.ok){
      sheet[XLSX.utils.encode_cell({ r, c:colDays })] = { t:'n', v:w.days, f:`COUNTIF(${L(1)}${rowN}:${L(nD)}${rowN},"Allowance")` };
      sheet[XLSX.utils.encode_cell({ r, c:colAmt })]  = { t:'n', v:w.total, f:`${L(colDays)}${rowN}*$B$${rateRow}`, z:money };
    } else {
      sheet[XLSX.utils.encode_cell({ r, c:colDays })] = { t:'s', v:w.need };
    }
  });
  const rc = sheet[XLSX.utils.encode_cell({ r:rateRow - 1, c:1 })]; if (rc && rate) rc.z = money;
  sheet['!ref'] = XLSX.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:rateRow - 1, c:colAmt } });
  sheet['!cols'] = [{ wch:24 }, ...dates.map(()=>({ wch:11 })), { wch:20 }, { wch:14 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, 'Expenses');
  XLSX.writeFile(wb, `${EVENT.id}_expenses.xlsx`);
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
  const pws = XLSX.utils.aoa_to_sheet([['Name','Staff Type','Flights'], ...names.map(n=>[n, personTypes(n).join(', '), flightStatus(n).label])]);
  pws['!cols'] = [{wch:24},{wch:28},{wch:18}];
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
  if ((EVENT.evenings||[]).length){
    const evs = [...EVENT.evenings].sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
    const ews = XLSX.utils.aoa_to_sheet([['Date','Start','End','Event','Type','Venue','Address','Host','For','Dress','Notes'], ...evs.map(e=>[e.date ? new Date(e.date+'T00:00:00') : '', e.start||'', e.end||'', e.title, e.kind||'', e.venue||'', e.address||'', e.host||'', e.audience||'Everyone', e.dress||'', e.notes||''])]);
    ews['!cols'] = [{wch:12},{wch:8},{wch:8},{wch:30},{wch:14},{wch:24},{wch:30},{wch:20},{wch:16},{wch:16},{wch:40}];
    for (let r=1; r<=evs.length; r++){ const cell = ews[XLSX.utils.encode_cell({r, c:0})]; if (cell) cell.z = 'dd-mmm-yyyy'; }
    XLSX.utils.book_append_sheet(wb, ews, 'Evenings');
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
document.addEventListener('click', ev=>{ const b = ev.target.closest('[data-exp-card]'); if (b) openExpenseCard(b.getAttribute('data-exp-card')); });
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
