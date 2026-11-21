/* METEO 11 — interface mobile */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('m11.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('m11.' + k, JSON.stringify(v)); } catch (e) { /* ignoré */ } },
  };
  const S = { bul: null, rows: null, gun: store.get('gun', 'D-30'), tablesOk: false, mode: store.get('mode', 'dmk') };
  const IDS = ['nn', 'alt', 'T', 'P', 'RH', 'wdir', 'wspd', 'cloud', 'hour', 'z0', 'dH'];
  const DEF = { nn: '04', alt: '120', T: '25', P: '750', RH: '60', wdir: '3600', wspd: '5', cloud: '0.3', hour: String(new Date().getUTCHours()), z0: '0.1', dH: '0' };
  const num = (id) => parseFloat(String($('#' + id).value).replace(',', '.'));
  const fmt = (v, n = 1, plus = true) => (v == null || !isFinite(v)) ? '—' : (plus && v >= 0 ? '+' : '') + v.toFixed(n);

  // ── toast / feuille ──
  let tt;
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : ''); clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, 3200); }
  function openSheet(title, html) { $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#scrim').hidden = false; $('#sheet').hidden = false; $('#sheet').scrollTop = 0; }
  function closeSheet() { $('#scrim').hidden = true; $('#sheet').hidden = true; WX.demo(false); }
  $('#sheetClose').onclick = closeSheet; $('#scrim').onclick = closeSheet;

  // ── onglets ──
  function go(tab) {
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'p-' + tab));
    $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#pages').scrollTop = 0; S.tab = tab; store.set('tab', tab);
    if (tab === 'bul' && S.bul) drawCharts();
    if (tab === 'tab') fillTable();
    if (tab === 'corr') refreshCorrLabel();
  }
  $$('#nav button').forEach((b) => { b.onclick = () => go(b.dataset.tab); });

  // ── météo / fond ──
  function weatherFromInputs() {
    return WX.classify({ T: num('T'), RH: num('RH'), wspd: num('wspd'), wdirMil: num('wdir'), cloud: num('cloud'), hour: num('hour'), z0: num('z0') });
  }
  function applyWeather(st, instant) {
    WX.setState(st, instant);
    $('#chip').textContent = `${st.emoji} ${st.label} · ${Math.round(st.T)}° · ${Math.round(st.wind)} م/ث`;
    $('#heroT').textContent = Math.round(st.T) + '°';
    $('#heroL').textContent = st.emoji + ' ' + st.label;
    $('#heroS').textContent = `ريح ${Math.round(st.wind)} م/ث · رطوبة ${Math.round(st.RH)}%`;
  }
  function weatherFromBulletin(b) {
    const l = b.layers[0], Tc = b.dT + M11.icaoT(b.alt_station) - 273.15;
    return WX.classify({ T: Tc, RH: 50 + b.dRH, wspd: l.wspd, wdirMil: l.wdir_mil, cloud: 0.3, hour: b.hour, z0: 0.1 });
  }
  let wxT;
  function liveWeather() { clearTimeout(wxT); wxT = setTimeout(() => { try { if (IDS.every((i) => isFinite(num(i)))) applyWeather(weatherFromInputs()); } catch (e) { /* ignoré */ } }, 250); }

  // ── générateur ──
  function initForm() {
    $('#z0').innerHTML = M11.Z0_OPTIONS.map(([n, v]) => `<option value="${v}">${n} (${v.toFixed(v < 0.01 ? 3 : 2)})</option>`).join('');
    const saved = store.get('form', {});
    IDS.forEach((id) => { $('#' + id).value = saved[id] != null ? saved[id] : DEF[id]; if (id !== 'z0') $('#' + id).addEventListener('input', () => { saveForm(); liveWeather(); }); });
    $('#z0').addEventListener('change', () => { saveForm(); liveWeather(); });
    $('#hour').value = saved.hour != null ? saved.hour : DEF.hour;
  }
  function saveForm() { const o = {}; IDS.forEach((i) => { o[i] = $('#' + i).value; }); store.set('form', o); }

  const HINT = { dmk: 'الطريقة الرسمية: ΔTv ثم ΔT0 = Tv − 15.9 ، ΔH0 = H0 − 750 ، وجداول الطبقات من بطاقة النشرة التقريبية (9 طبقات حتى 4000 م).',
                 model: 'نموذج فيزيائي تقريبي للتدريب (ICAO + Monin-Obukhov) — ليس الطريقة الرسمية.' };
  function setMode(m) {
    S.mode = m; store.set('mode', m); document.body.classList.toggle('dmk', m === 'dmk');
    $$('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m)); $('#modeHint').textContent = HINT[m];
    if (m !== 'dmk') $('#dmkCard').hidden = true;
  }
  function renderSheet(s, warns) {
    const f = (v, n = 1, p = true) => (p && v >= 0 ? '+' : '') + v.toFixed(n), si = (v) => (v >= 0 ? '+' : '') + v;
    const cell = (k, v, cls) => `<div class="${cls || ''}">${k}<b>${v}</b></div>`;
    $('#dmkSheet').innerHTML = `<div class="sheet-grid">${cell('H (البارومتر)', s.H.toFixed(1))}${cell('ΔH (تصحيح الجهاز)', f(s.dH))}${cell('H0 = H + ΔH', s.H0.toFixed(1))}${cell('ΔH0 = H0 − 750', f(s.dH0) + ' ≈ ' + si(s.dH0i), 'key')}` +
      `${cell('T (°م)', s.T.toFixed(1))}${cell('ΔTv (جدول)', f(s.dTv))}${cell('Tv = T + ΔTv', s.Tv.toFixed(1))}${cell('ΔT0 = Tv − 15.9', f(s.dT0) + ' ≈ ' + si(s.dT0i), 'key')}</div>` +
      `<div class="tbl-wrap"><table class="layers"><thead><tr><th>Y (م)</th><th>Δt</th><th>αw = αw0+Δα</th><th>GG</th><th>W (م/ث)</th></tr></thead><tbody>` +
      s.layers.map((l) => `<tr><td>${l.Y}</td><td>${si(l.dt)}</td><td dir="ltr">${l.alpha}</td><td>${String(l.GG).padStart(2, '0')}</td><td>${l.W}</td></tr>`).join('') + '</tbody></table></div>' +
      (warns || []).map((w) => `<div class="warn-box" style="margin-top:10px">⚠ ${w}</div>`).join('');
    $('#dmkCard').hidden = false;
  }

  function generate() {
    const v = {}; IDS.forEach((i) => { v[i] = num(i); });
    if (S.mode === 'dmk') {
      if (!['nn', 'alt', 'T', 'P', 'dH', 'wdir', 'wspd'].every((i) => isFinite(v[i]))) return toast('يرجى التحقق من القيم المدخلة', true);
      if (v.wdir < 0 || v.wdir >= 6000) return toast('الاتجاه: 0 إلى 5999 مليام', true);
      if (v.P < 400 || v.P > 900) return toast('الضغط: 400 إلى 900 ملم', true);
      if (v.wspd < 0) return toast('سرعة الريح لا تكون سالبة', true);
      try {
        const r = M11.computeBulletinDmk({ T: v.T, H: v.P, dH: v.dH, wdirMil: v.wdir, W0: v.wspd, alt: v.alt, nn: v.nn });
        $('#bulText').value = r.text; store.set('bul', r.text); readBulletin(true); renderSheet(r.sheet, r.warns);
        applyWeather(weatherFromInputs()); go('bul'); toast(`✓ نشرة DMK التقريبية — ${r.sheet.layers.length} طبقات` + (r.warns.length ? ' (مع تحذير)' : ''));
      } catch (e) { toast('تعذّر التوليد: ' + e.message, true); }
      return;
    }
    if (IDS.some((i) => !isFinite(v[i]))) return toast('يرجى التحقق من القيم المدخلة', true);
    if (v.wdir < 0 || v.wdir > 6000) return toast('الاتجاه: 0 إلى 6000 مليام', true);
    if (v.RH < 0 || v.RH > 100) return toast('الرطوبة: 0 إلى 100 %', true);
    if (v.P < 400 || v.P > 900) return toast('الضغط: 400 إلى 900 ملم', true);
    try {
      const r = M11.computeBulletin({ T: v.T, P: v.P, RH: v.RH, wdirMil: v.wdir, wspd: v.wspd, alt: v.alt, nn: v.nn, hour: Math.trunc(v.hour), cloud: v.cloud, z0: v.z0 });
      S.rows = r.rows; $('#bulText').value = r.text; store.set('bul', r.text);
      $('#dmkCard').hidden = true; readBulletin(true); applyWeather(weatherFromInputs()); go('bul');
      toast(`✓ تم توليد النشرة — ${r.rows.length} طبقة`);
    } catch (e) { toast('تعذّر التوليد: ' + e.message, true); }
  }

  // ── nشرة ──
  function setStatus(el, cls, html) { el.className = 'status show ' + cls; el.innerHTML = html; }
  function readBulletin(silent) {
    const txt = $('#bulText').value;
    try {
      const b = M11.parseBulletin(txt); S.bul = b; store.set('bul', txt);
      setStatus($('#bulStatus'), 'ok', `✓ محطة ${b.station} | اليوم ${b.day} | UTC ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')} | ارتفاع المحطة ${b.alt_station} م | ΔP = ${fmt(b.dP, 0)} ملم | ΔT = ${fmt(b.dT, 0)}°م | ${b.layers.length} طبقة`);
      fillLayers(); $('#layersCard').hidden = false; $('#chartsCard').hidden = false;
      if (!silent) applyWeather(weatherFromBulletin(b));
      refreshCorrLabel(); requestAnimationFrame(drawCharts); return true;
    } catch (e) {
      S.bul = null; setStatus($('#bulStatus'), 'err', '✗ ' + e.message); $('#layersCard').hidden = true; $('#chartsCard').hidden = true;
      refreshCorrLabel(); if (!silent) toast('النشرة غير صالحة', true); return false;
    }
  }
  function fillLayers() {
    const rows = S.bul.layers.map((l) => `<tr><td>${l.alt}</td><td>${fmt(l.tt, 0)}</td><td dir="ltr">${l.wdir_mil} (GG=${String(l.gg).padStart(2, '0')})</td><td>${l.wspd}</td></tr>`).join('');
    $('#layers').innerHTML = `<thead><tr><th>الطبقة (م)</th><th>tt °م</th><th>اتجاه الريح (مليام)</th><th>السرعة (م/ث)</th></tr></thead><tbody>${rows}</tbody>`;
  }
  function refreshCorrLabel() {
    const el = $('#corrBul');
    if (S.bul) { const b = S.bul; setStatus(el, 'ok', `◈ النشرة المقروءة: محطة ${b.station} — اليوم ${b.day} — ${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')} — ΔP=${fmt(b.dP, 0)} ملم — ${b.layers.length} طبقة`); }
    else setStatus(el, 'warn', '⚠ لا توجد نشرة مقروءة: ولّد نشرة أو الصق نشرة حقيقية في تبويب «النشرة».');
  }
  async function shareText(text, title) {
    try {
      const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if (cap) { await cap.share({ title, text, dialogTitle: title }); return; }
      if (navigator.share) { await navigator.share({ title, text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('✓ تم النسخ إلى الحافظة'); } catch (e) { toast('تعذّر النسخ', true); }
  }

  // ── graphiques ──
  const YT = [200, 1000, 2000, 4000, 6000, 10000, 14000, 20000];
  function prep(cv) {
    const r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2); cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, r.width, r.height); return [c, r.width, r.height];
  }
  function lineChart(cv, pts, unit, color) {
    const [c, W, H] = prep(cv), L = 52, R = 18, Tp = 20, B = 34;
    const xs = pts.map((p) => p[1]); let x0 = Math.min(0, ...xs), x1 = Math.max(...xs); if (x1 - x0 < 1) x1 = x0 + 1; const pad = (x1 - x0) * 0.12; x1 += pad; if (x0 < 0) x0 -= pad;
    const X = (v) => L + (v - x0) / (x1 - x0) * (W - L - R), ymax = Math.sqrt(20000), Y = (a) => H - B - Math.sqrt(a) / ymax * (H - B - Tp);
    c.font = '11px ui-monospace,monospace'; c.fillStyle = '#9fb0cf'; c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = 1;
    YT.forEach((a) => { const y = Y(a); c.beginPath(); c.moveTo(L, y); c.lineTo(W - R, y); c.stroke(); c.textAlign = 'right'; c.fillText(a >= 1000 ? a / 1000 + 'km' : a + 'm', L - 6, y + 4); });
    const step = Math.max(1, Math.round((x1 - x0) / 5));
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) { const x = X(v); c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, H - B); c.stroke(); c.textAlign = 'center'; c.fillText(v, x, H - B + 15); }
    c.fillStyle = '#e8c26a'; c.textAlign = 'right'; c.fillText(unit, W - R, 13);
    const g = c.createLinearGradient(0, H - B, 0, Tp); g.addColorStop(0, '#7ee8b4'); g.addColorStop(1, color);
    c.strokeStyle = g; c.lineWidth = 2.6; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([a, v], i) => { const x = X(v), y = Y(a); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    pts.forEach(([a, v]) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(X(v), Y(a), 3.6, 0, 6.283); c.fill(); });
  }
  function polarChart(cv, layers) {
    const [c, W, H] = prep(cv), cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 26, vmax = Math.max(5, ...layers.map((l) => l.wspd)) * 1.1;
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.fillStyle = '#9fb0cf'; c.font = '11px ui-monospace,monospace'; c.textAlign = 'center';
    for (let i = 1; i <= 4; i++) { c.beginPath(); c.arc(cx, cy, R * i / 4, 0, 6.283); c.stroke(); c.fillText(Math.round(vmax * i / 4) + 'm/s', cx + 2, cy - R * i / 4 + 11); }
    [['0', 0], ['1500', 1500], ['3000', 3000], ['4500', 4500]].forEach(([t, m]) => {
      const a = m * Math.PI / 3000; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + R * Math.sin(a), cy - R * Math.cos(a)); c.stroke();
      c.fillStyle = '#e8c26a'; c.fillText(t, cx + (R + 15) * Math.sin(a), cy - (R + 15) * Math.cos(a) + 4);
    });
    const P = layers.map((l) => { const a = l.wdir_mil * Math.PI / 3000, r = l.wspd / vmax * R; return [cx + r * Math.sin(a), cy - r * Math.cos(a), l]; });
    c.strokeStyle = '#7ee8b4'; c.lineWidth = 2.2; c.beginPath(); P.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    P.forEach(([x, y, l]) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 3.4, 0, 6.283); c.fill(); });
    [200, 1000, 4000, 10000, 20000].forEach((a) => { const p = P.find((q) => q[2].alt === a); if (p) { c.fillStyle = '#ffd98a'; c.textAlign = 'left'; c.fillText(a >= 1000 ? a / 1000 + 'km' : a + 'm', p[0] + 6, p[1] - 5); } });
  }
  function drawCharts() {
    if (!S.bul || $('#chartsCard').hidden) return; const L = S.bul.layers;
    lineChart($('#chT'), L.map((l) => [l.alt, l.tt]), '°م Δt', '#e8c26a'); lineChart($('#chW'), L.map((l) => [l.alt, l.wspd]), 'م/ث', '#7ab8ff'); polarChart($('#chP'), L);
  }

  // ── corrections ──
  function loadGuns() {
    return Promise.all(Object.entries(M11.GUNS).map(([name, f]) => fetch('tables/' + f + '.json').then((r) => { if (!r.ok) throw new Error(f); return r.json(); }).then((j) => M11.setTable(name, j))))
      .then(() => { S.tablesOk = true; onGun(); }).catch((e) => { S.tablesOk = false; $('#rangeHint').textContent = '✗ تعذّر تحميل جداول الرمي: ' + e.message; });
  }
  function onGun(g) {
    if (g) { S.gun = g; store.set('gun', g); }
    $$('#guns button').forEach((b) => b.classList.toggle('on', b.dataset.gun === S.gun));
    if (!S.tablesOk) return; const t = M11.getTable(S.gun), cur = $('#charge').value;
    $('#charge').innerHTML = t.charges.map((c) => `<option>${c}</option>`).join(''); $('#charge').value = t.charges.includes(cur) ? cur : (t.charges.includes('3') ? '3' : t.charges[0]); onCharge();
  }
  function onCharge() {
    const r = M11.getTable(S.gun).data[$('#charge').value]; if (r) $('#rangeHint').textContent = `المدى المسموح للحشوة ${$('#charge').value}: ${r[0].Distance} إلى ${r[r.length - 1].Distance} م`;
  }
  function resultLines(r) {
    const row = r.row, f = (v, n = 1) => (v == null ? '—' : fmt(v, n)), b = S.bul, L = [];
    L.push(`المدفع ${r.gun}  |  الحشوة ${r.charge}  |  المدى ${r.dist} م  |  اتجاه الرمي ${r.azimuth} مليام`);
    L.push(`سطرا الاستكمال في الجدول: ${row._bracket[0]} م  و  ${row._bracket[1]} م`, '', '── معاملات جدول الرمي عند هذا المدى ──');
    L.push(`  Hausse = ${r.Hausse.toFixed(1)} مليام   DeltaXmill = ${row.DeltaXmill == null ? '—' : row.DeltaXmill.toFixed(1)} م/مليام`);
    L.push(`  DeltaXw = ${f(row.DeltaXw)} م (لكل 10 م/ث ريح طولية)`, `  DeltaXH = ${f(row.DeltaXH)} م (لكل 10 ملم ضغط)`, `  DeltaXT = ${f(row.DeltaXT)} م (لكل 10°م حرارة)`);
    L.push(`  DeltaZw = ${f(row.DeltaZw)} مليام (لكل 10 م/ث ريح عرضية)`, `  Ybul = ${(row.Ybul || 0).toFixed(0)} م     tc = ${(row.tc || 0).toFixed(1)} ث`, '', '── بيانات النشرة المستعملة ──');
    L.push(`  ΔP (الأرض) = ${fmt(b.dP, 0)} ملم ع ز`, `  ${r.layNote}`, `  tt = ${fmt(r.lay.tt)} °م   |   الريح: ${r.lay.wdir_mil.toFixed(0)} مليام  ${r.lay.wspd.toFixed(1)} م/ث`);
    L.push(`  Wx = ${fmt(r.Wx, 2)} م/ث (+ = ريح خلفية)    Wz = ${fmt(r.Wz, 2)} م/ث (+ = نحو اليمين)`, '', '── الحساب ──');
    L.push(`  Dw = DeltaXw × Wx / 10 = ${fmt(r.Dw)} م`, `  DH = DeltaXH × ΔP / 10 = ${fmt(r.DH)} م`, `  Dt = DeltaXT × tt / 10 = ${fmt(r.Dt)} م`);
    if (r.extra.dTch) L.push(`  Dtch = DeltaXTch × Δ حرارة الشحنة / 10 = ${fmt(r.Dtch)} م`);
    if (r.extra.nq) L.push(`  Dq = DeltaXq × إشارات = ${fmt(r.Dq)} م`);
    if (r.extra.dV0) L.push(`  Dvo = DeltaXvo × Δv0 = ${fmt(r.Dvo)} م`);
    L.push(`  Dm = مجموع التصحيحات   = ${fmt(r.Dm)} م`, `  ΔPm = DeltaZw × Wz / 10 = ${fmt(r.dPm)} مليام`);
    if (r.dHaus != null) L.push(`  ΔHausse = Dm / DeltaXmill = ${fmt(r.dHaus)} مليام`);
    if (r.HausseCorr != null) L.push(`  Hausse مصحّح = ${r.Hausse.toFixed(1)} + (${fmt(r.dHaus)}) = ${r.HausseCorr.toFixed(1)} مليام`);
    if (r.HausseCheck != null) L.push(`  تحقّق: Hausse عند (المدى + Dm = ${(r.dist + r.Dm).toFixed(0)} م) = ${r.HausseCheck.toFixed(1)} مليام`);
    return L;
  }
  function compute() {
    if (!S.bul && !readBulletin(true)) return toast('لا توجد نشرة صالحة', true);
    const dist = num('range'), az = num('az');
    if (!isFinite(dist) || !isFinite(az)) return toast('المدى واتجاه الرمي يجب أن يكونا أرقاماً', true);
    if (az < 0 || az > 6000) return toast('اتجاه الرمي: من 0 إلى 6000 مليام', true);
    store.set('corr', { range: $('#range').value, az: $('#az').value, charge: $('#charge').value, method: $('#method').value });
    try {
      const r = M11.computeCorrections(S.gun, $('#charge').value, dist, az, S.bul, $('#method').value, { dTch: num('dTch') || 0, nq: num('nq') || 0, dV0: num('dV0') || 0 });
      const kp = (t, v, u) => `<div class="kpi"><small>${t}</small><strong>${v}</strong><em>${u}</em></div>`;
      const txt = resultLines(r).join('\n');
      openSheet('◈ نتائج التصحيحات الجوية',
        (r.warnings.length ? r.warnings.map((w) => `<div class="warn-box">⚠ ${w}</div>`).join('') : '') +
        `<div class="kpis">${kp('Dm — تصحيح المدى', fmt(r.Dm), 'م')}${kp('ΔPm — تصحيح الاتجاه', fmt(r.dPm), 'مليام')}` +
        `${kp('Hausse مصحّح', r.HausseCorr == null ? '—' : r.HausseCorr.toFixed(0), 'مليام')}${kp('ΔHausse', r.dHaus == null ? '—' : fmt(r.dHaus), 'مليام')}</div>` +
        `<pre class="res" dir="rtl">${txt.replace(/</g, '&lt;')}</pre><button class="btn ghost" id="shRes">📤 مشاركة / نسخ النتيجة</button>`);
      $('#shRes').onclick = () => shareText(txt, 'تصحيحات Météo 11');
    } catch (e) { toast('تعذّر الحساب: ' + e.message, true); }
  }

  // ── tables ──
  const COLS = ['Distance', 'Hausse', 'DeltaXmill', 'DeltaXw', 'DeltaXH', 'DeltaXT', 'DeltaXTch', 'DeltaXq', 'DeltaXvo', 'DeltaZw', 'Z', 'Ybul', 'Ys', 'tc', 'tetta_c', 'Vc', 'F', 'eh', 'ep', 'ed'];
  function initTables() { $('#tGun').innerHTML = Object.keys(M11.GUNS).map((g) => `<option>${g}</option>`).join('') + '<option value="DMK">جداول DMK (النشرة التقريبية)</option>'; $('#tGun').value = S.gun; $('#tGun').onchange = () => { if ($('#tGun').value !== 'DMK') fillCharges(); fillTable(); }; $('#tCharge').onchange = fillTable; }
  function fillCharges() { if (!S.tablesOk) return; const t = M11.getTable($('#tGun').value); $('#tCharge').innerHTML = t.charges.map((c) => `<option>${c}</option>`).join(''); }
  function renderDmkTables() {
    const D = M11.DMK, U = D.uncertain, un = (arr, a, b) => arr.some((x) => x[0] === a && x[1] === b);
    const th = (a) => a.map((x) => `<th>${x}</th>`).join('');
    const tv = `<div class="tbl-wrap"><table class="data"><thead><tr><th>T °م</th>${th(D.tv.map((r) => r[0]))}</tr></thead><tbody><tr><td>ΔTv</td>${D.tv.map((r) => `<td class="${U.tv.includes(r[0]) ? 'unc' : ''}">+${r[1]}</td>`).join('')}</tr></tbody></table></div>`;
    const dkeys = Object.keys(D.dt_neg).map(Number).sort((a, b) => a - b);
    const dt = `<div class="tbl-wrap"><table class="data"><thead><tr><th>|ΔT0| (سالب)</th>${th(D.layers)}</tr></thead><tbody>${dkeys.map((k) => `<tr><td>−${k}</td>${D.dt_neg[k].map((v, i) => `<td class="${un(U.dt_neg, k, D.layers[i]) ? 'unc' : ''}">−${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="hint">للقيم الموجبة: Δt = +ΔT0 في كل الطبقات (السطر السفلي من الجدول).</p>`;
    const ws = Array.from({ length: 14 }, (_, i) => 15 - i);
    const w = `<div class="tbl-wrap"><table class="data"><thead><tr><th>Y \\ W0</th>${th(ws)}</tr></thead><tbody>${D.layers.map((y, yi) => `<tr><td>${y}</td>${ws.map((x) => `<td class="${un(U.w, y, x) ? 'unc' : ''}">${D.w[x][yi]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const da = `<div class="tbl-wrap"><table class="data"><thead><tr><th>Y</th>${th(D.layers)}</tr></thead><tbody><tr><td>Δαw (مليام)</td>${D.dalpha.map((v) => `<td>${v}</td>`).join('')}</tr></tbody></table></div>`;
    $('#dmkTbls').innerHTML = `<div class="dmk-sec">ΔTv — تصحيح الحرارة التقريبية</div>${tv}<div class="dmk-sec">Δt — تغير الحرارة في الطبقات</div>${dt}<div class="dmk-sec">W — سرعة الريح في الطبقات</div>${w}<div class="dmk-sec">Δαw — دوران الريح مع الارتفاع</div>${da}`;
    setStatus($('#tInfo'), 'warn', 'القيم البرتقالية قُرئت بصعوبة من صورة البطاقة (مقدَّرة أو مشكوك فيها) — صحّحها من الكتاب في ملف www/js/dmk-data.js.');
  }
  function fillTable() {
    const isDmk = $('#tGun').value === 'DMK';
    $('#dataWrap').hidden = isDmk; $('#dmkTbls').hidden = !isDmk; $('#tCharge').closest('label').style.visibility = isDmk ? 'hidden' : 'visible';
    if (isDmk) return renderDmkTables();
    if (!S.tablesOk) return; if (!$('#tCharge').options.length) fillCharges();
    const t = M11.getTable($('#tGun').value), recs = t.data[$('#tCharge').value] || [], cols = COLS.filter((c) => t.columns.includes(c)), sus = recs.filter((r) => r._suspect).length;
    const cell = (v) => (v == null ? '—' : (Number.isInteger(v) ? v : +v.toFixed(2)));
    $('#dataTbl').innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${recs.map((r) => `<tr class="${r._suspect ? 'sus' : ''}">${cols.map((c) => `<td>${cell(r[c])}</td>`).join('')}</tr>`).join('')}</tbody>`;
    setStatus($('#tInfo'), sus ? 'warn' : 'ok', `${recs.length} سطر — المدى ${recs[0].Distance} إلى ${recs[recs.length - 1].Distance} م — ${sus ? sus + ' سطر مشبوه' : 'لا سطور مشبوهة'}`);
  }

  // ── infos / animation ──
  function showInfo() {
    openSheet('INFOS — MÉTÉO 11', `<div class="about"><div class="who">تطوير و إنجاز / DÉVELOPPÉ PAR<b>CDT BENACER WALID</b></div>
      <p>◈ يحسب التصحيحات الجوية للرمي من النشرة الجوية المتوسطة (Météo 11) لمدفعية الميدان: D-30 و2C1 و2C3.</p>
      <p>◈ يقرأ نشرة حقيقية (إدخال يدوي أو ملف TXT) ويستخرج معاملات التصحيح من جداول الرمي عند المدى المطلوب بالاستكمال بين سطرين.</p>
      <p>◈ يحسب Dm (تصحيح المدى) وΔPm (تصحيح الاتجاه) والهوسّ المصحَّح.</p>
      <p>◈ مولّد النشرة التقريبية بطريقة DMK الرسمية (جداول البطاقة) ، ونموذج فيزيائي تدريبي بديل. الخلفية المتحركة تعبّر عن الطقس المُدخَل: حرارة، رطوبة، ريح، سحب، ساعة.</p>
      <p>◈ يعمل دون اتصال بالإنترنت.</p>
      <button class="btn ghost" id="bDemo">🎞 معاينة خلفيات الطقس</button>
      <small>STANAG 4082 | للأغراض التدريبية فقط</small></div>`);
    $('#bDemo').onclick = () => {
      $('#scrim').hidden = true; $('#sheet').hidden = true;
      WX.demo(true, (name) => { if (name == null) { applyWeather(S.bul && !$('#p-gen').classList.contains('active') ? weatherFromBulletin(S.bul) : weatherFromInputs()); return; } toast(name); });
      const stop = () => { WX.demo(false); document.removeEventListener('click', stop, true); }; setTimeout(() => document.addEventListener('click', stop, true), 400);
    };
  }
  let fxOn = store.get('fx', true);
  function setFx(on) { fxOn = on; store.set('fx', on); WX.setEnabled(on); $('#btnFx').classList.toggle('off', !on); }

  // ── init ──
  function init() {
    initForm(); setMode(S.mode); $$('#seg button').forEach((b) => { b.onclick = () => setMode(b.dataset.mode); });
    $('#method').innerHTML = M11.LAYER_METHODS.map(([n, v]) => `<option value="${v}">${n}</option>`).join('');
    const cs = store.get('corr', { range: '8000', az: '0', method: 'interp' }); $('#range').value = cs.range || '8000'; $('#az').value = cs.az || '0'; $('#method').value = cs.method || 'interp';
    $$('#guns button').forEach((b) => { b.onclick = () => onGun(b.dataset.gun); });
    $('#charge').onchange = onCharge; $('#btnGen').onclick = generate; $('#btnCorr').onclick = compute;
    $('#btnRead').onclick = () => readBulletin(false); $('#btnInfo').onclick = showInfo; $('#btnFx').onclick = () => setFx(!fxOn);
    $('#btnClearGen').onclick = () => { IDS.forEach((i) => { $('#' + i).value = DEF[i]; }); saveForm(); liveWeather(); toast('تم المسح'); };
    $('#btnClearBul').onclick = () => { $('#bulText').value = ''; S.bul = null; store.set('bul', ''); $('#bulStatus').className = 'status'; $('#layersCard').hidden = true; $('#chartsCard').hidden = true; refreshCorrLabel(); };
    $('#btnOpen').onclick = () => $('#file').click();
    $('#file').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('#bulText').value = rd.result; readBulletin(false); }; rd.readAsText(f, 'utf-8'); e.target.value = ''; };
    const sh = () => { const t = $('#bulText').value.trim(); if (!t) return toast('لا توجد نشرة للمشاركة', true); shareText(t, 'نشرة Météo 11'); };
    $('#btnShare').onclick = sh; $('#btnSaveGen').onclick = () => { if (!$('#bulText').value.trim()) generate(); sh(); };
    const saved = store.get('bul', ''); if (saved) { $('#bulText').value = saved; readBulletin(true); }
    WX.init($('#wx')); setFx(fxOn); applyWeather(S.bul ? weatherFromBulletin(S.bul) : weatherFromInputs(), true);
    initTables(); loadGuns(); window.addEventListener('resize', () => { if (S.tab === 'bul') drawCharts(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) WX.setEnabled(fxOn); });
    // bouton retour Android
    const A = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (A && A.addListener) A.addListener('backButton', () => { if (!$('#sheet').hidden) closeSheet(); else if (S.tab && S.tab !== 'gen') go('gen'); else A.exitApp(); });
    go(store.get('tab', 'gen') === 'tab' ? 'gen' : store.get('tab', 'gen'));
  }
  document.addEventListener('DOMContentLoaded', init);
})();
