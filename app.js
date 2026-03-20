(() => {
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';

  let isSingleMode = false;
  let currentFocusInput = null;
  let lastTireRow = null; // 現在のタイヤ行を記憶

  const form = document.getElementById('form');
  const toast = document.getElementById('toast');
  const resultCard = document.getElementById('resultCard');
  const resHeader  = document.getElementById('res_header');
  const resLines   = document.getElementById('res_lines');
  const backBtn    = document.getElementById('backBtn');
  const keypad = document.getElementById('customKeypad');
  const mainWrap = document.getElementById('mainWrap');

  const qs = (s, root=document) => root.querySelector(s);
  const gv = (sel) => { const el = typeof sel==='string'? qs(sel): sel; return (el && el.value||'').trim(); };
  const showToast = (msg) => { toast.textContent = msg; toast.hidden = false; setTimeout(()=>toast.hidden=true, 2500); };
  
  const FIELDS = [
    'tread_rf','pre_rf','dot_rf',
    'tread_lf','pre_lf','dot_lf',
    'tread_lr','pre_lr','dot_lr',
    'tread_rr','pre_rr','dot_rr'
  ];

  function fallbackFor(id){
    if(id.startsWith('tread')) return '--';
    if(id.startsWith('pre'))   return '---';
    return '----';
  }

  function showPrevPlaceholders(){
    document.querySelectorAll('.prev-val').forEach(span=>{
      const id = span.getAttribute('data-for');
      span.textContent = `(${fallbackFor(id)})`;
    });
  }

  function applyPrev(prev){
    FIELDS.forEach(id => {
      const span = document.querySelector(`.prev-val[data-for="${id}"]`);
      if(!span) return;
      let v = '';
      let raw = (prev && prev[id] != null && String(prev[id]).trim() !== '') ? prev[id] : null;
      if(raw === null){
        v = fallbackFor(id);
      } else {
        if(id.startsWith('tread')){
          const num = parseFloat(raw);
          v = !isNaN(num) ? num.toFixed(1) : String(raw).trim();
        }else if(id.startsWith('dot')){
          v = String(raw).trim().padStart(4, '0');
        }else{
          v = String(raw).trim();
        }
      }
      span.textContent = `(${v})`;
    });
  }

  async function fetchSheetData(){
    const st = gv('[name="station"]');
    const md = gv('[name="model"]');
    const pf = gv('[name="plate_full"]');
    if(!(st||md||pf) || !SHEETS_URL) return;
    const u = new URL(SHEETS_URL);
    u.searchParams.set('key', SHEETS_KEY);
    u.searchParams.set('op','read');
    u.searchParams.set('sheet','Tirelog');
    if(st) u.searchParams.set('station', st);
    if(md) u.searchParams.set('model', md);
    if(pf) u.searchParams.set('plate_full', pf);
    u.searchParams.set('ts', Date.now());
    try{
      const res = await fetch(u.toString(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      const f = qs('[name="std_f"]'); const r = qs('[name="std_r"]');
      if(data.std_f && f && !f.value) f.value = data.std_f;
      if(data.std_r && r && !r.value) r.value = data.std_r;
      applyPrev(data.prev || {});
    }catch(err){ console.warn('fetchSheetData failed', err); }
  }

  async function postToSheet(){
    if(!SHEETS_URL){ showToast('送信先未設定'); return; }
    const payload = collectPayload();
    try{
      const body = new URLSearchParams();
      body.set('key', SHEETS_KEY);
      body.set('json', JSON.stringify(payload));
      const res = await fetch(SHEETS_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
        body
      });
      if(!res.ok) throw new Error('HTTP '+res.status);
      showToast('送信完了');
      const pf = gv('[name="plate_full"]');
      if (pf) localStorage.setItem('junkai:tire_completed_plate', pf);
    }catch(err){ console.error(err); showToast('送信失敗'); }
  }

  function collectPayload(){
    const obj = {
      station: gv('[name="station"]'),
      plate_full: gv('[name="plate_full"]'),
      model: gv('[name="model"]'),
      std_f: gv('[name="std_f"]'),
      std_r: gv('[name="std_r"]'),
      tread_rf: gv('#tread_rf'), pre_rf: gv('#pre_rf'), dot_rf: gv('#dot_rf'),
      tread_lf: gv('#tread_lf'), pre_lf: gv('#pre_lf'), dot_lf: gv('#dot_lf'),
      tread_lr: gv('#tread_lr'), pre_lr: gv('#pre_lr'), dot_lr: gv('#dot_lr'),
      tread_rr: gv('#tread_rr'), pre_rr: gv('#pre_rr'), dot_rr: gv('#dot_rr'),
      operator: ''
    };
    obj.timestamp_iso = timestampForSheet();
    return obj;
  }

  function timestampForSheet(){
    const jst = new Date(Date.now() + 9 * 60 * 60000);
    return `${jst.getFullYear()}/${String(jst.getMonth() + 1).padStart(2,'0')}/${String(jst.getDate()).padStart(2,'0')} ${jst.getHours()}:${String(jst.getMinutes()).padStart(2,'0')}:${String(jst.getSeconds()).padStart(2,'0')}`;
  }

  function applyUrl(){
    const p = new URLSearchParams(location.search);
    isSingleMode = (p.get('mode') === 'single');
    ['station','plate_full','model'].forEach(name => {
      const v = p.get(name);
      if(v) { const el = qs(`[name="${name}"]`); if(el) el.value = v; }
    });
  }

  function wire(){
    ['station','plate_full','model'].forEach(name =>{
      document.querySelectorAll(`[name="${name}"]`).forEach(el=>{
        const h = ()=>{ fetchSheetData(); };
        el.addEventListener('change', h, {passive:true});
        el.addEventListener('input',  h, {passive:true});
      });
    });
  }

  const AUTO_SEQUENCE = ['std_f','std_r','tread_rf','pre_rf','dot_rf','tread_lf','pre_lf','dot_lf','tread_lr','pre_lr','dot_lr','tread_rr','pre_rr','dot_rr','submitBtn'];
  const FIELD_RULES = {
    std_f: {len:3}, std_r: {len:3},
    tread_rf: {len:2, decimal:true}, pre_rf: {len:3}, dot_rf: {len:4},
    tread_lf: {len:2, decimal:true}, pre_lf: {len:3}, dot_lf: {len:4},
    tread_lr: {len:2, decimal:true}, pre_lr: {len:3}, dot_lr: {len:4},
    tread_rr: {len:2, decimal:true}, pre_rr: {len:3}, dot_rr: {len:4}
  };

  function formatTread(raw){
    const num = parseInt(raw, 10);
    return isNaN(num) ? '' : (num / 10).toFixed(1);
  }

  function focusNext(currentId){
    const idx = AUTO_SEQUENCE.indexOf(currentId);
    const nextId = AUTO_SEQUENCE[idx + 1];
    if(!nextId) return;
    if(nextId === 'submitBtn'){
      const btn = document.getElementById('submitBtn');
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btn.focus();
      hideKeypad();
      return;
    }
    const nextEl = document.getElementById(nextId) || document.querySelector(`[name="${nextId}"]`);
    if(nextEl) nextEl.focus();
  }

  // --- キーボード・スクロール制御 (V9F: 跳ね防止・改行時のみ移動) ---
  function showKeypad(target){
    keypad.classList.add('show');
    const currentRow = target.closest('.tire-row') || target.parentElement;
    
    // 同じタイヤ行内での移動なら何もしない
    if(lastTireRow === currentRow) return;
    lastTireRow = currentRow;

    const rect = target.getBoundingClientRect();
    const kbHeight = 190;
    const threshold = window.innerHeight - kbHeight;

    // 隠れる場合のみスライド（絶対位置ベースで計算）
    if(rect.bottom > threshold){
      const shift = rect.bottom - threshold + 20;
      // 現在のtransform値を取得して加算することで「ガクン」を防止
      const currentTransform = new WebKitCSSMatrix(getComputedStyle(mainWrap).transform).m42;
      mainWrap.style.transform = `translateY(${currentTransform - shift}px)`;
    }
  }

  function hideKeypad(){
    keypad.classList.remove('show');
    mainWrap.style.transform = 'translateY(0)';
    currentFocusInput = null;
    lastTireRow = null;
  }

  function setupAutoAdvance(){
    AUTO_SEQUENCE.forEach(id => {
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if(!el || id === 'submitBtn') return;
      el.addEventListener('input', ev => {
        const rule = FIELD_RULES[id];
        if(!rule) return;
        let digits = ev.target.value.replace(/\D/g, '');
        if(digits.length >= rule.len){
          ev.target.value = rule.decimal ? formatTread(digits.slice(0, rule.len)) : digits.slice(0, rule.len);
          focusNext(id);
        }
      });
      el.addEventListener('focus', () => { currentFocusInput = el; showKeypad(el); });
    });
  }

  function setupCustomKeypad(){
    keypad.addEventListener('touchstart', e => {
      const btn = e.target.closest('.key');
      if(!btn || !currentFocusInput) return;
      e.preventDefault();
      const val = btn.getAttribute('data-val');
      if(val === 'bs') currentFocusInput.value = currentFocusInput.value.slice(0, -1);
      else if(val !== null) currentFocusInput.value += val;
      currentFocusInput.dispatchEvent(new Event('input', { bubbles: true }));
    }, {passive: false});
    document.getElementById('keyClose').addEventListener('click', hideKeypad);
    document.addEventListener('touchstart', e => {
      if(!keypad.contains(e.target) && !e.target.matches('input[inputmode="none"]')) hideKeypad();
    }, {passive:true});
  }

  function init(){
    applyUrl(); showPrevPlaceholders(); fetchSheetData(); wire(); setupAutoAdvance(); setupCustomKeypad();
    if(form){
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const p = collectPayload();
        if(resHeader) resHeader.textContent = (p.station ? p.station + '\n' : '') + p.plate_full + '\n' + p.model;
        const lines = [
          (p.std_f && p.std_r ? `${p.std_f}-${p.std_r}` : ''),
          `${p.tread_rf||''} ${p.pre_rf||''} ${p.dot_rf||''}  RF`,
          `${p.tread_lf||''} ${p.pre_lf||''} ${p.dot_lf||''}  LF`,
          `${p.tread_lr||''} ${p.pre_lr||''} ${p.dot_lr||''}  LR`,
          `${p.tread_rr||''} ${p.pre_rr||''} ${p.dot_rr||''}  RR`,
          '', new Date().toLocaleString('ja-JP')
        ];
        if(resLines) resLines.textContent = lines.join('\n');
        form.style.display = 'none'; resultCard.style.display = 'block'; window.scrollTo({top:0});
        await postToSheet();
      });
    }
    if(backBtn) backBtn.addEventListener('click', () => { resultCard.style.display = 'none'; form.style.display = 'block'; window.scrollTo({top:0}); });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
