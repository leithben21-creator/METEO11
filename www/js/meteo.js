/* METEO 11 — moteur de calcul (port JavaScript du moteur Python de CDT BENACER WALID)
   Générateur de bulletin (ICAO + Monin-Obukhov + spirale d'Ekman), lecteur de Météo 11,
   choix de couche et corrections de tir à partir des tables D-30 / 2C1 / 2C3.            */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.M11 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const T0_K = 288.15, P0_Pa = 101325.0, L_RATE = 0.0065, G = 9.80665, Rd = 287.058, Rv = 461.495,
        Cp = 1005.7, VON_K = 0.4, Z_WIND = 10.0, TROPO_TOP = 11000.0,
        DEG_TO_MIL = 6400.0 / 360.0, DEG_TO_MIL6 = 6000.0 / 360.0;
  const STD_T_C = 15.0, STD_P_MMH = 750.0, STD_RH = 50.0;
  const LEVELS = [0, 200, 500, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 14000, 16000, 20000];
  const GUNS = { 'D-30': 'D30', '2C1': '2C1', '2C3': '2C3' };
  const Z0_OPTIONS = [['صحراء', 0.005], ['سهل', 0.03], ['حقول', 0.10], ['أشجار', 0.25], ['غابة', 0.75], ['حضري', 1.50], ['جبال', 2.00]];
  const LAYER_METHODS = [['استكمال خطي بين الطبقتين', 'interp'], ['الطبقة العليا الأقرب', 'upper'], ['الطبقة الأقرب', 'nearest']];

  // arrondis identiques à Python (moitié vers le pair)
  const pyRound = (x) => { const r = Math.round(x); return (Math.abs(x % 1) === 0.5) ? 2 * Math.round(x / 2) : r; };
  const pyRoundN = (x, n) => { const m = Math.pow(10, n); return pyRound(x * m) / m; };
  const pad = (s, n, ch = ' ') => String(s).padStart(n, ch);
  const z2 = (n) => String(n).padStart(2, '0');
  const sgn = (x, n) => (x >= 0 ? '+' : '-') + Math.abs(x).toFixed(n);

  // atmosphère
  const icaoT = (h) => (h <= TROPO_TOP ? T0_K - L_RATE * h : 216.65);
  const icaoP = (h) => {
    if (h <= TROPO_TOP) return P0_Pa * Math.pow(icaoT(h) / T0_K, G / (L_RATE * Rd));
    return icaoP(TROPO_TOP) * Math.exp(-G * (h - TROPO_TOP) / (Rd * 216.65));
  };
  const icaoRho = (h) => icaoP(h) / (Rd * icaoT(h));
  const satVap = (T) => (T >= 0
    ? 611.21 * Math.exp((18.678 - T / 234.5) * (T / (257.14 + T)))
    : 611.15 * Math.exp((23.036 - T / 333.7) * (T / (279.82 + T))));
  const obukhovL = (Tk, us, H) => {
    const rho = P0_Pa / (Rd * Tk);
    return Math.abs(H) < 1e-6 ? Infinity : -(rho * Cp * Tk * Math.pow(us, 3)) / (VON_K * G * H);
  };
  const psiM = (z) => {
    if (z >= 0) { const a = 1.0, b = 0.667, c = 5.0, d = 0.35; return -(a * z + b * (z - c / d) * Math.exp(-d * z) + b * c / d); }
    const x = Math.pow(1.0 - 16.0 * z, 0.25);
    return 2 * Math.log((1 + x) / 2) + Math.log((1 + x * x) / 2) - 2 * Math.atan(x) + Math.PI / 2;
  };
  const frictionVel = (U, z, z0) => (U <= 0 ? 0.01 : VON_K * U / Math.log(z / z0));
  const heatFlux = (Tc, hour, cloud) => {
    const s = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
    const Q = 600 * s * (1 - 0.7 * cloud);
    return Q > 50 ? 0.1 * Q : -20.0;
  };

  class WindProfile {
    constructor(Uobs, dirDeg, zObs, z0, L) {
      this.Uobs = Uobs; this.dir = ((dirDeg % 360) + 360) % 360; this.z0 = Math.max(z0, 0.001); this.L = L;
      this.us = frictionVel(Uobs, zObs, z0);
      const f = 2 * 7.2921e-5 * Math.sin(30 * Math.PI / 180);
      this.zi = Math.max(Math.min(0.2 * this.us / Math.max(f, 1e-5), 3000), 500);
    }
    speedAt(z) {
      z = Math.max(z, this.z0 * 1.1);
      let U;
      if (z <= this.zi) {
        const useL = this.L && Math.abs(this.L) < 1e6;
        const pz = useL ? psiM(z / this.L) : 0, pz0 = useL ? psiM(this.z0 / this.L) : 0;
        const ln = Math.log(z / this.z0) - pz + pz0;
        U = (this.us / VON_K) * Math.max(ln, 0.1);
        U = Math.min(U, 60.0);                                          // codage WW sur 2 chiffres
        if (this.Uobs < 2.5) U = Math.min(U, Math.max(this.Uobs * 3.5, 3.0));   // vent calme/faible : le profil divergeait
      } else {
        const alpha = (this.L === null || Math.abs(this.L) > 1000) ? 0.143 : (this.L > 0 ? 0.2 : 0.1);
        U = this.speedAt(this.zi) * Math.pow(z / this.zi, alpha);
        U = Math.min(U, this.Uobs * 3.5);
      }
      return Math.max(U, 0);
    }
    dirAt(z) {
      if (z <= 0) return this.dir;
      const frac = z < this.zi ? Math.log(Math.max(z, this.z0) / this.z0) / Math.log(this.zi / this.z0) : 1.0;
      return (this.dir + 25.0 * Math.min(frac, 1.0)) % 360;
    }
  }

  function tempProfile(Tc, alt) {
    const dT0 = (Tc + 273.15) - icaoT(alt);
    return (h) => {
      const Tstd = icaoT(alt + h);
      const delta = h < 1500 ? dT0 * (1 - h / 1500) : dT0 * Math.exp(-(h - 1500) / 5000);
      return Tstd + delta;
    };
  }
  const density = (Tk, P, RH) => {
    const e = Math.min((RH / 100) * satVap(Tk - 273.15), P * 0.5);
    return (P - e) / (Rd * Tk) + e / (Rv * Tk);
  };
  const pressureAt = (Ps, Tf, h) => {
    const steps = Math.max(Math.trunc(h / 50), 1), dz = h / steps;
    let P = Ps;
    for (let i = 0; i < steps; i++) { const T = Tf((i + 0.5) * dz); P -= (P / (Rd * T)) * G * dz; P = Math.max(P, 1.0); }
    return P;
  };

  class Generator {
    constructor(o) {
      this.Tc = o.T; this.P = o.PhPa * 100; this.RH = o.RH; this.wdir = ((o.wdirDeg % 360) + 360) % 360;
      this.wspd = Math.max(o.wspd, 0); this.alt = o.alt; this.z0 = o.z0; this.cloud = o.cloud;
      this.hour = ((Math.trunc(o.hour) % 24) + 24) % 24;
      const H = heatFlux(this.Tc, this.hour, this.cloud), us = frictionVel(this.wspd, Z_WIND, this.z0), Tk = this.Tc + 273.15;
      this.L = (Math.abs(H) < 0.5 || us < 0.01) ? Infinity : obukhovL(Tk, us, H);
      this.stability = (Math.abs(this.L) > 500 || !isFinite(this.L)) ? 'NEUTRE' : (this.L > 0 ? 'STABLE' : 'INSTABLE');
      this.wind = new WindProfile(this.wspd, this.wdir, Z_WIND, this.z0, isFinite(this.L) ? this.L : null);
      this.Tf = tempProfile(this.Tc, this.alt);
    }
    layer(h) {
      const hm = this.alt + h, Tk = this.Tf(h), Ts = icaoT(hm), P = pressureAt(this.P, this.Tf, h);
      const RHh = Math.max(this.RH * Math.exp(-h / 2500), 5.0);
      const U = this.wind.speedAt(h), D = this.wind.dirAt(h);
      return { h, h_msl: hm, T_actual_c: pyRoundN(Tk - 273.15, 2), T_std_c: pyRoundN(Ts - 273.15, 2),
               delta_T: pyRoundN(Tk - Ts, 2), P_actual_hPa: pyRoundN(P / 100, 2), RH_h: pyRoundN(RHh, 1),
               U_ms: pyRoundN(U, 2), D_deg: pyRoundN(D, 1), dir_mil: pyRound(D * DEG_TO_MIL) % 6400,
               rho_actual: pyRoundN(density(Tk, P, RHh), 5), rho_std: pyRoundN(icaoRho(hm), 5) };
    }
    generate() { return LEVELS.map((h) => this.layer(h)); }
  }

  // codage Météo 11
  const mmhg2hpa = (v) => v * 1.33322;
  const deg2mil6 = (d) => pyRound((((d % 360) + 360) % 360) * DEG_TO_MIL6);
  const encDir = (d) => Math.trunc(deg2mil6(d) / 100);
  const encSpd = (ms) => Math.max(0, Math.min(99, pyRound(ms)));
  const encDT = (d) => { const v = pyRound(Math.abs(d)); return d < 0 ? (Math.trunc(v / 10) + 5) * 10 + v % 10 : v; };
  const encDP = (d) => { const v = pyRound(Math.abs(d)); return d < 0 ? 500 + v : v; };
  const encRH = (d) => { const v = pyRound(Math.abs(d)); return d < 0 ? 50 + v : v; };

  function computeBulletin(o) {
    const { T, P, RH, wdirMil, wspd, alt, nn, hour, cloud, z0 } = o;
    const wdirDeg = ((wdirMil / DEG_TO_MIL6) % 360 + 360) % 360;
    const gen = new Generator({ T, PhPa: mmhg2hpa(P), RH, wdirDeg, wspd, alt, z0, cloud, hour });
    const rows = gen.generate();
    const now = o.now || new Date();
    const JJ = z2(now.getUTCDate()), HH = z2(now.getUTCHours()), mn = z2(Math.trunc(now.getUTCMinutes() / 50) * 50);
    const hhhh = pad(Math.trunc(alt), 4, '0'), NN = z2(Math.trunc(nn));
    const dP = P - STD_P_MMH, dT = T - STD_T_C;
    const hdr = pad(encDP(dP), 3, '0') + z2(encDT(dT));
    const dRH = RH - STD_RH, rhGrp = '00' + z2(encRH(dRH));
    const groups = [];
    for (const r of rows) {
      if (r.h === 0) continue;
      const hc = Math.trunc(r.h);
      const YY = hc < 10000 ? z2(Math.trunc(hc / 100)) : z2(Math.trunc(hc / 1000));
      groups.push([YY, z2(encDT(r.T_actual_c - r.T_std_c)) + z2(encDir(r.D_deg)) + z2(encSpd(r.U_ms))]);
    }
    const lines = ['='.repeat(64), '   MÉTÉO 11 — نشرة جوية متوسطة للمدفعية', '   المدرسة التطبيقية لمدفعية الميدان', '='.repeat(64), '',
                   `  "Météo11${NN} – ${JJ}${HH}${mn} – ${hhhh} – ${hdr} –`];
    const chunk = ['   ' + rhGrp, ...groups.map(([y, g]) => `${y} – ${g}`)];
    let buf = '   ';
    chunk.forEach((part, i) => {
      if (i === 0) buf += part;
      else if (buf.length > 55) { lines.push(buf + ' –'); buf = '   ' + part; }
      else buf += ' – ' + part;
    });
    lines.push(buf + '"');
    lines.push('', '='.repeat(64), '  شرح الرموز:', `  Météo11${NN}  : محطة رقم ${NN}`,
      `  ${JJ}${HH}${mn}     : يوم ${JJ}  الساعة ${HH}:${mn} UTC`, `  ${hhhh}      : ارتفاع المحطة ${Math.trunc(alt)} م`,
      `  ${hdr}    : ΔP=${sgn(pyRound(dP), 0)} ملم ع ز  |  ΔT=${sgn(dT, 1)}°م`,
      `  ${rhGrp}      : طبقة سطحية  |  ΔRH=${sgn(pyRound(dRH), 0)}%`, '',
      `  ${pad('الطبقة', 8)}  ${pad('tt', 4)}  ${pad('GG', 4)}  ${pad('WW', 4)}  ${pad('T°م', 6)}  ${pad('مليام', 8)}`, '  ' + '─'.repeat(50));
    for (const r of rows) {
      if (r.h === 0) continue;
      lines.push(`  ${pad(Math.trunc(r.h), 8)}م  ${pad(encDT(r.T_actual_c - r.T_std_c), 4)}  ${pad(encDir(r.D_deg), 4)}  ${pad(encSpd(r.U_ms), 4)}  ` +
                 `${pad(sgn(r.T_actual_c, 1), 6)}  ${pad(deg2mil6(r.D_deg), 8)}`);
    }
    lines.push('='.repeat(64));
    return { text: lines.join('\n'), rows, stability: gen.stability };
  }


  // ───────── méthode DMK officielle (bulletin approximatif) ─────────
  const DMK = (typeof DMK_DATA !== 'undefined') ? DMK_DATA : require('./dmk-data.js');
  const hu = (x) => Math.floor(x + 0.5);
  function dmkTv(T) {
    const p = DMK.tv; if (T <= p[0][0]) return [p[0][1], T < p[0][0]]; if (T >= p[p.length - 1][0]) return [p[p.length - 1][1], T > p[p.length - 1][0]];
    for (let i = 0; i < p.length - 1; i++) if (p[i][0] <= T && T <= p[i + 1][0]) return [p[i][1] + (p[i + 1][1] - p[i][1]) * (T - p[i][0]) / (p[i + 1][0] - p[i][0]), false];
  }
  function dmkDtRows(n) {
    const keys = Object.keys(DMK.dt_neg).map(Number).sort((a, b) => a - b);
    if (DMK.dt_neg[n]) return [n]; if (n > keys[keys.length - 1]) return [keys[keys.length - 1]];
    return [Math.max(...keys.filter((k) => k < n)), Math.min(...keys.filter((k) => k > n))];
  }
  function dmkDtLayers(dT0i) {
    const n = hu(Math.abs(dT0i)); if (n === 0) return DMK.layers.map(() => 0); if (dT0i > 0) return DMK.layers.map(() => n);
    const rows = dmkDtRows(n); let vals;
    if (rows.length === 1) vals = DMK.dt_neg[rows[0]];
    else { const [lo, hi] = rows, f = (n - lo) / (hi - lo); vals = DMK.layers.map((_, i) => DMK.dt_neg[lo][i] + (DMK.dt_neg[hi][i] - DMK.dt_neg[lo][i]) * f); }
    return vals.map((v) => -hu(v));
  }
  function dmkWind(W0) {
    const w = hu(W0); if (w <= 0) return DMK.layers.map(() => 0);
    if (w < 2) return DMK.w['2'].map((v) => hu(v * w / 2)); if (w > 15) return DMK.w['15'].map((v) => hu(v * w / 15)); return DMK.w[String(w)].slice();
  }
  function dmkUncertainUsed(dT0i, W0) {
    const used = [], n = hu(Math.abs(dT0i)), has = (arr, a, b) => arr.some((x) => x[0] === a && x[1] === b);
    if (dT0i < 0 && n > 0) dmkDtRows(n).forEach((r) => DMK.layers.forEach((y) => { if (has(DMK.uncertain.dt_neg, r, y)) used.push(`ΔT=${r} ، Y=${y}`); }));
    let w = hu(W0); if (w >= 2) { w = Math.min(w, 15); DMK.layers.forEach((y) => { if (has(DMK.uncertain.w, y, w)) used.push(`W0=${w} ، Y=${y}`); }); }
    return used;
  }
  function computeBulletinDmk(o) {
    const { T, H, dH, wdirMil, W0, alt, nn } = o, now = o.now || new Date(), warns = [];
    const [dTv, outside] = dmkTv(T); if (outside) warns.push('الحرارة خارج مجال جدول ΔTv (0..50 °م) : أُخذت قيمة الحافة.');
    const Tv = T + dTv, dT0 = Tv - DMK.std_tv, H0 = H + dH, dH0 = H0 - DMK.std_h;
    const si = (x) => (x < 0 ? -1 : 1) * hu(Math.abs(x)), dT0i = si(dT0), dH0i = si(dH0);
    const dts = dmkDtLayers(dT0i), ws = dmkWind(W0), unc = dmkUncertainUsed(dT0i, W0);
    if (unc.length) warns.push('خلايا من الجدول قُرئت بصعوبة من الصورة وهي مستعملة هنا (راجعها مع الكتاب): ' + unc.join(' | '));
    if (hu(W0) > 15) warns.push('W0 أكبر من 15 م/ث : قيم الطبقات مستكملة تناسبياً (خارج الجدول).');
    const dirs = DMK.dalpha.map((a) => (((wdirMil + a) % 6000) + 6000) % 6000 | 0);
    const gg = dirs.map((d) => { const h = hu(d / 100); return h < 60 ? h : 0; });
    const JJ = z2(now.getUTCDate()), HH = z2(now.getUTCHours()), mn = z2(now.getUTCMinutes());
    const hdr = pad(encDP(dH0i), 3, '0') + z2(encDT(dT0i));
    const groups = DMK.layers.map((y, i) => [z2(y / 100), z2(encDT(dts[i])) + z2(gg[i]) + z2(Math.min(99, ws[i]))]);
    const head = `Météo11${z2(Math.trunc(nn))} – ${JJ}${HH}${mn} – ${pad(Math.trunc(alt), 4, '0')} – ${hdr} –`;
    const body = []; let buf = '   ';
    groups.forEach(([y, g], i) => { const part = `${y} – ${g}`; if (i === 0) buf += part; else if (buf.length > 50) { body.push(buf + ' –'); buf = '   ' + part; } else buf += ' – ' + part; });
    body.push(buf);
    const f1 = (v, sg) => (sg && v >= 0 ? '+' : '') + v.toFixed(1), si2 = (v) => (v >= 0 ? '+' : '') + v;
    const lines = ['='.repeat(64), '   MÉTÉO 11 — نشرة جوية متوسطة تقريبية (DMK)', '   المدرسة التطبيقية لمدفعية الميدان', '='.repeat(64), '', '  "' + head,
      ...body.slice(0, -1), '  ' + body[body.length - 1].trim() + '"', '', '='.repeat(64), '  بطاقة الحساب :',
      `  H = ${f1(H)}  ΔH = ${f1(dH, 1)}  →  H0 = ${f1(H0)}  →  ΔH0 = ${f1(dH0, 1)} ملم  (≈ ${si2(dH0i)})`,
      `  T = ${f1(T)}°  ΔTv = ${f1(dTv, 1)}  →  Tv = ${f1(Tv)}°  →  ΔT0 = Tv − 15.9 = ${f1(dT0, 1)}°  (≈ ${si2(dT0i)})`,
      `  αw0 = ${Math.round(wdirMil)} مليام   W0 = ${f1(W0)} م/ث`, '', `  ${pad('Y', 6)}  ${pad('Δt', 4)}  ${pad('αw', 6)}  ${pad('GG', 3)}  ${pad('W', 3)}`, '  ' + '─'.repeat(32)];
    DMK.layers.forEach((y, i) => lines.push(`  ${pad(y, 6)}  ${pad(si2(dts[i]), 4)}  ${pad(dirs[i], 6)}  ${pad(gg[i], 3)}  ${pad(ws[i], 3)}`));
    lines.push('='.repeat(64));
    const sheet = { H, dH, H0, dH0, dH0i, T, dTv, Tv, dT0, dT0i, wdir0: wdirMil, W0, head, layers: DMK.layers.map((y, i) => ({ Y: y, dt: dts[i], alpha: dirs[i], GG: gg[i], W: ws[i] })) };
    return { text: lines.join('\n'), sheet, warns };
  }

  // lecteur de bulletin
  class BulletinError extends Error {}
  const decDT = (tt) => (tt >= 50 ? -((Math.trunc(tt / 10) - 5) * 10 + tt % 10) : tt);
  const decDP = (h) => (h >= 500 ? -(h - 500) : h);
  const decRH = (d) => (d >= 50 ? -(d - 50) : d);
  const normDigits = (s) => s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6F0));

  function parseBulletin(text) {
    const s = normDigits(text || '').replace(/[\u2013\u2014\u2212]/g, '-');
    const m = /m[eé]t[eé]o\s*11\s*(\d{2})(?=\s*-?\s*\d{6})/i.exec(s);
    if (!m) throw new BulletinError('لم أجد بداية النشرة (Météo11NN ثم 6 أرقام). الصق النشرة أو افتح ملف TXT.');
    const rest = s.slice(m.index + m[0].length);
    const toks = []; const re = /\s*-?\s*(\d+)/y; let mm;
    while ((mm = re.exec(rest)) !== null) toks.push(mm[1]);
    if (toks.length < 5) throw new BulletinError('النشرة ناقصة: يلزم 3 مجموعات رأس على الأقل وطبقة واحدة (YY ثم ttGGWW).');
    const [gTime, gAlt, gHdr] = toks;
    const gRh = (toks.length > 3 && toks[3].length === 4) ? toks[3] : null;      // 00dd absent dans la Météo 11 approximative (DMK)
    const chk = [['JJHHmn (اليوم والساعة)', gTime, 6], ['hhhh (ارتفاع المحطة)', gAlt, 4], ['HHHtt (الضغط والحرارة)', gHdr, 5]];
    if (gRh !== null) chk.push(['00dd (الرطوبة)', gRh, 4]);
    chk.forEach(([n, t, k]) => { if (t.length !== k) throw new BulletinError(`المجموعة ${n} يجب أن تكون ${k} أرقام وقد وجدت «${t}».`); });
    const lt = gRh !== null ? toks.slice(4) : toks.slice(3);
    if (lt.length % 2) throw new BulletinError('عدد مجموعات الطبقات فردي: كل طبقة = YY ثم ttGGWW.');
    const layers = []; let prev = null, km = false;
    for (let i = 0; i < lt.length; i += 2) {
      const yy = lt[i], g = lt[i + 1], n = i / 2 + 1;
      if (yy.length !== 2 || g.length !== 6) throw new BulletinError(`الطبقة ${n}: يلزم YY (رقمان) ثم ttGGWW (6 أرقام) وقد وجدت «${yy} – ${g}».`);
      const y = parseInt(yy, 10);
      if (prev !== null && y <= prev) {
        if (km || y === prev) throw new BulletinError(`الطبقة ${n}: ترتيب الارتفاعات غير منطقي («${yy}»).`);
        km = true;
      }
      prev = y;
      const tt = parseInt(g.slice(0, 2), 10), gg = parseInt(g.slice(2, 4), 10), ww = parseInt(g.slice(4, 6), 10);
      if (gg > 60) throw new BulletinError(`الطبقة ${n}: GG=${z2(gg)} يتجاوز 60 (6000 مليام).`);
      layers.push({ alt: y * (km ? 1000 : 100), tt: decDT(tt), gg, wdir_mil: gg * 100, wspd: ww });
    }
    return { station: m[1], day: +gTime.slice(0, 2), hour: +gTime.slice(2, 4), minute: +gTime.slice(4, 6), alt_station: +gAlt,
             dP: decDP(+gHdr.slice(0, 3)), dT: decDT(+gHdr.slice(3, 5)), dRH: gRh !== null ? decRH(+gRh.slice(2, 4)) : 0, layers };
  }

  function pickLayer(layers, ybul, method) {
    method = method || 'interp';
    const alts = layers.map((l) => l.alt), pk = (l) => ({ tt: l.tt, wdir_mil: l.wdir_mil, wspd: l.wspd });
    if (ybul <= alts[0]) return [pk(layers[0]), `Ybul=${ybul.toFixed(0)} م ≤ أول طبقة → استُعملت طبقة ${alts[0]} م`];
    if (ybul >= alts[alts.length - 1]) return [pk(layers[layers.length - 1]), `Ybul=${ybul.toFixed(0)} م ≥ آخر طبقة → استُعملت طبقة ${alts[alts.length - 1]} م`];
    let i = 0; for (let k = 0; k < alts.length; k++) if (alts[k] <= ybul) i = k;
    const a = layers[i], b = layers[i + 1];
    if (ybul === a.alt) return [pk(a), `Ybul=${ybul.toFixed(0)} م → طبقة ${a.alt} م مباشرة`];
    if (method === 'upper') return [pk(b), `Ybul=${ybul.toFixed(0)} م → الطبقة العليا ${b.alt} م`];
    if (method === 'nearest') { const c = (ybul - a.alt) <= (b.alt - ybul) ? a : b; return [pk(c), `Ybul=${ybul.toFixed(0)} م → الطبقة الأقرب ${c.alt} م`]; }
    const f = (ybul - a.alt) / (b.alt - a.alt);
    const vec = (l) => { const r = (l.wdir_mil * 360 / 6000) * Math.PI / 180; return [l.wspd * Math.sin(r), l.wspd * Math.cos(r)]; };
    const [x1, y1] = vec(a), [x2, y2] = vec(b), x = x1 + (x2 - x1) * f, y = y1 + (y2 - y1) * f, w = Math.hypot(x, y);
    const wd = w > 1e-9 ? ((((Math.atan2(x, y) * 180 / Math.PI) % 360) + 360) % 360) * 6000 / 360 : a.wdir_mil;
    return [{ tt: a.tt + (b.tt - a.tt) * f, wdir_mil: wd, wspd: w }, `Ybul=${ybul.toFixed(0)} م → استكمال بين ${a.alt} م و${b.alt} م`];
  }

  // tables de tir
  const CACHE = {};
  function flagSuspects(recs) {
    recs.forEach((r) => { r._suspect = false; });
    ['Hausse', 'Ys', 'Ybul'].forEach((col) => {
      for (let i = 1; i < recs.length; i++) {
        const a = recs[i - 1][col], b = recs[i][col];
        if (a != null && b != null && b < a) recs[i - 1]._suspect = recs[i]._suspect = true;
      }
    });
  }
  function buildTable(raw) {
    const cols = raw.columns, data = {};
    Object.entries(raw.rows).forEach(([ch, rows]) => {
      const recs = rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
      recs.sort((p, q) => p.Distance - q.Distance); flagSuspects(recs); data[String(ch)] = recs;
    });
    return { charges: Object.keys(data), data, columns: cols };
  }
  function setTable(gun, raw) { CACHE[gun] = buildTable(raw); return CACHE[gun]; }
  function getTable(gun) { if (!CACHE[gun]) throw new Error('جدول الرمي غير محمَّل: ' + gun); return CACHE[gun]; }

  function lookup(gun, charge, dist) {
    const recs = getTable(gun).data[String(charge)];
    if (!recs) throw new Error(`الحشوة ${charge} غير موجودة في جدول ${gun}`);
    const dmin = recs[0].Distance, dmax = recs[recs.length - 1].Distance;
    if (dist < dmin || dist > dmax) throw new Error(`المدى ${dist} م خارج جدول الحشوة ${charge} (${dmin} إلى ${dmax} م)`);
    let lo = 0, hi = 0;
    for (let i = 0; i < recs.length; i++) {
      if (recs[i].Distance === dist) { lo = hi = i; break; }
      if (recs[i].Distance > dist) { lo = i - 1; hi = i; break; }
    }
    const a = recs[lo], b = recs[hi], f = lo === hi ? 0 : (dist - a.Distance) / (b.Distance - a.Distance), out = {};
    Object.keys(a).forEach((k) => {
      if (k[0] === '_' || k === 'ID' || k === 'charge') return;
      const va = a[k], vb = b[k];
      out[k] = (va == null || vb == null) ? (lo === hi ? va : null) : va + (vb - va) * f;
    });
    out._suspect = !!(a._suspect || b._suspect); out._bracket = [a.Distance, b.Distance];
    return out;
  }

  function computeCorrections(gun, charge, dist, az, bul, method, extra) {
    extra = extra || {};
    const row = lookup(gun, charge, dist), ybul = row.Ybul || 0;
    const [lay, layNote] = pickLayer(bul.layers, ybul, method);
    const th = (((lay.wdir_mil + 3000 - az) % 6000 + 6000) % 6000) * 360 / 6000 * Math.PI / 180;
    const Wx = lay.wspd * Math.cos(th), Wz = lay.wspd * Math.sin(th);
    const miss = ['DeltaXw', 'DeltaXH', 'DeltaXT', 'DeltaZw'].filter((k) => row[k] == null);
    if (miss.length) throw new Error('الجدول لا يحوي القيم: ' + miss.join(', ') + ' عند هذا المدى');
    const Dw = row.DeltaXw * Wx / 10, DH = row.DeltaXH * bul.dP / 10, Dt = row.DeltaXT * lay.tt / 10;
    const Dtch = (row.DeltaXTch != null && extra.dTch) ? row.DeltaXTch * extra.dTch / 10 : 0;   // facultatif : température de charge
    const Dq = (row.DeltaXq != null && extra.nq) ? row.DeltaXq * extra.nq : 0;                  // facultatif : signes de poids
    const Dvo = (row.DeltaXvo != null && extra.dV0) ? row.DeltaXvo * extra.dV0 : 0;             // facultatif : variation de v0
    const Dm = Dw + DH + Dt + Dtch + Dq + Dvo, dPm = row.DeltaZw * Wz / 10;
    const mil = row.DeltaXmill, h0 = row.Hausse;
    const res = { gun, charge: String(charge), dist, azimuth: az, row, lay, layNote, Wx, Wz, Dw, DH, Dt, Dtch, Dq, Dvo, Dm, dPm, warnings: [], extra };
    res.dHaus = mil ? Dm / mil : null; res.Hausse = h0;
    res.HausseCorr = (mil && h0 != null) ? h0 + res.dHaus : null;
    try { res.HausseCheck = lookup(gun, charge, dist + Dm).Hausse; } catch (e) { res.HausseCheck = null; }
    if (!mil) res.warnings.push('DeltaXmill غير متوفر في هذا السطر: لا يمكن تحويل Dm إلى مليام مباشرة.');
    if (row._suspect) res.warnings.push('سطرا الاستكمال يحويان قيماً مشبوهة (Hausse أو Ys أو Ybul تنقص مع زيادة المدى): راجع الجدول في تبويب «الجداول» وقارنه بالكتاب قبل الاعتماد على النتيجة.');
    if (res.HausseCorr != null && res.HausseCheck != null && Math.abs(res.HausseCorr - res.HausseCheck) > Math.max(3, 0.03 * res.HausseCorr))
      res.warnings.push('الطريقتان لا تتطابقان (قسمة Dm على DeltaXmill مقابل الهوسّ عند المدى + Dm). هذا يحدث عند تصحيح كبير أو قرب أقصى مدى، فالهوسّ عند (المدى + Dm) هو الأدقّ هناك.');
    return res;
  }

  return { DMK, computeBulletinDmk, dmkTv, dmkDtLayers, dmkWind, LEVELS, GUNS, Z0_OPTIONS, LAYER_METHODS, STD_T_C, STD_P_MMH, STD_RH, Generator, computeBulletin, parseBulletin, pickLayer,
           setTable, getTable, lookup, computeCorrections, BulletinError, pyRound, icaoT, icaoP, deg2mil6 };
});
