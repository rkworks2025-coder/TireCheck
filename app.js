(() => {
  const SHEETS_URL = window.SHEETS_URL || '';
  const SHEETS_KEY = window.SHEETS_KEY || '';
  const GITHUB_IMG_API = "https://api.github.com/repos/rkworks2025-coder/work/contents/img";
  const DB_NAME = "JunkaiAssets";
  const STORE_NAME = "SplashImages";

  let isSingleMode = false;
  let currentFocusInput = null;
  let lastRowElement = null; 
  let audioCtx = null; 
  let abortController = new AbortController();
  let isCheckingAssets = false;

  const form = document.getElementById('form');
  const submitBtn = document.getElementById('submitBtn');
  const toast = document.getElementById('toast');
  const resultCard = document.getElementById('resultCard');
  const resHeader  = document.getElementById('res_header');
  const resLines   = document.getElementById('res_lines');
  const backBtn    = document.getElementById('backBtn');
  const keypad = document.getElementById('customKeypad');
  const mainWrap = document.getElementById('mainWrap');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const progressWrap = document.getElementById('progressWrap');
  const loadingMsg = document.getElementById('loadingMsg');

  const qs = (s, root=document) => root.querySelector(s);
  const gv = (sel) => { const el = typeof sel==='string'? qs(sel): sel; return (el && el.value||'').trim(); };
  const showToast = (msg) => { toast.textContent = msg; toast.hidden = false; setTimeout(()=>toast.hidden=true, 2500); };
  
  const FIELDS = [
    'tread_rf','pre_rf','dot_rf',
    'tread_lf','pre_lf','dot_lf',
    'tread_lr','pre_lr','dot_lr',
    'tread_rr','pre_rr','dot_rr'
  ];

  function playClickSound(){
    if(!audioCtx) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(4000, t); 
    osc.frequency.exponentialRampToValueAtTime(1000, t + 0.01); 
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.01);
    osc.start(t);
    osc.stop(t + 0.01);
  }

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
      if(raw === null) v = fallbackFor(id);
      else {
        if(id.startsWith('tread')){
          const num = parseFloat(raw);
          v = !isNaN(num) ? num.toFixed(1) : String(raw).trim();
        }else if(id.startsWith('dot')) v = String(raw).trim().padStart(4, '0');
        else v = String(raw).trim();
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
    }catch(err){ console.error('fetchSheetData failed', err); throw err; }
  }

  async function postToSheet(){
    if(!SHEETS_URL){ showToast('送信先未設定'); throw new Error('SHEETS_URL is not defined'); }
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
    }catch(err){ console.error(err); showToast('送信失敗'); throw err; }
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

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getStoredKeys() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const trans = db.transaction(STORE_NAME, "readonly");
      const store = trans.objectStore(STORE_NAME);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveImage(url, blob) {
    const db = await openDB();
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = () => {
        const trans = db.transaction(STORE_NAME, "readwrite");
        trans.objectStore(STORE_NAME).put(reader.result, url);
        trans.oncomplete = () => resolve();
        trans.onerror = () => reject(trans.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  async function getRandomAsset() {
    const keys = await getStoredKeys();
    if (keys.length === 0) return null;
    const key = keys[Math.floor(Math.random() * keys.length)];
    const db = await openDB();
    return new Promise(r => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      req.onsuccess = () => r({ url: key, data: req.result });
      req.onerror = () => r(null);
    });
  }

  async function syncAssets() {
    if (isCheckingAssets) return;
    isCheckingAssets = true;
    try {
      const res = await fetch(GITHUB_IMG_API, { signal: abortController.signal });
      if (!res.ok) throw new Error("API failed");
      const files = await res.json();
      const remoteUrls = files.filter(f => f.name.match(/\.(jpg|jpeg|png|gif)$/i)).map(f => f.download_url);
      
      const localKeys = await getStoredKeys();
      const targets = remoteUrls.filter(url => !localKeys.includes(url));

      if (targets.length > 0) {
        loadingMsg.textContent = "データをダウンロードしています";
        progressWrap.hidden = false;
        let done = 0;
        for (const url of targets) {
          const imgRes = await fetch(url, { signal: abortController.signal });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            await saveImage(url, blob);
          }
          done++;
          const pct = Math.floor((done / targets.length) * 100);
          progressBar.style.width = pct + "%";
          progressText.textContent = pct + "%";
        }
      }
      
      const splash = await getRandomAsset();
      if (splash) {
        // ★情報を二分化: URLはTMA用、Dataは表示用
        localStorage.setItem("junkai:preloaded_splash_url", splash.url);
        localStorage.setItem("junkai:preloaded_splash_data", splash.data);
      }

    } catch (e) {
      if (e.name !== 'AbortError') console.warn("Asset sync failed", e);
    } finally {
      loadingOverlay.style.display = 'none';
      mainWrap.style.visibility = 'visible';
      isCheckingAssets = false;
    }
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
      keypad.classList.remove('show');
      if (currentFocusInput) currentFocusInput.blur();
      currentFocusInput = null;
      lastRowElement = null;
      return;
    }
    const nextEl = document.getElementById(nextId) || document.querySelector(`[name="${nextId}"]`);
    if(nextEl) nextEl.focus({ preventScroll: true });
  }

  function showKeypad(target){
    keypad.classList.add('show');
    const currentRow = target.closest('.tire-row, .std-row') || target.parentElement;
    if(!currentRow) return;
    const vv = window.visualViewport;
    const vh = vv ? vv.height : window.innerHeight;
    const kbRect = keypad.getBoundingClientRect();
    const naturalBottom = currentRow.getBoundingClientRect().bottom - new WebKitCSSMatrix(getComputedStyle(mainWrap).transform).m42;
    const threshold = vh - kbRect.height;
    mainWrap.style.transform = naturalBottom > threshold ? `translateY(-${naturalBottom - threshold + 20}px)` : 'translateY(0)';
    lastRowElement = currentRow;
  }

  function hideKeypad(){
    keypad.classList.remove('show');
    if (currentFocusInput) currentFocusInput.blur();
    currentFocusInput = null;
    lastRowElement = null;
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
      if(!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if(AudioContext) audioCtx = new AudioContext();
      }
      const btn = e.target.closest('.key');
      if(!btn || !currentFocusInput) return;
      e.preventDefault(); playClickSound();
      const val = btn.getAttribute('data-val');
      if(val === 'bs') currentFocusInput.value = currentFocusInput.value.slice(0, -1);
      else if(val !== null) currentFocusInput.value += val;
      else if(btn.id === 'keyClose') { hideKeypad(); return; }
      currentFocusInput.dispatchEvent(new Event('input', { bubbles: true }));
    }, {passive: false});
    document.getElementById('keyClose').addEventListener('click', hideKeypad);
    document.addEventListener('touchstart', e => {
      if(!keypad.contains(e.target) && !e.target.matches('input[inputmode="none"]')) {
        if(keypad.classList.contains('show')) hideKeypad();
      }
    }, {passive:true});
  }

  function init(){
    syncAssets();
    const p = new URLSearchParams(location.search);
    isSingleMode = (p.get('mode') === 'single');
    ['station','plate_full','model'].forEach(name => {
      const v = p.get(name);
      if(v) { const el = qs(`[name="${name}"]`); if(el) el.value = v; }
    });
    showPrevPlaceholders(); fetchSheetData();
    ['station','plate_full','model'].forEach(name =>{
      document.querySelectorAll(`[name="${name}"]`).forEach(el=>{
        const h = ()=>{ fetchSheetData(); };
        el.addEventListener('change', h, {passive:true});
        el.addEventListener('input',  h, {passive:true});
      });
    });
    setupAutoAdvance(); setupCustomKeypad();
    if(form){
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        abortController.abort();
        const payload = collectPayload();
        if(resHeader) resHeader.textContent = (payload.station ? payload.station + '\n' : '') + payload.plate_full + '\n' + payload.model;
        const lines = [
          (payload.std_f && payload.std_r ? `${payload.std_f}-${payload.std_r}` : ''),
          `${payload.tread_rf||''} ${payload.pre_rf||''} ${payload.dot_rf||''}  RF`,
          `${payload.tread_lf||''} ${payload.pre_lf||''} ${payload.dot_lf||''}  LF`,
          `${payload.tread_lr||''} ${payload.pre_lr||''} ${payload.dot_lr||''}  LR`,
          `${payload.tread_rr||''} ${payload.pre_rr||''} ${payload.dot_rr||''}  RR`,
          '', new Date().toLocaleString('ja-JP')
        ];
        if(resLines) resLines.textContent = lines.join('\n');
        mainWrap.style.transform = 'translateY(0)';
        form.style.display = 'none'; 
        resultCard.style.display = 'block'; 
        window.scrollTo({top:0});
        await postToSheet();
      });
    }
    if(backBtn) backBtn.addEventListener('click', () => { 
      resultCard.style.display = 'none'; 
      form.style.display = 'block'; 
      window.scrollTo({top:0}); 
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
