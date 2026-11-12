/* Admin / edit mode - only active when the page is opened with ?admin=1
   Edits are held in this browser tab. "Download event file" writes the updated
   events/<id>.js, which you commit to GitHub (Netlify then redeploys for everyone). */
(function(){
  if (typeof EDIT === 'undefined' || !EDIT) return;

  const ACTIVITIES = ['Build-up','On Stand','Takedown','Evening networking','Off'];
  const ALL_TABS = ['rota','evenings','accom','flights','people','info','mkt'];
  const dirty = new Set();       // event ids with unsaved edits
  const unregistered = new Set(); // brand-new events not yet listed in index.html

  /* ---------- field definitions ---------- */
  const FORMS = {
    people:{ label:'person', fields:[
      {k:'name', l:'Name', t:'text', req:1},
      {k:'types', l:'Staff type (tick all that apply)', t:'checks', o:TYPES, req:1,
       get:o=>o.types||[], set:(o,v)=>{ o.types = TYPES.filter(t=>v.includes(t)); } },
      {k:'allowance', l:'Daily expense allowance', t:'select', o:['No','Yes'], half:1,
       hint:'Yes = this person is on the daily allowance (needs the daily rate set under Event details).',
       set:(o,v)=>{ if (v==='Yes') o.allowance = 'Yes'; else delete o.allowance; } },
      {k:'allowanceRate', l:'Own allowance per day (blank = event rate)', t:'number', half:1,
       hint:'Only if this person is paid a different rate, e.g. 100.',
       set:(o,v)=>{ if (v !== '' && Number(v) > 0) o.allowanceRate = Number(v); else delete o.allowanceRate; } },
      {k:'allowanceSymbol', l:'Own currency symbol (blank = event currency)', t:'text', half:1, hint:'e.g. $',
       set:(o,v)=>{ if (v) o.allowanceSymbol = v; else delete o.allowanceSymbol; } },
      {k:'lastTravelDay', l:'Last travel day (only if no return flight is entered)', t:'date', half:1,
       hint:'Used for the allowance when there is no return flight, e.g. someone travelling on after the show.' } ],
      defaults:()=>({ types:[] }) },
    shifts:{ label:'shift', fields:[
      {k:'name', l:'Staff name', t:'text', req:1, list:'names'},
      {k:'date', l:'Date', t:'date', req:1, half:1},
      {k:'activity', l:'Activity', t:'text', req:1, list:'activities', half:1},
      {k:'start', l:'Start time', t:'time', half:1},
      {k:'end', l:'End time', t:'time', half:1},
      {k:'notes', l:'Location / notes', t:'text'} ],
      defaults:()=>({ activity:'On Stand', date:(activeDay || (EVENT.days[0]||{}).date || '') }) },
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
    evenings:{ label:'evening event', fields:[
      {k:'title', l:'Event', t:'text', req:1, ph:'e.g. Blooloop party'},
      {k:'date', l:'Date', t:'date', req:1, half:1},
      {k:'kind', l:'Type', t:'select', o:['Internal','Industry','GS sponsored'], half:1},
      {k:'start', l:'Start time', t:'time', half:1},
      {k:'end', l:'End time', t:'time', half:1},
      {k:'venue', l:'Venue', t:'text', half:1},
      {k:'host', l:'Hosted by', t:'text', half:1},
      {k:'address', l:'Address (used for the map link)', t:'text'},
      {k:'audience', l:'Who is it for?', t:'select', o:['Everyone','Sales & Support','Invited only']},
      {k:'invited', l:'Invited names (only for "Invited only")', t:'textarea', rows:2, hint:'Names exactly as in the Staff tab, separated by commas or new lines'},
      {k:'dress', l:'Dress code', t:'text', half:1},
      {k:'link', l:'More info link', t:'text', half:1, ph:'https://...'},
      {k:'notes', l:'Notes', t:'textarea', rows:3} ],
      defaults:()=>({ kind:'Industry', audience:'Everyone' }) },
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
    {k:'standCover', l:'Default stand cover for Sales & Support (one per line: YYYY-MM-DD, HH:MM-HH:MM)', t:'textarea', rows:5,
      hint:'Everyone with type Sales or Support is on the stand these days and hours unless they have a shift of their own that day. Leave empty to turn off.',
      get:o=>(o.standCover && o.standCover.days || []).map(d=>`${d.date}, ${d.start}-${d.end}`).join('\n'),
      set:(o,v)=>{ const days = v.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>{ const m = x.match(/^(\d{4}-\d{2}-\d{2})\s*,\s*(\d{1,2}:\d{2})\s*[-\u2013]\s*(\d{1,2}:\d{2})$/); const pad=t=>t.padStart(5,'0'); return { date:m[1], start:pad(m[2]), end:pad(m[3]) }; });
                   if (days.length) o.standCover = { types:['Sales','Support'], days }; else delete o.standCover; },
      check:v=>{ for (const x of v.split('\n').map(x=>x.trim()).filter(Boolean)){ if(!/^\d{4}-\d{2}-\d{2}\s*,\s*\d{1,2}:\d{2}\s*[-\u2013]\s*\d{1,2}:\d{2}$/.test(x)) return `Check this line: "${x}" - use YYYY-MM-DD, 10:00-18:00`; } return ''; } },
    {k:'tabs', l:'Tabs to show', t:'checks', o:ALL_TABS,
      get:o=>o.tabs||ALL_TABS, set:(o,v)=>{ o.tabs = ALL_TABS.filter(t=>v.includes(t)); } },
    {k:'draftNote', l:'Draft banner (clear when the event is final)', t:'textarea', rows:2},
    {k:'accessNotice', l:'Rota notice, e.g. access hours (HTML allowed)', t:'textarea', rows:3},
    {k:'peopleNotice', l:'Staff tab notice (HTML allowed)', t:'textarea', rows:2},
    {k:'expSymbol', l:'Allowance currency symbol', t:'text', half:1, get:o=>o.expenses ? o.expenses.symbol : '', set:()=>{} },
    {k:'expPerDay', l:'Allowance per day (blank = allowance off)', t:'number', half:1, get:o=>o.expenses ? o.expenses.perDay : '', set:()=>{} },
    {k:'expTitle', l:'Allowance card heading', t:'text', get:o=>o.expenses ? (o.expenses.title||'') : '', set:()=>{} },
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
      <div class="modal-actions"><button class="btn" type="button" id="formCancel">Cancel</button><button class="btn primary" type="submit" id="formSave">Save</button></div></form>
      <datalist id="dl_names"></datalist><datalist id="dl_activities"></datalist><datalist id="dl_categories"></datalist></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('mousedown', e=>{ if (e.target===modal) closeForm(); });
    modal.querySelector('#formCancel').addEventListener('click', closeForm);
    document.addEventListener('keydown', e=>{ if (e.key==='Escape' && modal.classList.contains('show')) closeForm(); });
    return modal;
  }
  function closeForm(){ if (modal) modal.classList.remove('show'); }
  function openModal(title, fieldsHTML, onSave, afterRender, saveLabel){
    ensureModal();
    $('formTitle').textContent = title;
    $('formSave').textContent = saveLabel || 'Save';
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
      if (f.req && (!v || (Array.isArray(v) && !v.length))) return Array.isArray(v) ? `Pick at least one: ${f.l.toLowerCase()}.` : `${f.l} is required.`;
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

  /* ---------- people ---------- */
  function ensurePerson(name){
    let p = EVENT.people.find(x=>x.name===name);
    if (!p){ p = { id: uid(), name, types: legacyTypes(name) }; EVENT.people.push(p); }
    return p;
  }
  window.onPersonModal = function(name){
    const el = $('personEditTools'); if (!el) return;
    el.innerHTML = `<button class="btn" type="button" id="ptEdit">${svg('edit',14)} Edit person</button><button class="btn" type="button" id="ptDel">${svg('trash',14)} Remove</button>`;
    $('ptEdit').onclick = ()=>{ closePersonModal(); const p = ensurePerson(name); openItemForm('people', p.id); };
    $('ptDel').onclick = ()=>{
      const n = { s:EVENT.shifts.filter(x=>x.name===name).length, a:EVENT.accom.filter(x=>x.name===name).length, f:EVENT.flights.filter(x=>x.name===name).length };
      if (!confirm(`Remove ${name} from this event, including ${n.s} shift(s), ${n.a} accommodation entr${n.a===1?'y':'ies'} and ${n.f} flight(s)?`)) return;
      EVENT.people = EVENT.people.filter(x=>x.name!==name);
      ['shifts','accom','flights'].forEach(k=>{ EVENT[k] = EVENT[k].filter(x=>x.name!==name); });
      shifts = EVENT.shifts; accom = EVENT.accom; flights = EVENT.flights;
      closePersonModal(); markDirty(); renderAll();
    };
  };

  /* ---------- add / edit / delete ---------- */
  function openItemForm(kind, id){
    const cfg = FORMS[kind];
    const arr = EVENT[kind];
    const item = id ? arr.find(x=>String(x.id)===String(id)) : null;
    const base = item || cfg.defaults();
    openModal(`${item ? 'Edit' : 'Add'} ${cfg.label}`, `<div class="form-grid" style="display:contents">${cfg.fields.map(f=>fieldHTML(f, base[f.k])).join('')}</div>`, ()=>{
      const err = validate(cfg.fields); if (err) return err;
      const obj = item || { id: uid() };
      const oldName = item ? item.name : null;
      if (kind==='people'){
        const nm = readField(cfg.fields[0]).toLowerCase();
        if (arr.some(p=>p!==item && p.name.toLowerCase()===nm)) return 'Someone with that name is already on this event.';
      }
      applyFields(obj, cfg.fields);
      if (!item) arr.push(obj);
      if (kind==='people' && oldName && oldName!==obj.name){
        ['shifts','accom','flights'].forEach(k=>EVENT[k].forEach(x=>{ if (x.name===oldName) x.name = obj.name; }));
      }
      if (kind==='shifts' || kind==='accom' || kind==='flights') ensurePerson(obj.name);
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
      const xtitle = readField(EVENT_FIELDS.find(f=>f.k==='expTitle'));
      applyFields(EVENT, EVENT_FIELDS.filter(f=>!/^exp/.test(f.k)));
      if (per === '' && !xtitle && !note) EVENT.expenses = null;
      else { EVENT.expenses = { symbol: sym || '\u00a3' }; if (per !== '') EVENT.expenses.perDay = Number(per); if (xtitle) EVENT.expenses.title = xtitle; if (note) EVENT.expenses.note = note; }
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
        tabs:[...ALL_TABS], days:[], expenses:null, info:[], shifts:[], accom:[], flights:[], actions:[], links:[], evenings:[] };
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


  /* ---------- Excel import ---------- */
  const norm = v => String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g,'');
  const MON = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const pad2 = n => String(n).padStart(2,'0');
  const isoOf = (y,m,d) => `${y}-${pad2(m)}-${pad2(d)}`;
  function readDate(v){                       // '' = blank, null = unreadable
    if (v === '' || v == null) return '';
    if (v instanceof Date) return isoOf(v.getFullYear(), v.getMonth()+1, v.getDate());
    if (typeof v === 'number'){ const o = XLSX.SSF.parse_date_code(v); return o ? isoOf(o.y,o.m,o.d) : null; }
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return isoOf(+m[1],+m[2],+m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/))){ let y=+m[3]; if (y<100) y+=2000; return isoOf(y,+m[2],+m[1]); }   // UK order
    if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,9})[ \-,]*(\d{2,4})$/))){ const i = MON.indexOf(m[2].slice(0,3).toLowerCase()); if (i>=0){ let y=+m[3]; if (y<100) y+=2000; return isoOf(y,i+1,+m[1]); } }
    return null;
  }
  function readTime(v){
    if (v === '' || v == null) return '';
    if (v instanceof Date){ return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`; }
    if (typeof v === 'number'){ const mins = Math.round((v % 1) * 1440) % 1440; return `${pad2(Math.floor(mins/60))}:${pad2(mins%60)}`; }
    const m = String(v).trim().match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm)?$/i);
    if (!m) return null;
    let h = +m[1]; const mi = m[2] ? +m[2] : 0;
    if (m[3]){ const pm = m[3].toLowerCase()==='pm'; if (pm && h<12) h+=12; if (!pm && h===12) h=0; }
    return (h<24 && mi<60) ? `${pad2(h)}:${pad2(mi)}` : null;
  }
  const truthy = v => { const s = norm(v); return s !== '' && !['n','no','0','false'].includes(s); };
  const A = {  // header aliases (normalised)
    name:['name','staffname','person'],
    sales:['sales'], support:['support'], build:['build'], visitor:['visitor'], types:['stafftype','stafftypes','types','type'],
    date:['date'], activity:['activity'], start:['start','starttime'], end:['end','endtime'], notes:['notes','locationnotes','note'],
    atype:['type','accommodationtype'], hotel:['hotel','hoteladdress','hoteladdress','address'], checkin:['checkin'], checkout:['checkout'], ref:['ref','bookingref','bookingreference'],
    direction:['direction'], status:['status'], airline:['airline'], flightNo:['flightno','flightnumber','flight'], from:['from'], to:['to'],
    departDate:['departdate'], departTime:['departtime'], arriveDate:['arrivedate'], arriveTime:['arrivetime']
  };
  function readSheet(wb, sheetNames, keys){
    const sn = wb.SheetNames.find(n=>sheetNames.includes(norm(n)));
    if (!sn) return null;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header:1, raw:true, defval:'' });
    const hi = rows.findIndex(r=>r.some(c=>A.name.includes(norm(c))));
    if (hi < 0) return { sheet:sn, rows:[], missing:true };
    const head = rows[hi].map(norm);
    const col = {}; keys.forEach(k=>{ const i = head.findIndex(h=>A[k].includes(h)); if (i>=0) col[k]=i; });
    const out = [];
    rows.slice(hi+1).forEach((r,ix)=>{
      const get = k => (col[k]==null ? '' : r[col[k]]);
      const name = String(get('name')).trim();
      if (!name || /^example/i.test(name)) return;
      out.push({ line: hi+ix+2, name, get });
    });
    return { sheet:sn, rows:out };
  }

  function parseWorkbook(wb){
    const res = { people:null, shifts:null, accom:null, flights:null, issues:[] };
    const bad = (sheet,line,msg)=>res.issues.push(`${sheet} row ${line}: ${msg}`);
    let sh;
    if ((sh = readSheet(wb, ['people','staff'], ['name','sales','support','build','visitor','types']))){
      res.people = sh.rows.map(r=>{
        let t = TYPES.filter(x=>truthy(r.get(x.toLowerCase())));
        const txt = String(r.get('types')||'');
        if (!t.length && txt) t = TYPES.filter(x=>new RegExp(x,'i').test(txt));
        return { name:r.name, types:t };
      });
    }
    if ((sh = readSheet(wb, ['rota','staffrota','staffmovements','shifts'], ['name','date','activity','start','end','notes']))){
      res.shifts = [];
      sh.rows.forEach(r=>{
        const date = readDate(r.get('date')), activity = String(r.get('activity')).trim();
        if (!date) return bad(sh.sheet, r.line, `${r.name} - date missing or not readable`);
        if (!activity) return bad(sh.sheet, r.line, `${r.name} - activity is blank`);
        const start = readTime(r.get('start')), end = readTime(r.get('end'));
        const o = { name:r.name, date, activity };
        if (start === null || end === null) bad(sh.sheet, r.line, `${r.name} - time not readable, left blank`);
        if (start) o.start = start; if (end) o.end = end;
        const n = String(r.get('notes')).trim(); if (n) o.notes = n;
        res.shifts.push(o);
      });
    }
    if ((sh = readSheet(wb, ['accommodation','accomodation','hotels'], ['name','atype','hotel','checkin','checkout','ref','notes']))){
      res.accom = [];
      sh.rows.forEach(r=>{
        const hotel = String(r.get('hotel')).trim();
        const tn = norm(r.get('atype'));
        const type = tn.startsWith('alt') ? 'Alternative Accommodation' : tn.startsWith('hotel') ? 'Hotel Booked' : tn==='tbc' ? 'TBC' : (hotel ? 'Hotel Booked' : 'TBC');
        const ci = readDate(r.get('checkin')), co = readDate(r.get('checkout'));
        if (ci === null || co === null) bad(sh.sheet, r.line, `${r.name} - a date was not readable, left blank`);
        const o = { name:r.name, type };
        if (hotel) o.hotel = hotel; if (ci) o.checkin = ci; if (co) o.checkout = co;
        const ref = String(r.get('ref')).trim(); if (ref) o.ref = ref;
        const n = String(r.get('notes')).trim(); if (n) o.notes = n;
        res.accom.push(o);
      });
    }
    if ((sh = readSheet(wb, ['flights'], ['name','direction','status','airline','flightNo','from','to','departDate','departTime','arriveDate','arriveTime','ref','notes']))){
      res.flights = [];
      sh.rows.forEach(r=>{
        const dn = norm(r.get('direction'));
        const o = { name:r.name, direction: dn.startsWith('out') ? 'Outbound' : dn.startsWith('ret') ? 'Return' : 'Other',
                    status: /tbc|unconf/i.test(String(r.get('status'))) ? 'TBC' : 'Booked' };
        ['airline','flightNo','from','to','ref','notes'].forEach(k=>{ const v = String(r.get(k)).trim(); if (v) o[k] = k==='from'||k==='to' ? v.toUpperCase() : v; });
        const dd = readDate(r.get('departDate')), ad = readDate(r.get('arriveDate')), dtm = readTime(r.get('departTime')), atm = readTime(r.get('arriveTime'));
        if (dd === null || ad === null || dtm === null || atm === null) bad(sh.sheet, r.line, `${r.name} - a date or time was not readable, left blank`);
        if (dd) o.departDate = dd; if (dtm) o.departTime = dtm; if (ad) o.arriveDate = ad; if (atm) o.arriveTime = atm;
        res.flights.push(o);
      });
    }
    return res;
  }

  /* Duplicate rules: the same person (spelling/hyphens/case ignored) + the same
       rota day + activity | hotel check-in date | flight date and route  = the same record. */
  const nameKey = n => norm(n);
  const KEYS = {
    shifts:  x => [nameKey(x.name), x.date, norm(x.activity)].join('|'),
    accom:   x => [nameKey(x.name), x.checkin || ''].join('|'),
    flights: x => [nameKey(x.name), x.departDate || '', norm(x.from), norm(x.to)].join('|')
  };
  function mergeInto(target, parsed, mode){      // mode: add | update | replace. returns counts
    const c = { people:{add:0,upd:0}, shifts:{add:0,dup:0,upd:0}, accom:{add:0,dup:0,upd:0}, flights:{add:0,dup:0,upd:0} };
    if (mode === 'replace'){ ['people','shifts','accom','flights'].forEach(k=>{ if (parsed[k]) target[k] = []; }); }
    const canon = name => { const p = target.people.find(x=>nameKey(x.name)===nameKey(name)); return p ? p.name : null; };
    const ensure = name => { let n = canon(name); if (!n){ target.people.push({ id:uid(), name, types:[] }); n = name; } return n; };
    (parsed.people || []).forEach(p=>{
      const ex = target.people.find(x=>nameKey(x.name)===nameKey(p.name));
      if (ex){
        const has = (ex.types||[]).length > 0;
        if (p.types.length && JSON.stringify(ex.types||[]) !== JSON.stringify(p.types) && (!has || mode==='update')){ ex.types = p.types; c.people.upd++; }
      } else { target.people.push({ id:uid(), name:p.name, types:p.types }); c.people.add++; }
    });
    const add = kind => (parsed[kind] || []).forEach(o=>{
      const name = ensure(o.name);
      const rec = { ...o, name };
      const k = KEYS[kind](rec);
      const ex = target[kind].find(x=>KEYS[kind](x)===k);
      if (!ex){ target[kind].push({ id:uid(), ...rec }); c[kind].add++; return; }
      if (mode === 'update'){
        let changed = false;
        Object.keys(rec).forEach(f=>{ if (f!=='name' && rec[f] !== '' && ex[f] !== rec[f]){ ex[f] = rec[f]; changed = true; } });
        if (changed) c[kind].upd++; else c[kind].dup++;
      } else c[kind].dup++;
    });
    add('shifts'); add('accom'); add('flights');
    return c;
  }
  const summarise = c => {
    const line = (label, o) => `<li><b>${label}</b>: ${o.add} new${o.upd ? `, ${o.upd} updated` : ''}${o.dup ? `, ${o.dup} already there (skipped)` : ''}</li>`;
    return `<ul style="margin:0; padding-left:18px; line-height:1.8;">${line('People',{...c.people,dup:0})}${line('Rota',c.shifts)}${line('Accommodation',c.accom)}${line('Flights',c.flights)}</ul>`;
  };

  function openImport(wb, fileName){
    const parsed = parseWorkbook(wb);
    if (!parsed.people && !parsed.shifts && !parsed.accom && !parsed.flights){
      toast('No People, Rota, Accommodation or Flights sheet found in that file.', 5000); return;
    }
    const base = { people:EVENT.people, shifts:EVENT.shifts, accom:EVENT.accom, flights:EVENT.flights };
    const dry = {};
    ['add','update','replace'].forEach(m=>{ dry[m] = summarise(mergeInto(JSON.parse(JSON.stringify(base)), parsed, m)); });
    const found = ['people','shifts','accom','flights'].filter(k=>parsed[k]).map(k=>({people:'People',shifts:'Rota',accom:'Accommodation',flights:'Flights'}[k])).join(', ');
    const issues = parsed.issues.length ? `<div class="notice warn" style="margin:12px 0 0;"><b>${parsed.issues.length} row${parsed.issues.length===1?'':'s'} need a look</b><ul style="margin:6px 0 0; padding-left:18px;">${parsed.issues.slice(0,8).map(i=>`<li>${esc(i)}</li>`).join('')}${parsed.issues.length>8?`<li>and ${parsed.issues.length-8} more</li>`:''}</ul></div>` : '';
    const html = `<div class="field"><p style="margin:0 0 10px; color:var(--ink-soft); font-size:14px;"><b style="color:var(--ink);">${esc(fileName)}</b> &middot; sheets found: ${found}</p>
      <p style="margin:0 0 6px; font-size:13px; font-weight:700; color:var(--ink-soft);">This would do:</p><div id="impSummary">${dry.add}</div>${issues}
      <div class="checks" style="margin-top:16px; flex-direction:column; align-items:flex-start; gap:10px;">
        <label><input type="radio" name="impMode" value="add" checked> <span><b>Add new only</b> &ndash; rows already in ${esc(EVENT.label)} are left as they are</span></label>
        <label><input type="radio" name="impMode" value="update"> <span><b>Add new and update</b> rows that match (same person + date/route) with the values in the file</span></label>
        <label><input type="radio" name="impMode" value="replace"> <span><b>Replace</b> everything on the sheets in this file</span></label>
      </div></div>`;
    openModal('Import from Excel', html, ()=>{
      const mode = document.querySelector('input[name=impMode]:checked').value;
      const counts = mergeInto(EVENT, parsed, mode);
      shifts = EVENT.shifts; accom = EVENT.accom; flights = EVENT.flights;
      const tabs = EVENT.tabs || ['rota','accom','flights','people','info','mkt'];
      ['accom','flights'].forEach(t=>{ if (((t==='accom' && EVENT.accom.length) || (t==='flights' && EVENT.flights.length)) && !tabs.includes(t)) tabs.push(t); });
      EVENT.tabs = ALL_TABS.filter(t=>tabs.includes(t));
      renderTabs(); switchTab(activeTab);
      markDirty(); renderAll();
      const upd = counts.people.upd + counts.shifts.upd + counts.accom.upd + counts.flights.upd;
      toast(`Imported: ${counts.people.add} people, ${counts.shifts.add} rota rows, ${counts.accom.add} accommodation, ${counts.flights.add} flights added${upd ? `; ${upd} updated` : ''}. Now download the event file.`, 6500);
    }, ()=>{
      document.querySelectorAll('input[name=impMode]').forEach(r=>r.addEventListener('change', ()=>{ $('impSummary').innerHTML = dry[r.value]; }));
    }, 'Import');
  }

  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.id = 'importFile'; fileInput.accept = '.xlsx,.xls,.csv'; fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', async ()=>{
    const f = fileInput.files[0]; fileInput.value = ''; if (!f) return;
    try { const wb = XLSX.read(await f.arrayBuffer(), { type:'array' }); openImport(wb, f.name); }
    catch (e) { toast('Could not read that file. Is it an Excel (.xlsx) file?', 5000); }
  });
  window.__parseWorkbook = parseWorkbook;   // used by tests

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
        <button class="btn" type="button" data-eb="import">${svg('download',14)} Import Excel</button>
        <button class="btn" type="button" data-eb="template">${svg('download',14)} Template</button>
        <button class="btn" type="button" data-eb="expxlsx">${svg('download',14)} Expenses Excel</button>
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
    else if (t.dataset.eb==='import') document.getElementById('importFile').click();
    else if (t.dataset.eb==='template'){ const a = document.createElement('a'); a.href = 'templates/StaffTemplate.xlsx'; a.download = 'StaffTemplate.xlsx'; document.body.appendChild(a); a.click(); a.remove(); }
    else if (t.dataset.eb==='expxlsx') exportExpensesExcel();
    else if (t.dataset.eb==='download') downloadEvent();
  });
  window.addEventListener('beforeunload', e=>{ if (dirty.size){ e.preventDefault(); e.returnValue = ''; } });

  window.updateEditBar();
})();
