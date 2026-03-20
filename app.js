'use strict';

// --- グローバル変数 ---
let currentFocusInput = null; // 現在フォーカスされている入力欄を保持
const keypad = document.getElementById('customKeypad');
const mainWrap = document.getElementById('mainWrap');

// --- ユーティリティ関数 ---
const q = s => document.querySelector(s);
const qa = s => document.querySelectorAll(s);

const showToast = (msg) => {
  const t = q('#toast');
  t.textContent = msg;
  t.hidden = false;
  if(window._tTimer) clearTimeout(window._tTimer);
  window._tTimer = setTimeout(()=> t.hidden=true, 3000);
};

// 小数点自動挿入ロジック (V9Cを継承)
const formatTread = (val) => {
  if(!val) return "";
  let digits = val.replace(/\D/g, "");
  if(digits.length === 1){
    return digits + ".0";
  } else if(digits.length >= 2){
    return digits[0] + "." + digits[1];
  }
  return digits;
};

// 残溝入力欄の設定 (V9Cを継承、inputイベントのみ利用)
const setupTreadInput = (id) => {
  const input = document.getElementById(id);
  
  // 標準キーボード抑止のため、inputmode="none" をJSでも設定（保険）
  input.setAttribute('inputmode', 'none');

  input.addEventListener('input', (e) => {
    let raw = e.target.value.replace(/\D/g, "");
    if(raw.length > 2) raw = raw.slice(0, 2);
    
    // 内部的な値を保持するためのカスタム属性
    input.setAttribute('data-raw', raw); 

    // 表示用のフォーマット
    const formatted = formatTread(raw);
    e.target.value = formatted; 
    
    // 2桁入力されたら、次の項目へ自動移動 (V9Cロジック)
    if(raw.length === 2) {
      advanceFocus(input);
    }
  });

  // フォーカス時にフォーマット前の状態に戻す処理は不要に（カスタムテンキーが raw 値を扱うため）
  input.addEventListener('focus', (e) => {
    currentFocusInput = e.target;
    e.target.selectionStart = e.target.selectionEnd = e.target.value.length; // カーソルを末尾に
    showKeypad(e.target);
  });
};

// 空気圧・製造年入力欄の設定 (V9Cを継承)
const setupNormalInput = (id, maxLen) => {
  const input = document.getElementById(id);
  input.setAttribute('inputmode', 'none'); // 標準キーボード抑止

  input.addEventListener('input', (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if(val.length > maxLen) val = val.slice(0, maxLen);
    e.target.value = val;
    
    // 規定桁数に達したら、次の項目へ自動移動 (V9Cロジック)
    if(val.length === maxLen) {
      advanceFocus(input);
    }
  });

  input.addEventListener('focus', (e) => {
    currentFocusInput = e.target;
    showKeypad(e.target);
  });
};

// オートアドバンス（自動移動）ロジック (V9Cを継承)
const advanceFocus = (currentInput) => {
  const inputs = Array.from(qa('input[inputmode="none"]')); // カスタムキーボード対象のinputのみ
  const index = inputs.indexOf(currentInput);
  if(index >= 0 && index < inputs.length - 1) {
    // 少し遅延させないと、最後の数字入力イベントが次の入力欄に引き継がれる場合がある
    setTimeout(() => {
      inputs[index + 1].focus();
    }, 10);
  } else {
    // 最後の入力欄だった場合はキーボードを閉じる
    hideKeypad();
    currentInput.blur();
  }
};

// --- カスタムキーボード関連ロジック ---

// キーボードを表示し、画面を押し上げる
const showKeypad = (targetInput) => {
  keypad.classList.add('show');
  
  // 入力欄の位置に合わせて画面を押し上げる
  const rect = targetInput.getBoundingClientRect();
  const keypadHeight = 280; // CSSで設定した高さ
  const offset = 20; // 入力欄とキーボードの間の余白

  // 入力欄がキーボードに隠れる位置にある場合
  if(rect.bottom > window.innerHeight - keypadHeight) {
    const moveY = rect.bottom - (window.innerHeight - keypadHeight) + offset;
    mainWrap.style.transform = `translateY(-${moveY}px)`;
  } else {
    mainWrap.style.transform = 'translateY(0)';
  }
};

