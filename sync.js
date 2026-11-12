/* Greenspan Events HQ - shared data layer (Supabase).
   The events/*.js files stay the BASE data. Anything changed in admin mode is saved to the
   shared database as small "override" rows and layered on top of the base data for everyone.
   - Everyone: reads the overrides (cached for offline use) and refreshes every ~20 seconds.
   - Admin (?admin=1) + signed in with a company email: edits are saved automatically.
   No libraries: plain fetch against Supabase's REST + Auth endpoints.
   Load this file BEFORE app.js (it applies the cached overrides before the first render). */
(function(){
  'use strict';

  const CFG = {
    url: 'https://wqegvqrpmuftqwvncqtq.supabase.co',
    key: 'sb_publishable_PRxloVGkQUPjYfmqAZwHJw_x7AUdCf9',   // publishable key - safe to be public; row-level security protects writes
    domains: /@(greenspanltd\.com|gsxp\.com)$/i,             // UX check only - the database enforces it too
    poll: 20000
  };
  const COLLS = ['shifts','accom','flights','actions','links','people','info','evenings'];
  const META  = ['title','label','eyebrow','subtitle','standNumber','standUrl','days','tabs','draftNote','accessNotice','peopleNotice','expenses','standCover'];
  const K_AUTH = 'gs_auth', K_CACHE = 'gs_cache_v1', K_RETURN = 'gs_return';

  /* ---------- small helpers ---------- */
  const LS = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k,v){ try { localStorage.setItem(k,v); } catch(e){} },
    del(k){ try { localStorage.removeItem(k); } catch(e){} }
  };
  const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
  function canon(v){
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const slug = t => String(t||'').toLowerCase().replace(/&[a-z]+;/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'section';
  const rid = () => 'n' + Math.random().toString(36).slice(2,10);
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const events = () => window.EVENTS || [];
  const isAdmin = () => new URLSearchParams(location.search).has('admin');

  /* ---------- sign-in session ---------- */
  function decodeJwt(t){ try { return JSON.parse(atob(t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch(e){ return {}; } }
  function sessFrom(j){
    const p = decodeJwt(j.access_token);
    return { access_token:j.access_token, refresh_token:j.refresh_token,
             expires_at: j.expires_at || (Math.floor(Date.now()/1000) + (j.expires_in || 3600)), email: p.email || '' };
  }
  function getSess(){ try { return JSON.parse(LS.get(K_AUTH) || 'null'); } catch(e){ return null; } }
  function saveSess(s){ LS.set(K_AUTH, JSON.stringify(s)); }
  function clearSess(){ LS.del(K_AUTH); }

  // Returning from the emailed sign-in link: tokens arrive in the URL hash. Handle before app.js reads the URL.
  let authMsg = '';
  (function readHash(){
    if (!location.hash || location.hash.length < 2) return;
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.get('access_token')){
      saveSess(sessFrom({ access_token:p.get('access_token'), refresh_token:p.get('refresh_token'),
                          expires_in:Number(p.get('expires_in')) || 3600 }));
      const ret = LS.get(K_RETURN); LS.del(K_RETURN);
      history.replaceState(null, '', location.pathname + (ret || location.search));
      authMsg = 'Signed in.';
    } else if (p.get('error')){
      authMsg = 'That sign-in link did not work (' + (p.get('error_description') || p.get('error')).replace(/\+/g,' ') + '). Please request a new one.';
      history.replaceState(null, '', location.pathname + location.search);
    }
  })();

  async function token(){
    const s = getSess(); if (!s) return null;
    if (s.expires_at - Date.now()/1000 > 60) return s.access_token;
    let r;
    try {
      r = await fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token',
        { method:'POST', headers:{ apikey:CFG.key, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:s.refresh_token }) });
    } catch(e){ return s.access_token; }                // offline: keep the session, try the old token
    if (!r.ok){ clearSess(); return null; }
    const ns = sessFrom(await r.json()); saveSess(ns); return ns.access_token;
  }

  async function api(method, path, body, extra){
    const headers = Object.assign({ apikey: CFG.key }, extra || {});
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const tok = await token();
    if (tok) headers.Authorization = 'Bearer ' + tok;
    const res = await fetch(CFG.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok){
      const t = await res.text().catch(()=> '');
      const err = new Error(res.status + ' ' + t.slice(0,200)); err.status = res.status; throw err;
    }
    const txt = await res.text(); return txt ? JSON.parse(txt) : null;
  }

  /* ---------- base data + overlay ---------- */
  const BASE = {};            // event id -> pristine copy of what the .js file says
  const SNAP = {};            // event id -> fingerprint of what the app held at the last sync
  const INFO_ID = new WeakMap();   // info sections have no id in the files: ids are kept on the side

  const idOf = (c, it) => c === 'info' ? (INFO_ID.get(it) || (INFO_ID.set(it, 'n-' + rid()), INFO_ID.get(it))) : it.id;

  function captureBase(ev){
    const b = { meta:{}, colls:{}, infoIds:[] };
    META.forEach(k=>{ if (ev[k] !== undefined) b.meta[k] = clone(ev[k]); });
    COLLS.forEach(c=>{ b.colls[c] = clone(ev[c] || []); });
    const used = new Set();
    b.infoIds = b.colls.info.map(it=>{ const s = slug(it.title || it.type); let id = s, n = 2; while (used.has(id)) id = s + '-' + (n++); used.add(id); return 'b-' + id; });
    BASE[ev.id] = b;
  }
  function fingerprint(ev){
    const f = { colls:{}, meta:{} };
    COLLS.forEach(c=>{ f.colls[c] = Object.create(null); (ev[c] || []).forEach(it=>{ f.colls[c][idOf(c,it)] = canon(it); }); });
    META.forEach(k=>{ f.meta[k] = ev[k] === undefined ? undefined : canon(ev[k]); });
    return f;
  }
  function applyOverlay(ev, rows){
    const b = BASE[ev.id]; if (!b) return;
    const mine = rows.filter(r=>r.event_id === ev.id);
    META.forEach(k=>{ if (b.meta[k] === undefined) delete ev[k]; else ev[k] = clone(b.meta[k]); });
    mine.filter(r=>r.collection === 'meta').forEach(r=>{
      if (!META.includes(r.item_id)) return;
      if (r.deleted) delete ev[r.item_id]; else ev[r.item_id] = clone(r.data && r.data.value);
    });
    COLLS.forEach(c=>{
      const arr = clone(b.colls[c]);
      if (c === 'info') arr.forEach((it,i)=>INFO_ID.set(it, b.infoIds[i]));
      mine.filter(r=>r.collection === c).forEach(r=>{
        const i = arr.findIndex(it=>idOf(c,it) === r.item_id);
        if (r.deleted){ if (i >= 0) arr.splice(i,1); return; }
        const item = clone(r.data || {});
        if (c === 'info') INFO_ID.set(item, r.item_id);
        if (i >= 0) arr[i] = item; else arr.push(item);
      });
      ev[c] = arr;
    });
    SNAP[ev.id] = fingerprint(ev);
  }
  function applyAll(rows){ events().forEach(ev=>applyOverlay(ev, rows)); }

  // Work out what the user changed since the last sync -> rows to save
  function diff(ev){
    const prev = SNAP[ev.id], cur = fingerprint(ev), rows = [];
    COLLS.forEach(c=>{
      const live = Object.create(null); (ev[c] || []).forEach(it=>{ live[idOf(c,it)] = it; });
      new Set([...Object.keys(prev.colls[c]), ...Object.keys(cur.colls[c])]).forEach(id=>{
        if (prev.colls[c][id] === cur.colls[c][id]) return;
        rows.push(cur.colls[c][id] === undefined
          ? { event_id:ev.id, collection:c, item_id:id, data:{}, deleted:true }
          : { event_id:ev.id, collection:c, item_id:id, data:clone(live[id]), deleted:false });
      });
    });
    META.forEach(k=>{
      if (prev.meta[k] === cur.meta[k]) return;
      rows.push(cur.meta[k] === undefined
        ? { event_id:ev.id, collection:'meta', item_id:k, data:{}, deleted:true }
        : { event_id:ev.id, collection:'meta', item_id:k, data:{ value:clone(ev[k]) }, deleted:false });
    });
    return { rows, cur };
  }

  /* ---------- state + status ---------- */
  let started = false, pulling = false, pushing = false, again = false;
  let pending = false;            // local changes not yet saved
  let lastOk = 0, offline = false, lastErr = '', lastSig = '', saving = false, justSaved = 0;
  let pushTimer = null, origBar = null;

  const modalOpen = () => !!document.querySelector('.modal-backdrop.show');
  const hhmm = t => new Date(t).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  function statusLine(){
    if (!started) return '';
    if (pending && !getSess()) return ['busy', 'Changes not saved for everyone yet - sign in to save'];
    if (saving || pending) return ['busy', 'Saving changes...'];
    if (offline) return ['off', 'Offline - showing the last saved copy' + (lastOk ? ' (' + hhmm(lastOk) + ')' : '')];
    if (lastErr) return ['off', 'Could not reach shared data - showing the last saved copy'];
    return ['', 'Live' + (lastOk ? ' - updated ' + hhmm(lastOk) : '')];
  }
  function renderStatus(){
    const el = document.getElementById('syncStatus'); if (!el) return;
    const s = statusLine();
    el.innerHTML = s ? `<span class="sync-dot ${s[0]}"></span>${esc(s[1])}` : '';
    if (origBar){ origBar(); decorateBar(); }      // redraw the admin bar WITHOUT triggering another save check
  }

  function toast(msg, ms){
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(()=>t.remove(), ms || 5000);
  }

  /* ---------- pull (everyone) ---------- */
  async function fetchAll(){
    const all = []; let from = 0;
    for (;;){
      const page = await api('GET', `/rest/v1/event_items?select=event_id,collection,item_id,data,deleted&order=created_at.asc,item_id.asc&limit=1000&offset=${from}`);
      all.push(...page); if (page.length < 1000) break; from += 1000;
    }
    return all;
  }
  function refreshUI(){
    if (!started || typeof loadEvent !== 'function' || !EVENT) return;
    const day = activeDay;
    loadEvent(EVENT.id);
    if (day && EVENT_DAYS.some(d=>d.date === day)){ activeDay = day; renderAll(); }
    const sel = document.getElementById('eventSelect');
    if (sel){ sel.innerHTML = events().map(e=>`<option value="${esc(e.id)}">${esc(e.label)}</option>`).join(''); sel.value = EVENT.id; }
  }
  const hasLocalChanges = () => events().some(ev=>BASE[ev.id] && SNAP[ev.id] && diff(ev).rows.length);
  const busyEditing = () => pending || pushing || modalOpen() || hasLocalChanges();
  async function pull(){
    if (!started || pulling || busyEditing()) return;
    pulling = true;
    try {
      const rows = await fetchAll();
      offline = false; lastErr = ''; lastOk = Date.now();
      if (busyEditing()) return;          // the user started editing while we were fetching: never swap data under them
      const sig = JSON.stringify(rows);
      if (sig !== lastSig){ lastSig = sig; LS.set(K_CACHE, sig); applyAll(rows); refreshUI(); }
    } catch(e){
      offline = (navigator.onLine === false) || e.name === 'TypeError';
      lastErr = offline ? '' : String(e.message || e);
      if (!offline) console.warn('[sync] pull failed', e);
    } finally { pulling = false; renderStatus(); }
  }

  /* ---------- push (signed-in admins) ---------- */
  function check(){          // called whenever the edit bar redraws (i.e. after every edit)
    if (!started) return;
    clearTimeout(pushTimer); pushTimer = setTimeout(push, 350);
  }
  async function push(){
    if (!started) return;
    if (pushing){ again = true; return; }
    const work = events().filter(ev=>BASE[ev.id] && SNAP[ev.id]).map(ev=>({ ev, ...diff(ev) }));
    const rows = work.flatMap(w=>w.rows);
    if (!rows.length){ if (pending){ pending = false; renderStatus(); } return; }
    pending = true;
    if (!getSess()){ renderStatus(); return; }
    pushing = true; saving = true; renderStatus();
    try {
      for (let i = 0; i < rows.length; i += 200){
        await api('POST', '/rest/v1/event_items?on_conflict=event_id,collection,item_id', rows.slice(i, i+200),
                  { Prefer:'resolution=merge-duplicates,return=minimal' });
      }
      work.forEach(w=>{ SNAP[w.ev.id] = w.cur; });
      offline = false; lastErr = ''; lastOk = Date.now(); justSaved = Date.now(); lastSig = '';
      pending = events().some(ev=>BASE[ev.id] && SNAP[ev.id] && diff(ev).rows.length);
    } catch(e){
      console.warn('[sync] save failed', e);
      if (e.status === 401 || e.status === 403){
        if (e.status === 401) clearSess();
        toast(e.status === 401 ? 'Your sign-in has expired - please sign in again to save.' : 'Your email is not allowed to edit. Use your company email.', 7000);
      } else offline = (navigator.onLine === false) || e.name === 'TypeError';
    } finally {
      pushing = false; saving = false; renderStatus();
      if (again){ again = false; check(); }
      else if (!pending) setTimeout(pull, 1200);
    }
  }

  /* ---------- sign-in dialog ---------- */
  function signInDialog(){
    const bd = document.createElement('div'); bd.className = 'modal-backdrop show';
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>Sign in to edit</h3>
      <p style="margin:0 0 14px;color:var(--ink-soft);font-size:14px;line-height:1.6;">Enter your Greenspan email. We will send you a sign-in link &ndash; open it on this device. You stay signed in afterwards.</p>
      <form id="gsSignForm" novalidate><div class="field"><label for="gsEmail">Work email</label><input id="gsEmail" type="email" autocomplete="email" inputmode="email" placeholder="name@greenspanltd.com"></div>
      <div class="form-error" id="gsSignErr" style="min-height:18px;"></div>
      <div class="modal-actions"><button class="btn" type="button" id="gsSignCancel">Cancel</button><button class="btn primary" type="submit" id="gsSignGo">Send link</button></div></form></div>`;
    document.body.appendChild(bd);
    const close = () => bd.remove();
    bd.querySelector('#gsSignCancel').onclick = close;
    bd.addEventListener('mousedown', e=>{ if (e.target === bd) close(); });
    bd.querySelector('#gsEmail').focus();
    bd.querySelector('#gsSignForm').onsubmit = async e=>{
      e.preventDefault();
      const email = bd.querySelector('#gsEmail').value.trim(), err = bd.querySelector('#gsSignErr'), go = bd.querySelector('#gsSignGo');
      if (!CFG.domains.test(email)){ err.textContent = 'Please use your company email address (@greenspanltd.com or @gsxp.com).'; return; }
      go.disabled = true; go.textContent = 'Sending...'; err.textContent = '';
      try {
        LS.set(K_RETURN, location.search);
        const r = await fetch(CFG.url + '/auth/v1/otp?redirect_to=' + encodeURIComponent(location.origin + location.pathname),
          { method:'POST', headers:{ apikey:CFG.key, 'Content-Type':'application/json' }, body:JSON.stringify({ email, create_user:true }) });
        if (!r.ok){ const j = await r.json().catch(()=>({})); throw new Error(j.msg || j.error_description || ('Error ' + r.status)); }
        bd.querySelector('.modal').innerHTML = `<h3>Check your email</h3><p style="margin:0 0 16px;color:var(--ink-soft);font-size:14px;line-height:1.6;">We sent a sign-in link to <b style="color:var(--ink);">${esc(email)}</b>. Open it on this device and you will be brought back here, signed in. It can take a minute to arrive &ndash; check junk if not.</p><div class="modal-actions"><button class="btn primary" type="button" id="gsSignOk">OK</button></div>`;
        bd.querySelector('#gsSignOk').onclick = close;
      } catch(ex){ err.textContent = 'Could not send the link: ' + ex.message; go.disabled = false; go.textContent = 'Send link'; }
    };
  }

  /* ---------- admin edit-bar integration (edit.js is left untouched) ---------- */
  function decorateBar(){
    const bar = document.getElementById('editBar'); if (!bar) return;
    const left = bar.querySelector('.eb-left'), right = bar.querySelector('.eb-right'), note = bar.querySelector('.eb-note'), state = bar.querySelector('.eb-state');
    if (!left || !right || !note || !state) return;
    const s = getSess();
    if (s){
      if (!pending && !saving){ state.textContent = 'All changes saved for everyone'; state.classList.remove('dirty'); }
      else { state.textContent = saving ? 'Saving...' : 'Not saved yet - will retry'; state.classList.add('dirty'); }
      const who = document.createElement('span'); who.className = 'eb-who'; who.textContent = 'Signed in: ' + (s.email || 'staff'); left.appendChild(who);
      right.insertAdjacentHTML('afterbegin', '<button class="btn" type="button" data-sync="out">Sign out</button>');
    } else {
      right.insertAdjacentHTML('afterbegin', '<button class="btn attn" type="button" data-sync="in">Sign in to save for everyone</button>');
    }
    const reg = note.innerHTML.indexOf('<b>New event:</b>');
    const tail = reg >= 0 ? ' ' + note.innerHTML.slice(reg) : '';
    note.innerHTML = (s
      ? 'Changes save automatically to the shared database and appear for everyone within about 20 seconds. <b>Download event file</b> is now just an optional backup.'
      : 'You are not signed in, so changes stay in this tab only. Sign in to save them for everyone (or download the event file as before).') + tail;
  }
  document.addEventListener('click', e=>{
    const t = e.target.closest('[data-sync]'); if (!t) return;
    if (t.dataset.sync === 'in') signInDialog();
    else if (t.dataset.sync === 'out'){ clearSess(); toast('Signed out.'); renderStatus(); }
  });
  // Don't nag "unsaved changes" on leaving when everything is already saved (registered before edit.js's own listener)
  window.addEventListener('beforeunload', e=>{ if (getSess() && !pending && !saving) e.stopImmediatePropagation(); });

  /* ---------- boot ---------- */
  events().forEach(captureBase);
  (function(){                                  // cached overrides: instant + works offline
    let rows = []; try { rows = JSON.parse(LS.get(K_CACHE) || '[]'); } catch(e){}
    lastSig = JSON.stringify(rows);
    events().forEach(ev=>{ applyOverlay(ev, rows); });
  })();

  function start(){
    started = true;
    const bar = document.getElementById('editBar');
    if (bar && !document.getElementById('syncStatus')){
      const d = document.createElement('div'); d.id = 'syncStatus'; d.className = 'sync-status'; bar.parentNode.insertBefore(d, bar.nextSibling);
    }
    if (isAdmin() && typeof window.updateEditBar === 'function'){
      origBar = window.updateEditBar;
      window.updateEditBar = function(){ origBar(); decorateBar(); check(); };
      window.updateEditBar();
    }
    renderStatus();
    if (authMsg) toast(authMsg, 6000);
    pull();
    setInterval(()=>{ if (document.visibilityState === 'visible'){ if (pending && getSess()) push(); else pull(); } }, CFG.poll);
    document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState === 'visible') pull(); });
    window.addEventListener('online', ()=>{ offline = false; pending ? push() : pull(); });
    window.addEventListener('offline', ()=>{ offline = true; renderStatus(); });
  }
  const css = document.createElement('style');
  css.textContent = '.sync-status{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--ink-soft);margin:12px 2px 0;min-height:16px}'
    + '.sync-dot{width:7px;height:7px;border-radius:50%;background:#2bb673;flex:none}.sync-dot.off{background:#aab1c0}.sync-dot.busy{background:#f5a524}'
    + '.eb-who{font-size:12.5px;color:var(--ink-soft)}@media print{.sync-status{display:none}}';
  document.head.appendChild(css);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.GSSync = { pull, push, signIn: signInDialog, status: statusLine };
})();
