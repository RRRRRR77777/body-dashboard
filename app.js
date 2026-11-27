/* 體態管理師・週報儀表板（LINE MINI App）
 * 流程：LIFF 登入 → 取得 ID Token → POST 給 Apps Script（?api=dash）→ Apps Script 向 LINE 驗證是本人才回傳彙總數字 → 畫圖
 * 網頁本身不存任何資料、不放任何金鑰。網址加 ?demo=1 會用假資料展示（不連線）。
 */
(function () {
  const CFG = window.DASH_CONFIG || {};
  const $app = document.getElementById('app');
  const qs = new URLSearchParams(location.search);
  const DEMO = qs.get('demo') === '1';
  const WD = ['一', '二', '三', '四', '五', '六', '日'];
  const COL = { g: 'var(--g)', y: 'var(--y)', r: 'var(--r)' };
  const HEX = { g: '#22C55E', y: '#F5B83D', r: '#F0616D' };
  const TXT = { g: '達標', y: '注意', r: '落後' };
  let idToken = '', current = '';

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('zh-TW');
  const md = d => d.slice(5).replace('-', '/');
  const addDays = (ymd, n) => { const t = new Date(ymd + 'T12:00:00+08:00'); t.setTime(t.getTime() + n * 864e5); return t.toISOString().slice(0, 10); };

  function showError(title, msg) { $app.innerHTML = '<div class="err"><b>' + esc(title) + '</b>' + esc(msg) + '</div>'; }

  /** 燈號：band＝在目標 ±10% 綠、±20% 黃；min＝越多越好；max＝越少越好 */
  function rag(v, g, mode) {
    const r = g ? v / g : 0;
    if (mode === 'min') return r >= 0.95 ? 'g' : r >= 0.8 ? 'y' : 'r';
    if (mode === 'max') return r <= 1.05 ? 'g' : r <= 1.25 ? 'y' : 'r';
    return Math.abs(r - 1) <= 0.1 ? 'g' : Math.abs(r - 1) <= 0.2 ? 'y' : 'r';
  }

  function kpi(name, v, g, unit, mode, prev) {
    const s = rag(v, g, mode), pct = Math.min(v / g, 1.4) / 1.4 * 100;
    const d = prev ? v - prev : null;
    return '<div class="kpi"><div class="kh"><span>' + name + '</span><span class="chip" style="background:' + HEX[s] + '22;color:' + COL[s] + '">● ' + TXT[s] + '</span></div>' +
      '<div class="kv">' + fmt(v) + '<small> / ' + fmt(g) + ' ' + unit + '</small></div>' +
      '<div class="bar"><i style="width:' + pct + '%;background:' + COL[s] + '"></i><b style="left:' + (100 / 1.4) + '%"></b></div>' +
      (d !== null ? '<div class="delta">比上週 ' + (d >= 0 ? '＋' : '－') + fmt(Math.abs(d)) + ' ' + unit + '</div>' : '') + '</div>';
  }

  function macroChart(D) {
    const bw = 34, gap = 12, H = 150, top = 20, max = Math.max(2200, ...D.days.map(x => x.kcal)) * 1.05;
    let s = '';
    D.days.forEach((x, i) => {
      const cx = 24 + i * (bw + gap);
      let y = H;
      [['pro', 4, 'var(--p)'], ['fat', 9, 'var(--f)'], ['carb', 4, 'var(--c)']].forEach(([k, m, col]) => {
        const h = x[k] * m / max * H; y -= h;
        s += '<rect x="' + cx + '" y="' + (top + y) + '" width="' + bw + '" height="' + Math.max(h, 0) + '" fill="' + col + '" rx="2"/>';
      });
      s += '<text x="' + (cx + bw / 2) + '" y="' + (top + H + 16) + '" text-anchor="middle">' + md(x.d) + '</text>' +
        '<text x="' + (cx + bw / 2) + '" y="' + (top + H + 30) + '" text-anchor="middle">週' + WD[i] + '</text>';
      if (!x.n) s += '<text x="' + (cx + bw / 2) + '" y="' + (top + H - 6) + '" text-anchor="middle">' + (x.d > D.today ? '' : '未記') + '</text>';
    });
    const gy = top + H - D.goals.kcal / max * H;
    s += '<line x1="16" x2="344" y1="' + gy + '" y2="' + gy + '" stroke="#94A3B8" stroke-dasharray="4 4"/>' +
      '<text x="344" y="' + (gy - 5) + '" text-anchor="end">目標 ' + fmt(D.goals.kcal) + '</text>';
    return '<svg viewBox="0 0 360 214">' + s + '</svg>';
  }

  function weightChart(D) {
    const w = D.weights;
    if (w.length < 2) return '<div class="row"><span>體重紀錄不足兩筆，還畫不出趨勢</span></div>';
    const vals = w.map(x => x[1]), lo = Math.min(...vals) - 0.3, hi = Math.max(...vals) + 0.3;
    const X = i => 20 + i * (320 / (w.length - 1)), Y = v => 16 + (hi - v) / (hi - lo) * 110;
    const ma = w.map((x, i) => { const s = w.slice(Math.max(0, i - 2), i + 1); return s.reduce((a, b) => a + b[1], 0) / s.length; });
    let s = '<polyline fill="none" stroke="#60A5FA" stroke-width="1.5" stroke-opacity=".5" points="' + w.map((x, i) => X(i) + ',' + Y(x[1])).join(' ') + '"/>' +
      '<polyline fill="none" stroke="#34D399" stroke-width="3" points="' + ma.map((v, i) => X(i) + ',' + Y(v)).join(' ') + '"/>';
    const step = Math.max(1, Math.ceil(w.length / 5));
    w.forEach((x, i) => {
      s += '<circle cx="' + X(i) + '" cy="' + Y(x[1]) + '" r="3" fill="#60A5FA"/>';
      if (i % step === 0 || i === w.length - 1) s += '<text x="' + X(i) + '" y="146" text-anchor="middle">' + md(x[0]) + '</text>';
    });
    const last = w[w.length - 1], start = D.goals.startWeight;
    return '<svg viewBox="0 0 360 156">' + s + '</svg>' +
      (start ? '<div class="row"><span>起始體重</span><b>' + start + ' 公斤</b></div>' : '') +
      '<div class="row"><span>最新 ' + md(last[0]) + '</span><b>' + last[1] + ' 公斤' + (start ? '（' + (last[1] - start >= 0 ? '＋' : '－') + Math.abs(last[1] - start).toFixed(2) + '）' : '') + '</b></div>';
  }

  function heatmap(D) {
    const g = D.goals, cell = s => '<div class="cell"' + (s ? ' style="background:' + COL[s] + '"' : '') + '></div>';
    const line = (name, f) => '<span>' + name + '</span>' + D.days.map(x => cell(x.n ? f(x) : null)).join('');
    return '<div class="hm"><span></span>' + WD.map(w => '<span>' + w + '</span>').join('') +
      line('熱量', x => rag(x.kcal, g.kcal, 'band')) + line('蛋白質', x => rag(x.pro, g.pro, 'min')) + line('脂肪', x => rag(x.fat, g.fat, 'max')) + '</div>';
  }

  /** 三餐回報：有記錄＝綠，已過時間沒記錄＝橘色斜線「未回報」，還沒到＝灰 */
  const MEAL3 = [['早餐', 10.5], ['午餐', 14.5], ['晚餐', 22]];
  function mealGrid(D) {
    const t = new Date(Date.now() + 8 * 3600e3), hour = t.getUTCHours() + t.getUTCMinutes() / 60;
    let miss = 0;
    const cell = (x, m, cut) => {
      const k = x.meals[m];
      if (k) return '<div class="mc ok">' + fmt(k) + '</div>';
      if (x.d > D.today || (x.d === D.today && hour < cut)) return '<div class="mc"></div>';
      miss++;
      return '<div class="mc miss">未回報</div>';
    };
    const rows = MEAL3.map(([m, cut]) => '<span>' + m + '</span>' + D.days.map(x => cell(x, m, cut)).join('')).join('');
    return { miss: miss, html: '<div class="hm mg"><span></span>' + WD.map(w => '<span>' + w + '</span>').join('') + rows + '</div>' +
      '<div class="leg"><span><i style="background:var(--g)"></i>有記錄（大卡）</span><span><i class="miss"></i>未回報</span><span><i style="background:var(--line)"></i>還沒到</span></div>' };
  }

  function mealsCard(D) {
    const sum = {}, cnt = {};
    D.days.forEach(x => Object.keys(x.meals).forEach(m => { sum[m] = (sum[m] || 0) + x.meals[m]; cnt[m] = (cnt[m] || 0) + 1; }));
    const list = Object.keys(sum).map(m => ({ m: m, avg: sum[m] / cnt[m], n: cnt[m] })).sort((a, b) => b.avg - a.avg);
    if (!list.length) return '<div class="row"><span>本週還沒有飲食紀錄</span></div>';
    const top = D.topMeals && D.topMeals[0];
    return (top ? '<div class="row"><span>超標的日子吃最多</span><b>' + esc(top.meal) + ' ' + top.n + ' 次</b></div>' : '') +
      list.map((x, i) => '<div class="row"><span>' + (i ? '' : '🥇 ') + esc(x.m) + '</span><b>' + x.n + ' 次・平均 ' + fmt(x.avg) + ' 大卡</b></div>').join('');
  }

  function actions(D) {
    const a = D.avg, g = D.goals, out = [];
    if (D.logged < D.days.filter(x => x.d <= D.today).length) out.push('有 ' + D.days.filter(x => x.d <= D.today && !x.n).length + ' 天沒有紀錄，平均值會偏低；記得每餐都記');
    const mm = mealGrid(D).miss;
    if (mm) out.push('有 ' + mm + ' 餐未回報，補記時在 LINE 打「昨天 晚餐」之類的字再傳照片或文字');
    if (a.fat > g.fat * 1.1) out.push('脂肪平均 ' + fmt(a.fat) + ' 克（目標 ' + g.fat + '）：外食先選清湯、少炸物，記錄時用「調整油脂」修正');
    if (a.pro < g.pro * 0.9) out.push('蛋白質平均 ' + fmt(a.pro) + ' 克（目標 ' + g.pro + '）：早餐加一份豆漿或蛋');
    if (D.topMeals && D.topMeals.length && D.topMeals[0].n >= 2) out.push('超標的日子多半是' + D.topMeals[0].meal + '吃最多，先從這一餐調整');
    if (!out.length) out.push('熱量和三大營養素都在目標附近，維持下去');
    return out.map(t => '<div class="act">' + esc(t) + '</div>').join('');
  }

  function render(D) {
    current = D.end;
    const a = D.avg, g = D.goals, past = D.days.filter(x => x.d <= D.today).length || 7;
    const ss = [rag(a.kcal, g.kcal, 'band'), rag(a.pro, g.pro, 'min'), rag(a.fat, g.fat, 'max'), rag(D.logged, past, 'min')];
    const overall = ss.includes('r') ? 'r' : ss.includes('y') ? 'y' : 'g';
    const notes = [];
    if (D.logged < past) notes.push('紀錄不完整');
    if (ss[1] !== 'g') notes.push('蛋白質偏低');
    if (ss[2] !== 'g') notes.push('脂肪超標');
    if (ss[0] !== 'g') notes.push(a.kcal > g.kcal ? '熱量偏高' : '熱量偏低');
    const thisWeek = D.end >= D.today, mg = mealGrid(D);
    $app.innerHTML =
      '<div class="nav"><button id="prev">‹ 上一週</button><span>' + (DEMO ? '展示模式（假資料）' : '體態管理師・週報') + '</span><button id="next"' + (thisWeek ? ' disabled' : '') + '>下一週 ›</button></div>' +
      '<div class="sub">' + md(D.start) + '（一）～ ' + md(D.end) + '（日）' + (thisWeek ? '・本週進行中' : '') + '</div><h1>本週進度報告</h1>' +
      '<div class="status"><div><small>整體狀態</small><b>' + esc(notes.length ? notes.join('・') : '各項指標都在目標內') + '</b></div><span class="pill" style="background:' + HEX[overall] + ';color:' + (overall === 'y' ? '#1F2937' : '#fff') + '">' + TXT[overall] + '</span></div>' +
      '<div class="grid">' + kpi('平均熱量', a.kcal, g.kcal, '大卡', 'band', D.prevLogged ? D.prevAvg.kcal : null) + kpi('平均蛋白質', a.pro, g.pro, '克', 'min', D.prevLogged ? D.prevAvg.pro : null) +
      kpi('平均脂肪', a.fat, g.fat, '克', 'max', D.prevLogged ? D.prevAvg.fat : null) + kpi('紀錄天數', D.logged, past, '天', 'min', null) + '</div>' +
      '<div class="card"><div class="ct">每日熱量組成<span>蛋白質、碳水 4 大卡／克，脂肪 9 大卡／克</span></div>' + macroChart(D) +
      '<div class="leg"><span><i style="background:var(--p)"></i>蛋白質</span><span><i style="background:var(--f)"></i>脂肪</span><span><i style="background:var(--c)"></i>碳水</span><span>－－ 目標</span></div></div>' +
      '<div class="card"><div class="ct">體重趨勢<span>近 4 週・綠線＝3 筆移動平均</span></div>' + weightChart(D) + '</div>' +
      '<div class="card"><div class="ct">達標燈號<span>綠 達標・黃 注意・紅 落後</span></div>' + heatmap(D) + '</div>' +
      '<div class="card"><div class="ct">三餐回報<span>' + (mg.miss ? '本週有 ' + mg.miss + ' 餐未回報' : '三餐都有回報') + '</span></div>' + mg.html + '</div>' +
      '<div class="card"><div class="ct">各餐熱量<span>有紀錄的日子</span></div>' + mealsCard(D) + '</div>' +
      '<div class="card"><div class="ct">下週行動項目<span>依本週數據自動產生</span></div>' + actions(D) + '</div>' +
      '<div class="card"><div class="ct">運動</div><div class="row"><span>運動</span><b>' + D.exer.days + ' 天・' + D.exer.min + ' 分鐘</b></div><div class="row"><span>重訓</span><b>' + D.lift.days + ' 天</b></div>' +
      (D.lift.prs.length ? '<div class="row"><span>進步</span><b>' + esc(D.lift.prs.join('、')) + '</b></div>' : '') + '</div>' +
      '<div class="foot">資料來源：飲食控制紀錄（Google 試算表）・目標 熱量 ' + fmt(g.kcal) + ' 大卡、蛋白質 ' + g.pro + ' 克、脂肪 ' + g.fat + ' 克</div>';
    document.getElementById('prev').onclick = () => load(addDays(D.start, -1));
    document.getElementById('next').onclick = () => load(addDays(D.end, 7));
    window.scrollTo(0, 0);
  }

  async function load(end) {
    $app.innerHTML = '<div class="loading">讀取中…</div>';
    if (DEMO) return render(demoData(end));
    try {
      const res = await fetch(CFG.API_URL + '?api=dash', {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 用純文字避免瀏覽器先送 OPTIONS 預檢
        body: JSON.stringify({ idToken: idToken, end: end || '' })
      });
      const D = await res.json();
      if (!D.ok) {
        const m = { not_owner: '這個儀表板只開放給機器人擁有者。', invalid_token: '登入已過期，請關閉後重新打開。', not_ready: '機器人還沒完成儀表板設定（DASH_CHANNEL_ID）。', too_many: '讀取太頻繁，請稍後再試。' };
        return showError('沒辦法讀取資料', m[D.err] || '伺服器發生錯誤，請稍後再試。');
      }
      render(D);
    } catch (e) { showError('連線失敗', '請確認網路後重新打開。'); }
  }

  /** 展示用假資料（不是任何人的真實紀錄） */
  function demoData(end) {
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const ref = end || today, wd = (new Date(ref + 'T12:00:00+08:00').getUTCDay() + 6) % 7, start = addDays(ref, -wd);
    const plan = [[420, 650, 600], [380, 720, 0], [450, 600, 820], [0, 0, 0], [400, 880, 610], [350, 560, 700], [480, 620, 520]];
    const days = plan.map((p, i) => {
      const d = addDays(start, i), k = p[0] + p[1] + p[2];
      return { d: d, kcal: k, pro: k * 0.065, fat: k * 0.032, carb: k * 0.12, n: k ? 6 : 0, meals: Object.fromEntries(['早餐', '午餐', '晚餐'].map((m, j) => [m, p[j]]).filter(e => e[1])) };
    });
    const logged = days.filter(x => x.n), avg = k => logged.reduce((s, x) => s + x[k], 0) / logged.length;
    return {
      ok: true, start: start, end: addDays(start, 6), today: '9999-12-31', goals: { kcal: 1800, carb: 225, fat: 40, pro: 135, startWeight: 75 },
      days: days, avg: { kcal: avg('kcal'), pro: avg('pro'), fat: avg('fat'), carb: avg('carb') }, prevAvg: { kcal: 1720, pro: 105, fat: 58, carb: 200 },
      logged: logged.length, prevLogged: 7, kcalOk: 3, proOk: 1, overDays: 2, topMeals: [{ meal: '午餐', n: 2, avg: 880 }],
      weights: [...Array(10)].map((_, i) => [addDays(start, i * 3 - 21), +(73.6 - i * 0.12 + (i % 3) * 0.2).toFixed(2)]),
      exer: { days: 4, min: 260 }, lift: { days: 3, prs: ['高位下拉 30→32.5 公斤'] }
    };
  }

  async function start() {
    if (DEMO) return load('');
    if (!CFG.LIFF_ID || !CFG.API_URL) return showError('還沒設定', 'config.js 的 LIFF_ID 和 API_URL 還沒填。');
    try {
      await liff.init({ liffId: CFG.LIFF_ID });
      if (!liff.isLoggedIn()) return liff.login();
      idToken = liff.getIDToken();
      if (!idToken) return showError('沒有取得登入資訊', 'LIFF 設定的 Scope 需要勾選 openid。');
      load(new URLSearchParams(location.search).get('end') || ''); // LIFF 轉址後才讀網址參數
    } catch (e) { showError('LINE 初始化失敗', String(e && e.message || e)); }
  }
  start();
})();