// キーボードを閉じ、画面の位置を戻す
const hideKeypad = () => {
  keypad.classList.remove('show');
  mainWrap.style.transform = 'translateY(0)';
  currentFocusInput = null;
};

// キーボードボタンのクリックイベント処理
const handleKeyClick = (e) => {
  if(!currentFocusInput) return;
  
  const key = e.target.closest('.key');
  if(!key) return;

  const val = key.getAttribute('data-val');
  let currentVal = "";

  // 残溝入力欄の場合は、データ属性から生の値を、それ以外はvalueを取得
  if(currentFocusInput.id.startsWith('tread_')) {
    currentVal = currentFocusInput.getAttribute('data-raw') || "";
  } else {
    currentVal = currentFocusInput.value;
  }
  
  const maxLen = parseInt(currentFocusInput.getAttribute('maxlength')) || 2; // 残溝は2桁固定

  if(val === 'bs') {
    // バックスペース処理
    currentVal = currentVal.slice(0, -1);
  } else if(!isNaN(val)) {
    // 数字入力処理
    if(currentVal.length < maxLen) {
      currentVal += val;
    }
  }

  // 値を入力欄に設定し、'input' イベントを手動で発火させる
  // これにより、既存のsetup関数内のロジック（フォーマット、オートアドバンス）が動作する
  if(currentFocusInput.id.startsWith('tread_')) {
    currentFocusInput.value = currentVal; // formatTreadロジックを動かすために一旦生の値を設定
    const event = new Event('input', { bubbles: true });
    currentFocusInput.dispatchEvent(event);
  } else {
    currentFocusInput.value = currentVal;
    const event = new Event('input', { bubbles: true });
    currentFocusInput.dispatchEvent(event);
  }
};

// --- 初期化 ---
const init = () => {
  // 保存・結果表示ロジック等はV9Cから継承 (中身は省略、既存のapp.jsのままと想定)
  const renderPrevValues = () => {
    // ... V9Cロジック ...
  };
  const loadInputsFromQuery = () => {
    // ... V9Cロジック ...
  };
  const getPrevInspection = () => {
    // ... V9Cロジック ...
  };
  // ... その他V9Cの関数 ...

  // 1. 既存の入力ロジックを設定
  // 規定圧
  setupNormalInput('std_f', 3);
  setupNormalInput('std_r', 3);
  
  // 各タイヤ
  const tires = ['rf', 'lf', 'lr', 'rr'];
  tires.forEach(t => {
    setupTreadInput(`tread_${t}`); // 残溝
    setupNormalInput(`pre_${t}`, 3); // 空気圧
    setupNormalInput(`dot_${t}`, 4); // 製造年
  });

  // 2. カスタムキーボードのイベント設定
  q('.keypad-grid').addEventListener('click', handleKeyClick);
  q('#keyClose').addEventListener('click', hideKeypad);

  // 3. キーボード以外がタップされた時に閉じる処理
  document.addEventListener('touchstart', (e) => {
    if(!keypad.contains(e.target) && !e.target.matches('input[inputmode="none"]')) {
      if(keypad.classList.contains('show')) {
        hideKeypad();
        if(currentFocusInput) currentFocusInput.blur();
      }
    }
  }, { passive: true });

  // 4. V9Cの初期化処理を実行
  const renderPrev = async () => {
    if(!window.SHEETS_URL) return;
    const urlParams = new URLSearchParams(window.location.search);
    const plateFull = urlParams.get('plate_full');
    if (!plateFull) return;
    q('input[name="plate_full"]').value = plateFull;
    loadInputsFromQuery();

    const results = await getPrevInspection(plateFull);
    if (results && results.length > 1) {
      q('.prev-val').forEach(span => span.textContent = '');
      q('#form .title').textContent = '点検入力 (前回値あり)';
      renderPrevValues(results);
    }
  };
  renderPrev();

  // フォーム送信・戻るボタンロジック等はV9Cから継承 (省略)
  q('#form').addEventListener('submit', async (e) => { /* ... V9C ... */ });
  q('#backBtn').addEventListener('click', () => { /* ... V9C ... */ });
};

document.addEventListener('DOMContentLoaded', init);
