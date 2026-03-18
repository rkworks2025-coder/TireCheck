(() => {
  // ===== 設定 =====
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';

  // 巡回アプリとの連携フラグ
  let isSingleMode = false;

  // ===== 要素 =====
  const form = document.getElementById('form');
  const submitBtn = document.getElementById('submitBtn');
  const toast = document.getElementById('toast');

  const resultCard = document.getElementById('resultCard');
  const resHeader  = document.getElementById('res_header');
  const resLines   = document.getElementById('res_lines');
  const backBtn    = document.getElementById('backBtn');

  // ===== ユーティリティ =====
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
      let raw = null;
      if(prev && prev[id] != null && String(prev[id]).trim() !== ''){
        raw = prev[id];
      }
      
      if(raw === null){
        v = fallbackFor(id);
      } else {
        if(id.startsWith('tread')){
          const num = parseFloat(raw);
          if(!isNaN(num)){
            v = num.toFixed(1);
          }else{
            v = String(raw).trim();
          }
        }else if(id.startsWith('dot')){
          const s = String(raw).trim();
          v = s.padStart(4, '0');
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
    if(!(st||md||pf)) return;
    if(!SHEETS_URL) return;
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
    }catch(err){
      console.warn('fetchSheetData failed', err);
    }
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
      const j = await res.json().catch(()=>({ok:true}));
      if(j && j.ok) {
        showToast('送信完了');
        
        // 巡回アプリへの合図（フラグの書き出し）
        const pf = gv('[name="plate_full"]');
        if (pf) {
          localStorage.setItem('junkai:tire_completed_plate', pf);
        }
        
      } else {
        showToast('送信エラー');
      }
    }catch(err){
      console.error(err);
      showToast('送信失敗');
    }
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
    const d = new Date();
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    const jst = new Date(utc + 9 * 60 * 60000);
    const y  = jst.getFullYear();
    const m  = String(jst.getMonth() + 1).padStart(2, '0');
    const day = String(jst.getDate()).padStart(2, '0');
    const h  = String(jst.getHours());
    const mi = String(jst.getMinutes()).padStart(2, '0');
    const s  = String(jst.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day} ${h}:${mi}:${s}`;
  }

  function applyUrl(){
    const p = new URLSearchParams(location.search);
    // モード判定
    isSingleMode = (p.get('mode') === 'single');

    const set = (name) => { const v = p.get(name); if(v){ const el = qs(`[name="${name}"]`); if(el){ el.value = v; } } };
    ['station','plate_full','model'].forEach(set);
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

  const AUTO_SEQUENCE = [
    'std_f','std_r',
    'tread_rf','pre_rf','dot_rf',
    'tread_lf','pre_lf','dot_lf',
    'tread_lr','pre_lr','dot_lr',
    'tread_rr','pre_rr','dot_rr'
  ];
  const FIELD_RULES = {
    std_f: {len:3}, std_r: {len:3},
    tread_rf: {len:2, decimal:true}, pre_rf: {len:3}, dot_rf: {len:4},
    tread_lf: {len:2, decimal:true}, pre_lf: {len:3}, dot_lf: {len:4},
    tread_lr: {len:2, decimal:true}, pre_lr: {len:3}, dot_lr: {len:4},
    tread_rr: {len:2, decimal:true}, pre_rr: {len:3}, dot_rr: {len:4}
  };

  function formatTread(raw){
    const num = parseInt(raw, 10);
    if(isNaN(num)) return '';
    return (num / 10).toFixed(1);
  }

  function nowJST(){
    const d = new Date();
    const utc  = d.getTime() + d.getTimezoneOffset() * 60000;
    const jst  = new Date(utc + 9 * 60 * 60000);
    const mm   = String(jst.getMonth() + 1).padStart(2, '0');
    const dd   = String(jst.getDate()).padStart(2, '0');
    const HH   = String(jst.getHours()).padStart(2, '0');
    const MM   = String(jst.getMinutes()).padStart(2, '0');
    return mm + '/' + dd + ' ' + HH + ':' + MM;
  }

  function focusNext(currentId){
    const idx = AUTO_SEQUENCE.indexOf(currentId);
    if(idx < 0) return;
    const nextId = AUTO_SEQUENCE[idx + 1];
    if(!nextId) return;
    const nextEl = document.getElementById(nextId) || document.querySelector(`[name="${nextId}"]`);
    if(nextEl) nextEl.focus();
  }

  function setupAutoAdvance(){
    AUTO_SEQUENCE.forEach(id => {
      const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
      if(!el) return;
      el.addEventListener('input', ev => {
        const rule = FIELD_RULES[id];
        if(!rule) return;
        let raw = ev.target.value;
        const digits = raw.replace(/\D/g, '');
        if(rule.decimal){
          if(!raw.includes('.') && digits.length >= rule.len){
            ev.target.value = formatTread(digits.slice(0, rule.len));
            focusNext(id);
          }
        }else{
          if(digits.length >= rule.len){
            ev.target.value = digits.slice(0, rule.len);
            focusNext(id);
          }
        }
      });
      el.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); focusNext(id); } });
    });
  }

  const getWeek = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  function init(){
    applyUrl(); showPrevPlaceholders(); fetchSheetData(); wire(); setupAutoAdvance();
    if(form){
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const now = new Date();
        const curY = Number(String(now.getFullYear()).slice(-2));
        const curW = getWeek(now);
        const tires = ['rf', 'lf', 'lr', 'rr'];
        for (const pos of tires) {
          const dotVal = gv(`#dot_${pos}`);
          if (!dotVal) continue;
          if (dotVal.length !== 4) { showToast(`${pos.toUpperCase()}は4桁で入力してください`); return; }
          const ww = parseInt(dotVal.substring(0, 2), 10);
          const yy = parseInt(dotVal.substring(2, 4), 10);
          if (ww < 1 || ww > 53) { showToast(`${pos.toUpperCase()}の週が不正です`); return; }
          if (yy > curY || (yy === curY && ww > curW)) { showToast(`${pos.toUpperCase()}が未来の日付です`); return; }
        }
        const p = collectPayload();
        if(resHeader) resHeader.textContent = (p.station ? p.station + '\n' : '') + p.plate_full + '\n' + p.model;
        const lines = [];
        if(p.std_f && p.std_r) lines.push(`${p.std_f}-${p.std_r}`);
        lines.push(`${p.tread_rf||''} ${p.pre_rf||''} ${p.dot_rf||''}   RF`);
        lines.push(`${p.tread_lf||''} ${p.pre_lf||''} ${p.dot_lf||''}   LF`);
        lines.push(`${p.tread_lr||''} ${p.pre_lr||''} ${p.dot_lr||''}   LR`);
        lines.push(`${p.tread_rr||''} ${p.pre_rr||''} ${p.dot_rr||''}   RR`);
        lines.push('', nowJST());
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
