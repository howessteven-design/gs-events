/* Admin / edit mode - only active when the page is opened with ?admin=1
   Edits are held in this browser tab. "Download event file" writes the updated
   events/<id>.js, which you commit to GitHub (Netlify then redeploys for everyone). */
(function(){
  if (typeof EDIT === 'undefined' || !EDIT) return;

  const ROLES = ['Build Crew','Customer-Facing','Both'];
  const TEAMS = ['Sales','Support','N/A'];
  const ACTIVITIES = ['Build-up','On Stand','Takedown','Evening networking','Off'];
  const ALL_TABS = ['rota','accom','flights','people','info','mkt'];
  const dirty = new Set();       // event ids with unsaved edits
  const unregistered = new Set(); // brand-new events not yet listed in index.html

  /* ---------- field definitions ---------- */
  const FORMS = {
    shifts:{ label:'shift', fields:[
      {k:'name', l:'Staff name', t:'text', req:1, list:'names'},
      {k:'role', l:'Role type', t:'select', o:ROLES, half:1},
      {k:'team', l:'Team', t:'select', o:TEAMS, half:1},
      {k:'date', l:'Date', t:'date', req:1, half:1},
      {k:'activity', l:'Activity', t:'text', req:1, list:'activities', half:1},
      {k:'start', l:'Start time', t:'time', half:1},
      {k:'end', l:'End time', t:'time', half:1},
      {k:'notes', l:'Location / notes', t:'text'} ],
      defaults:()=>({ role:'Customer-Facing', team:'Sales', activity:'On Stand', date:(activeDay || (EVENT.days[0]||{}).date || '') }) },
    accom:{ label:'accommodation entry', fields:[
      {k:'name', l:'Staff name', t:'text', req:1, list:'names'},
      {k:'type', l:'Type', t:'select', o:['Hotel Booked','Alternative Accommodation','TBC']},
      {k:'hotel', l:'Hotel / address', t:'text'},
      {k:'checkin', l:'Check-in', t:'date', half:1},
      {k:'checkout', l:'Check-out', t:'date', half:1},
      {k:'ref', l:'Booking reference', t:'text', half:1},
      {k:'notes', l:'Notes', t:'text', half:1} ],
      defaults:()=>({ type:'Hotel Booked' }) },
    flights:{ label:'flight', fields:[
      {k:'name', l:'Staff name', t:'text', req:1, list:'names'},
      {k:'direction', l:'Direction', t:'select', o:['Outbound','Return','Other'], half:1},
      {k:'status', l:'Status', t:'select', o:['Booked','TBC'], half:1},
      {k:'airline', l:'Airline', t:'text', half:1},
      {k:'flightNo', l:'Flight number', t:'text', half:1},
      {k:'from', l:'From (airport)', t:'text', half:1, ph:'e.g. MAN'},
      {k:'to', l:'To (airport)', t:'text', half:1, ph:'e.g. MCO'},
      {k:'departDate', l:'Departure date', t:'date', half:1},
      {k:'departTime', l:'Departure time', t:'time', half:1},
      {k:'arriveDate', l:'Arrival date', t:'date', half:1},
      {k:'arriveTime', l:'Arrival time', t:'time', half:1},
      {k:'ref', l:'Booking reference', t:'text', half:1},
      {k:'notes', l:'Notes', t:'text', half:1} ],
      defaults:()=>({ direction:'Outbound', status:'Booked' }) },
    actions:{ label:'action', fields:[
      {k:'category', l:'Category', t:'text', list:'categories', half:1},
      {k:'status', l:'Status', t:'select', o:['Open','In Progress','Done'], half:1},
      {k:'task', l:'Task', t:'textarea', req:1, rows:3},
      {k:'notes', l:'Notes', t:'text'} ],
      defaults:()=>({ status:'Open' }) },
    links:{ label:'link', fields:[
      {k:'label', l:'Label', t:'text', req:1},
      {k:'url', l:'URL', t:'text', ph:'https://...  (leave blank if not available yet)'},
      {k:'notes', l:'Notes', t:'text'} ],
      defaults:()=>({}) }
  };
  const INFO_TYPES = { venue:'Venue', hotel:'Hotel', floorplan:'Floor plan', uniform:'Uniform', notes:'Free-text notes' };
  const INFO_FIELDS = {
    venue:[ {k:'title',l:'Panel title',t:'text',req:1}, {k:'heading',l:'Small heading',t:'text',half:1}, {k:'tagline',l:'Bold line',t:'text',half:1},
            {k:'address',l:'Address / getting there',t:'text'}, {k:'extra',l:'Extra line',t:'text'},
            {k:'mapQuery',l:'Google Maps search text',t:'text',hint:'Address or place name used to draw the map'},
            {k:'mapLinkQuery',l:'"Open in Google Maps" search text (optional)',t:'text'},
            {k:'directions',l:'Directions (HTML allowed)',t:'textarea',rows:4} ],
    floorplan:[ {k:'title',l:'Panel title',t:'text',req:1}, {k:'image',l:'Image path',t:'text',hint:'Commit the image to the repo first, e.g. assets/orlando/floorplan.jpg'},
                {k:'alt',l:'Image description',t:'text'}, {k:'caption',l:'Caption (HTML allowed)',t:'textarea',rows:2} ],
    uniform:[ {k:'title',l:'Panel title',t:'text',req:1}, {k:'image',l:'Image path',t:'text',hint:'e.g. assets/orlando/uniform.jpg'}, {k:'alt',l:'Image description',t:'text'},
              {k:'intro',l:'Intro line',t:'text'},
              {k:'items',l:'Items',t:'textarea',rows:5,hint:'One per line: item | note  (e.g. Branded polo | MKT supplied)',
               get:o=>(o.items||[]).map(i=>i.note ? `${i.text} | ${i.note}` : i.text).join('\n'),
               set:(o,v)=>{ o.items = v.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{ const [t,...n]=x.split('|'); return n.length ? {text:t.trim(), note:n.join('|').trim()} : {text:t.trim()}; }); } } ],
    notes:[ {k:'title',l:'Panel title',t:'text',req:1}, {k:'html',l:'Content (HTML allowed)',t:'textarea',rows:8} ]
  };
  INFO_FIELDS.hotel = INFO_FIELDS.venue;

  const EVENT_FIELDS = [
    {k:'title', l:'App title', t:'text', req:1, half:1},
    {k:'label', l:'Dropdown label', t:'text', req:1, half:1},
    {k:'eyebrow', l:'Small label above title (optional)', t:'text'},
    {k:'subtitle', l:'Subtitle - dates, hours, venue (HTML allowed)', t:'textarea', rows:3},
    {k:'standNumber', l:'Stand number', t:'text', half:1},
    {k:'standUrl', l:'Stand page URL', t:'text', half:1},
    {k:'days', l:'Show days (one per line: YYYY-MM-DD, Phase)', t:'textarea', rows:6, hint:'e.g. 2026-11-16, Build-up. Phases containing "Build", "Show" or "Takedown" get coloured tags. Leave empty to hide the day strip.',
      get:o=>(o.days||[]).map(d=>`${d.date}, ${d.phase}`).join('\n'),
      set:(o,v)=>{ o.days = v.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{ const i=x.indexOf(','); return {date:x.slice(0,i).trim(), phase:x.slice(i+1).trim()}; }); },
      check:v=>{ for (const x of v.split('\n').map(x=>x.trim()).filter(Boolean)){ if(!/^\d{4}-\d{2}-\d{2},\s*\S/.test(x)) return `Check this line: "${x}" - use YYYY-MM-DD, Phase`; } return ''; } },
    {k:'tabs', l:'Tabs to show', t:'checks', o:ALL_TABS,
      get:o=>o.tabs||ALL_TABS, set:(o,v)=>{ o.tabs = ALL_TABS.filter(t=>v.includes(t)); } },
    {k:'draftNote', l:'Draft banner (clear when the event is final)', t:'textarea', rows:2},
    {k:'accessNotice', l:'Rota notice, e.g. access hours (HTML allowed)', t:'textarea', rows:3},
    {k:'peopleNotice', l:'Staff tab notice (HTML allowed)', t:'textarea', rows:2},
    {k:'expSymbol', l:'Allowance currency symbol', t:'text', half:1, get:o=>o.expenses ? o.expenses.symbol : '', set:()=>{} },
    {k:'expPerDay', l:'Allowance per day (blank = hide panel)', t:'number', half:1, get:o=>o.expenses ? o.expenses.perDay : '', set:()=>{} },
    {k:'expNote', l:'Allowance note (HTML allowed)', t:'textarea', rows:2, get:o=>o.expenses ? (o.expenses.note||'') : '', set:()=>{} }
  ];

  /* ---------- small helpers ---------- */
  const esc = escapeHtml;
  function toast(html, ms=4200){
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const t = document.createElement('div'); t.className='toast'; t.innerHTML = html; document.body.appendChild(t);
    setTimeout(()=>t.remove(), ms);
  }
  function markDirty(){ dirty.add(EVENT.id); window.updateEditBar(); }
  function eventsList(){ return window.EVENTS; }

  function fieldHTML(f, val){
    const id = 'ff_' + f.k;
    let input;
    if (f.t==='select'){
      input = `<select id="${id}">${f.o.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    } else if (f.t==='textarea'){
      input = `<textarea id="${id}" rows="${f.rows||3}">${esc(val ?? '')}</textarea>`;
    } else if (f.t==='checks'){
      input = `<div class="checks" id="${id}">${f.o.map(o=>`<label><input type="checkbox" value="${o}" ${(val||[]).includes(o)?'checked':''}> ${esc(TAB_LABEL[o]||o)}</label>`).join('')}</div>`;
    } else {
      input = `<input id="${id}" type="${f.t}" value="${esc(val ?? '')}" ${f.list?`list="dl_${f.list}"`:''} ${f.ph?`placeholder="${esc(f.ph)}"`:''} ${f.t==='number'?'step="any"':''} autocomplete="off">`;
    }
    return `<div class="field ${f.half?'half':''}"><label for="${id}">${esc(f.l)}${f.req?' <span class="req">*</span>':''}</label>${input}${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}</div>`;
  }
  function readField(f){
    const el = document.getElementById('ff_' + f.k);
    if (f.t==='checks') return [...el.querySelectorAll('input:checked')].map(i=>i.value);
    return el.value.trim();
  }

  /* ---------- modal ---------- */
  let modal;
  function ensureModal(){
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-backdrop'; modal.id = 'formBackdrop';
    modal.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true"><h3 id="formTitle"></h3>
      <form id="editForm" novalidate><div class="form-grid" id="formFields"></div><div class="form-error" id="formError"></div>
      <div class="modal-actions"><button class="btn" type="button" id="formCancel">Cancel</button><button class="btn primary" type="submit">Save</button></div></form>
      <datalist id="dl_names"></datalist><datalist id="dl_activities"></datalist><datalist id="dl_categories"></datalist></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', e=>{ if (e.target===modal) closeForm(); });
    modal.querySelector('#formCancel').addEventListener('click', closeForm);
    document.addEventListener('keydown', e=>{ if (e.key==='Escape' && modal.classList.contains('show')) closeForm(); });
    return modal;
  }
  function closeForm(){ if (modal) modal.classList.remove('show'); }
  function openModal(title, fieldsHTML, onSave, afterRender){
    ensureModal();
    $('formTitle').textContent = title;
    $('formFields').innerHTML = fieldsHTML;
    $('formError').textContent = '';
    $('dl_names').innerHTML = getAllNames().map(n=>`<option value="${esc(n)}">`).join('');
    $('dl_activities').innerHTML = ACTIVITIES.map(n=>`<option value="${esc(n)}">`).join('');
    $('dl_categories').innerHTML = [...new Set(actions.map(a=>a.category).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join('');
    const form = $('editForm');
    form.onsubmit = e=>{ e.preventDefault(); const err = onSave(); if (err) $('formError').textContent = err; else closeForm(); };
    modal.classList.add('show');
    if (afterRender) afterRender();
    const first = $('formFields').querySelector('input:not([type=checkbox]),select,textarea'); if (first) first.focus();
  }

  function validate(fields){
    for (const f of fields){
      const v = readField(f);
      if (f.req && !v) return `${f.l} is required.`;
      if (f.check){ const m = f.check(v); if (m) return m; }
    }
    return '';
  }
  function applyFields(obj, fields){
    fields.forEach(f=>{
      const v = readField(f);
      if (f.set){ f.set(obj, v); return; }
      if (v === '' || (Array.isArray(v) && !v.length)) delete obj[f.k]; else obj[f.k] = v;
    });
  }

  /* ---------- add / edit / delete ---------- */
  function openItemForm(kind, id){
    const cfg = FORMS[kind];
    const arr = EVENT[kind];
    const item = id ? arr.find(x=>String(x.id)===String(id)) : null;
    const base = item || cfg.defaults();
    openModal(`${item ? 'Edit' : 'Add'} ${cfg.label}`, `<div class="form-grid" style="display:contents">${cfg.fields.map(f=>fieldHTML(f, base[f.k])).join('')}</div>`, ()=>{
      const err = validate(cfg.fields); if (err) return err;
      const obj = item || { id: uid() };
      applyFields(obj, cfg.fields);
      if (!item) arr.push(obj);
      markDirty(); renderAll();
    });
  }

  function infoFieldsFor(type){ return INFO_FIELDS[type]; }
  function openInfoForm(idx){
    const isNew = idx === null || idx === undefined;
    const sec = isNew ? {type:'venue'} : EVENT.info[idx];
    const renderFields = type=>{
      $('formFields').innerHTML = `<div class="field"><label for="ff_type">Section type</label>
        <select id="ff_type" ${isNew?'':'disabled'}>${Object.keys(INFO_TYPES).map(t=>`<option value="${t}" ${t===type?'selected':''}>${INFO_TYPES[t]}</option>`).join('')}</select></div>` +
        infoFieldsFor(type).map(f=>fieldHTML(f, f.get ? f.get(sec) : sec[f.k])).join('');
      $('ff_type').addEventListener('change', e=>{ sec.type = e.target.value; renderFields(sec.type); });
    };
    openModal(`${isNew?'Add':'Edit'} info section`, '', ()=>{
      const type = $('ff_type').value; const fields = infoFieldsFor(type);
      const err = validate(fields); if (err) return err;
      const obj = isNew ? {type} : sec;
      applyFields(obj, fields);
      if (isNew) EVENT.info.push(obj);
      markDirty(); renderAll();
    }, ()=>renderFields(sec.type));
  }

  function openEventForm(){
    openModal('Event details', EVENT_FIELDS.map(f=>fieldHTML(f, f.get ? f.get(EVENT) : EVENT[f.k])).join(''), ()=>{
      const err = validate(EVENT_FIELDS); if (err) return err;
      const sym = readField(EVENT_FIELDS.find(f=>f.k==='expSymbol'));
      const per = readField(EVENT_FIELDS.find(f=>f.k==='expPerDay'));
      const note = readField(EVENT_FIELDS.find(f=>f.k==='expNote'));
      applyFields(EVENT, EVENT_FIELDS.filter(f=>!/^exp/.test(f.k)));
      if (per === '') EVENT.expenses = null;
      else { EVENT.expenses = { symbol: sym || '$', perDay: Number(per) }; if (note) EVENT.expenses.note = note; }
      if (!EVENT.title) EVENT.title = EVENT.label;
      refreshSelect();
      renderTabs();
      const tabs = EVENT.tabs && EVENT.tabs.length ? EVENT.tabs : ['rota'];
      switchTab(tabs.includes(activeTab) ? activeTab : tabs[0]);
      document.title = `${EVENT.title} | Greenspan Events HQ`;
      markDirty(); renderAll();
    });
  }

  function refreshSelect(){
    const sel = $('eventSelect');
    sel.innerHTML = eventsList().map(e=>`<option value="${esc(e.id)}">${esc(e.label)}</option>`).join('');
    sel.value = EVENT.id;
  }

  function openNewEvent(){
    const fields = [
      {k:'id', l:'Short code (becomes the file name)', t:'text', req:1, hint:'Lower-case letters, numbers and hyphens, e.g. vegas27'},
      {k:'label', l:'Dropdown label', t:'text', req:1, ph:'e.g. IAAPA Expo 2027 - Orlando'},
      {k:'title', l:'App title', t:'text', req:1, ph:'e.g. IAAPA Orlando HQ'} ];
    openModal('New event', fields.map(f=>fieldHTML(f,'')).join(''), ()=>{
      const err = validate(fields); if (err) return err;
      const id = readField(fields[0]);
      if (!/^[a-z0-9-]+$/.test(id)) return 'Short code can only use lower-case letters, numbers and hyphens.';
      if (eventsList().some(e=>e.id===id)) return 'An event with that short code already exists.';
      const ev = { id, label:readField(fields[1]), title:readField(fields[2]),
        subtitle:'', standNumber:'', standUrl:'', draftNote:'<b>Draft</b> &ndash; details still being added.',
        tabs:[...ALL_TABS], days:[], expenses:null, info:[], shifts:[], accom:[], flights:[], actions:[], links:[] };
      eventsList().push(ev); unregistered.add(id);
      refreshSelect(); $('eventSelect').value = id;
      const url = new URL(location.href); url.searchParams.set('event', id); history.replaceState(null,'',url);
      loadEvent(id); markDirty();
    });
  }

  function deleteItem(kind, id){
    if (kind==='info'){
      const sec = EVENT.info[Number(id)];
      if (!sec || !confirm(`Delete the "${sec.title}" section?`)) return;
      EVENT.info.splice(Number(id),1);
    } else {
      const arr = EVENT[kind]; const i = arr.findIndex(x=>String(x.id)===String(id));
      if (i<0 || !confirm(`Delete this ${FORMS[kind].label}?`)) return;
      arr.splice(i,1);
    }
    markDirty(); renderAll();
  }

  /* ---------- export ---------- */
  window.buildEventFile = function(){
    return `/* ${EVENT.label} - generated by Events HQ edit mode. Save as events/${EVENT.id}.js */\n(window.EVENTS = window.EVENTS || []).push(${JSON.stringify(EVENT, null, 1)});\n`;
  };
  function downloadEvent(){
    const blob = new Blob([window.buildEventFile()], {type:'text/javascript'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${EVENT.id}.js`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
    dirty.delete(EVENT.id); window.updateEditBar();
    toast(`Downloaded <code>${esc(EVENT.id)}.js</code>. Replace <code>events/${esc(EVENT.id)}.js</code> in the repo and commit.`, 6500);
  }

  /* ---------- edit bar ---------- */
  window.updateEditBar = function(){
    const bar = $('editBar'); if (!bar) return;
    const d = dirty.has(EVENT.id);
    const reg = unregistered.has(EVENT.id);
    bar.innerHTML = `<div class="editbar">
      <div class="eb-left"><span class="eb-pill">Edit mode</span>
        <span class="eb-state ${d?'dirty':''}">${d ? 'Unsaved changes' : 'No unsaved changes'}</span></div>
      <div class="eb-right">
        <button class="btn" type="button" data-eb="event">${svg('edit',14)} Event details</button>
        <button class="btn" type="button" data-eb="newevent">${svg('plus',14)} New event</button>
        <button class="btn ${d?'attn':''}" type="button" data-eb="download">${svg('download',14)} Download event file</button>
      </div>
      <div class="eb-note">Changes live in this browser tab only until you download the file and commit it to GitHub; Netlify then updates the live app for everyone.${
        reg ? ` <b>New event:</b> also add <code>&lt;script src="events/${esc(EVENT.id)}.js"&gt;&lt;/script&gt;</code> to <code>index.html</code>.` : ''}</div>
    </div>`;
  };

  /* ---------- wiring (delegated) ---------- */
  document.addEventListener('click', e=>{
    const t = e.target.closest('[data-edit],[data-del],[data-add-btn],[data-eb]'); if (!t) return;
    if (t.dataset.edit){ t.dataset.edit==='info' ? openInfoForm(Number(t.dataset.id)) : openItemForm(t.dataset.edit, t.dataset.id); }
    else if (t.dataset.del){ deleteItem(t.dataset.del, t.dataset.id); }
    else if (t.dataset.addBtn){ t.dataset.addBtn==='info' ? openInfoForm(null) : openItemForm(t.dataset.addBtn, null); }
    else if (t.dataset.eb==='event') openEventForm();
    else if (t.dataset.eb==='newevent') openNewEvent();
    else if (t.dataset.eb==='download') downloadEvent();
  });
  window.addEventListener('beforeunload', e=>{ if (dirty.size){ e.preventDefault(); e.returnValue = ''; } });

  window.updateEditBar();
})();
