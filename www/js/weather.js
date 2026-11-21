/* Fond animé « météo » — canvas plein écran.  Le ciel, le soleil/la lune, les nuages, la pluie, la neige,
   le brouillard, le sable, l'orage et le vent reflètent les valeurs saisies (T, humidité, vent, nébulosité, heure). */
(function (root) {
  'use strict';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixC = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ───────── classification ─────────
  function classify(o) {
    const T = o.T, RH = o.RH, w = o.wspd, cloud = clamp(o.cloud), z0 = o.z0 == null ? 0.1 : o.z0;
    const lh = (((o.hour == null ? 12 : o.hour) + 1) % 24 + 24) % 24;          // heure locale (UTC+1)
    const sun = Math.sin(Math.PI * (lh - 6) / 12);
    let rain = 0, snow = 0, fog = 0, sand = 0, storm = 0, heat = 0;
    if (T <= 1.5 && RH >= 75 && cloud >= 0.55) snow = clamp((cloud - 0.35) * 1.4 * (RH / 100));
    else if (RH >= 88 && cloud >= 0.7) rain = clamp((RH - 85) / 15 * 0.6 + (cloud - 0.6) * 0.9);
    if (w >= 14 && cloud >= 0.75 && RH >= 75) { storm = 1; rain = Math.max(rain, 0.75); }
    if (RH >= 95 && w < 3.5 && rain < 0.2 && snow === 0 && cloud < 0.8) fog = clamp((RH - 92) / 8);
    if (w >= 9 && RH < 45 && z0 <= 0.1 && cloud < 0.8) sand = clamp((w - 8) / 12);
    if (T >= 38) heat = clamp((T - 36) / 10);
    const day = sun > 0.05;
    let label, emoji, kind;
    if (storm) { kind = 'storm'; label = 'عاصفة رعدية'; emoji = '⛈'; }
    else if (snow > 0.05) { kind = 'snow'; label = 'ثلج'; emoji = '❄️'; }
    else if (rain > 0.05) { kind = 'rain'; label = 'مطر'; emoji = '🌧'; }
    else if (sand > 0.1) { kind = 'sand'; label = 'عاصفة رملية'; emoji = '🌪'; }
    else if (fog > 0.1) { kind = 'fog'; label = 'ضباب'; emoji = '🌫'; }
    else if (cloud >= 0.8) { kind = 'overcast'; label = 'غائم'; emoji = '☁️'; }
    else if (cloud >= 0.4) { kind = 'partly'; label = day ? 'غائم جزئياً' : 'غائم جزئياً ليلاً'; emoji = day ? '⛅' : '☁️'; }
    else { kind = 'clear'; label = day ? 'صافٍ' : 'ليل صافٍ'; emoji = day ? '☀️' : '🌙'; }
    if (heat > 0.3 && (kind === 'clear' || kind === 'partly')) { label += ' · حار'; emoji = '🔥'; }
    if (w >= 12 && kind !== 'storm' && kind !== 'sand') label += ' · رياح قوية';
    return { kind, label, emoji, sun, day, lh, cloud, wind: w, wdirMil: o.wdirMil || 0, rain, snow, fog, sand, storm, heat, T, RH };
  }

  // ───────── palette du ciel ─────────
  function skyColors(s) {
    // [haut, bas] selon l'élévation du soleil
    const night = [hex('#050b1f'), hex('#14234a')], dusk = [hex('#2a2f6a'), hex('#f08a4b')], day = [hex('#2a78d0'), hex('#a5d8f7')];
    let top, bot;
    const h = s.sun;
    if (h <= -0.12) { top = night[0]; bot = night[1]; }
    else if (h < 0.2) {                                             // crépuscule / aube
      const t = (h + 0.12) / 0.32; const m = t < 0.5 ? t * 2 : 1;
      const a = mixC(night[0], dusk[0], clamp(t * 2)), b = mixC(night[1], dusk[1], clamp(t * 2));
      top = t < 0.5 ? a : mixC(dusk[0], day[0], (t - 0.5) * 2); bot = t < 0.5 ? b : mixC(dusk[1], day[1], (t - 0.5) * 2);
    } else { top = day[0]; bot = day[1]; }
    const nightF = clamp(-h * 3 + 0.4);                               // 0 = jour, 1 = nuit
    const grey = (g1, g2, k) => { top = mixC(top, g1, k); bot = mixC(bot, g2, k); };
    const dim = (c, k) => c.map((v) => Math.round(v * k));
    const cl = clamp((s.cloud - 0.3) / 0.7);
    if (cl > 0) grey(mixC(hex('#6b7785'), hex('#1b2231'), nightF), mixC(hex('#a9b3bd'), hex('#2c3548'), nightF), cl * 0.75);
    if (s.rain > 0) grey(mixC(hex('#3f4d60'), hex('#141a28'), nightF), mixC(hex('#74849a'), hex('#222c3e'), nightF), s.rain * 0.8);
    if (s.storm) grey(hex('#1d2130'), hex('#3a4054'), 0.85);
    if (s.snow > 0) grey(mixC(hex('#8fa2b8'), hex('#26324a'), nightF), mixC(hex('#dfe8f0'), hex('#4a5b78'), nightF), s.snow * 0.8);
    if (s.fog > 0) grey(mixC(hex('#aab4bd'), hex('#2a3342'), nightF), mixC(hex('#cfd6dc'), hex('#3f4a5c'), nightF), s.fog * 0.9);
    if (s.sand > 0) grey(mixC(hex('#b8863b'), hex('#4a3820'), nightF), mixC(hex('#e0b46a'), hex('#7a5a30'), nightF), s.sand * 0.9);
    if (s.heat > 0) { top = mixC(top, hex('#c95a1c'), s.heat * 0.35); bot = mixC(bot, hex('#ffb347'), s.heat * 0.5); }
    return { top, bot, nightF, mount: dim(bot, 0.38 + 0.15 * (1 - nightF)) };
  }

  // ───────── moteur de rendu ─────────
  const R = {
    cv: null, ctx: null, W: 0, H: 0, dpr: 1, enabled: true, state: classify({ T: 20, RH: 50, wspd: 3, cloud: 0.2, hour: 11 }),
    cur: null, tgt: null, t: 0, last: 0, stars: [], clouds: [], parts: [], mountains: [], flash: 0, nextBolt: 3, bolt: null, raf: 0,
    demoTimer: 0, onDemo: null,
  };
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

  function genMountains() {
    R.mountains = [0.62, 0.72, 0.82].map((base, li) => {
      const pts = []; let x = 0;
      const n = 14 + li * 6, ph = rnd() * 10;
      for (let i = 0; i <= n; i++) {
        x = i / n;
        pts.push([x, base + 0.05 * Math.sin(ph + x * (5 + li * 3)) + 0.06 * (rnd() - 0.5) - 0.04 * li * Math.sin(x * 3)]);
      }
      return pts;
    });
  }
  function genStars() { R.stars = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd() * 0.65, r: 0.4 + rnd() * 1.3, p: rnd() * 6.28, s: 0.5 + rnd() * 1.5 })); }
  function genClouds() {
    const s = R.state, n = Math.round(s.cloud * 9 + s.rain * 4 + s.storm * 3 + (s.kind === 'clear' ? 1 : 0));
    R.clouds = Array.from({ length: Math.max(2, n) }, () => ({
      x: rnd() * 1.4 - 0.2, y: 0.06 + rnd() * 0.42, sc: 0.7 + rnd() * 1.1, sp: 0.6 + rnd() * 0.8,
      lobes: Array.from({ length: 6 }, (_, i) => ({ dx: (i - 2.5) * 0.55 + (rnd() - 0.5) * 0.3, dy: (rnd() - 0.5) * 0.35, r: 0.55 + rnd() * 0.45 })),
    }));
  }
  function genParts() {
    const s = R.state, parts = [];
    const nRain = Math.round(s.rain * 260), nSnow = Math.round(s.snow * 160), nSand = Math.round(s.sand * 190);
    for (let i = 0; i < nRain; i++) parts.push({ t: 'r', x: rnd(), y: rnd(), v: 0.9 + rnd() * 0.7, l: 0.02 + rnd() * 0.025 });
    for (let i = 0; i < nSnow; i++) parts.push({ t: 's', x: rnd(), y: rnd(), v: 0.05 + rnd() * 0.08, r: 1 + rnd() * 2.6, p: rnd() * 6.28 });
    for (let i = 0; i < nSand; i++) parts.push({ t: 'd', x: rnd(), y: 0.3 + rnd() * 0.7, v: 0.5 + rnd() * 1.2, r: 0.6 + rnd() * 1.8, p: rnd() * 6.28 });
    const nW = s.wind >= 7 ? Math.round(clamp((s.wind - 6) / 14) * 26) : 0;
    for (let i = 0; i < nW; i++) parts.push({ t: 'w', x: rnd(), y: 0.1 + rnd() * 0.7, v: 0.4 + rnd() * 0.9, l: 0.08 + rnd() * 0.16, p: rnd() * 6.28 });
    R.parts = parts;
  }

  function resize() {
    const cv = R.cv; if (!cv) return;
    R.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    R.W = window.innerWidth; R.H = window.innerHeight;
    cv.width = Math.round(R.W * R.dpr); cv.height = Math.round(R.H * R.dpr);
    cv.style.width = R.W + 'px'; cv.style.height = R.H + 'px';
    R.ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  }

  // direction du déplacement des particules : le vent vient de GG (mil) → souffle vers GG+180°
  function windVec() {
    const s = R.state, a = ((s.wdirMil * 360 / 6000) + 180) * Math.PI / 180;
    const k = clamp(s.wind / 14, 0.15, 1.6);
    let dx = Math.sin(a), dy = -Math.cos(a);
    // sur écran portrait : composante horizontale dominante pour un rendu lisible
    return { dx: (Math.abs(dx) < 0.25 ? (dx < 0 ? -0.25 : 0.25) : dx) * k, k };
  }

  function drawSky(ctx, c) {
    const g = ctx.createLinearGradient(0, 0, 0, R.H);
    g.addColorStop(0, rgb(c.top)); g.addColorStop(1, rgb(c.bot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
  }
  function drawStars(ctx, c, t) {
    const a = clamp(c.nightF - 0.3) * (1 - clamp(R.state.cloud * 1.1)) * (1 - R.state.fog);
    if (a <= 0.02) return;
    ctx.fillStyle = '#fff';
    R.stars.forEach((s) => { ctx.globalAlpha = a * (0.45 + 0.55 * Math.sin(t * s.s + s.p) ** 2); ctx.beginPath(); ctx.arc(s.x * R.W, s.y * R.H, s.r, 0, 6.283); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  function drawSunMoon(ctx, c, t) {
    const s = R.state, vis = 1 - clamp(s.cloud * 0.9 + s.rain + s.fog * 0.8 + s.sand * 0.9 + s.storm);
    if (vis < 0.05) return;
    const frac = s.sun > -0.15 ? clamp((s.lh - 5.5) / 13) : clamp(((s.lh >= 18 ? s.lh - 18 : s.lh + 6) / 12));
    const x = R.W * (0.12 + 0.76 * frac), y = R.H * (0.52 - 0.40 * Math.sin(Math.PI * frac));
    if (s.sun > -0.08) {
      const r = Math.min(R.W, R.H) * 0.075, low = clamp(1 - s.sun * 3);
      const col = mixC(hex('#fff2b0'), hex('#ff9a4a'), low);
      const gl = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * (5 + low * 2));
      gl.addColorStop(0, rgb(col, 0.55 * vis)); gl.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, R.W, R.H);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.05); ctx.strokeStyle = rgb(col, 0.18 * vis); ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(r * 1.35, 0); ctx.lineTo(r * (1.7 + 0.35 * Math.sin(t * 1.2 + i)), 0); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = rgb(col, vis); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    } else {
      const r = Math.min(R.W, R.H) * 0.06;
      const gl = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 5);
      gl.addColorStop(0, `rgba(190,210,255,${0.28 * vis})`); gl.addColorStop(1, 'rgba(190,210,255,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, 0, R.W, R.H);
      ctx.save(); ctx.globalAlpha = vis; ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x + r * 0.42, y - r * 0.12, r * 0.92, 0, 6.283); ctx.fill();
      ctx.restore();
    }
  }
  function drawClouds(ctx, c, dt) {
    const s = R.state, wv = windVec();
    const dark = clamp(s.rain * 0.9 + s.storm + (s.cloud - 0.6) * 0.8);
    const base = mixC(mixC(hex('#ffffff'), hex('#8e98a6'), dark), hex('#2a3345'), clamp(c.nightF * 0.85));
    const sp = 0.006 + s.wind * 0.0035;
    R.clouds.forEach((cl) => {
      cl.x += (wv.dx >= 0 ? 1 : -1) * Math.max(0.12, Math.abs(wv.dx)) * sp * cl.sp * dt * 6;
      if (cl.x > 1.3) cl.x = -0.35; if (cl.x < -0.4) cl.x = 1.25;
      const px = cl.x * R.W, py = cl.y * R.H, u = Math.min(R.W, R.H) * 0.13 * cl.sc;
      cl.lobes.forEach((lb) => {
        const cx = px + lb.dx * u, cy = py + lb.dy * u, r = lb.r * u;
        const g = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.1, cx, cy, r);
        g.addColorStop(0, rgb(base, 0.92 * clamp(0.35 + s.cloud))); g.addColorStop(1, rgb(base, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
      });
    });
  }
  function drawMountains(ctx, c, t) {
    const hz = R.H;
    R.mountains.forEach((pts, li) => {
      const col = mixC(c.mount, [0, 0, 0], 0.12 * (2 - li) * 0.5 + li * 0.1);
      const k = 0.55 + li * 0.2;
      ctx.fillStyle = rgb(col.map((v) => Math.round(v * (0.7 + li * 0.25))), 0.96);
      ctx.beginPath(); ctx.moveTo(0, hz);
      pts.forEach(([x, y]) => ctx.lineTo(x * R.W, y * hz));
      ctx.lineTo(R.W, hz); ctx.closePath(); ctx.fill();
    });
  }
  function drawParts(ctx, c, dt, t) {
    const s = R.state, wv = windVec();
    const slant = clamp(wv.dx * 0.5, -0.8, 0.8);
    R.parts.forEach((p) => {
      if (p.t === 'r') {
        p.y += p.v * dt * 1.1; p.x += slant * dt * 0.35;
        if (p.y > 1) { p.y = -0.05; p.x = rnd(); } if (p.x > 1.1) p.x = -0.1; if (p.x < -0.1) p.x = 1.1;
        ctx.strokeStyle = 'rgba(190,215,255,0.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(p.x * R.W, p.y * R.H); ctx.lineTo(p.x * R.W - slant * 26, p.y * R.H - p.l * R.H); ctx.stroke();
      } else if (p.t === 's') {
        p.y += p.v * dt; p.x += (slant * 0.12 + Math.sin(t * 0.8 + p.p) * 0.012) * dt * 2;
        if (p.y > 1.02) { p.y = -0.03; p.x = rnd(); } if (p.x > 1.05) p.x = -0.05; if (p.x < -0.05) p.x = 1.05;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x * R.W, p.y * R.H, p.r, 0, 6.283); ctx.fill();
      } else if (p.t === 'd') {
        const dir = wv.dx >= 0 ? 1 : -1;
        p.x += dir * (0.18 + Math.abs(wv.dx) * 0.5) * p.v * dt; p.y += Math.sin(t * 2 + p.p) * 0.01 * dt;
        if (p.x > 1.05) p.x = -0.05; if (p.x < -0.05) p.x = 1.05;
        ctx.fillStyle = `rgba(214,170,98,${0.35 + 0.4 * s.sand})`; ctx.beginPath(); ctx.arc(p.x * R.W, p.y * R.H, p.r, 0, 6.283); ctx.fill();
      } else if (p.t === 'w') {
        const dir = wv.dx >= 0 ? 1 : -1;
        p.x += dir * (0.25 + Math.abs(wv.dx) * 0.7) * p.v * dt; if (p.x > 1.3) p.x = -0.3; if (p.x < -0.3) p.x = 1.3;
        const x = p.x * R.W, y = p.y * R.H, L = p.l * R.W * dir;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x - L * 0.3, y + Math.sin(t * 2 + p.p) * 6, x - L * 0.7, y - Math.sin(t * 1.6 + p.p) * 6, x - L, y); ctx.stroke();
      }
    });
  }
  function drawFog(ctx, c, t) {
    const a = R.state.fog; if (a <= 0.02) return;
    for (let i = 0; i < 4; i++) {
      const y = R.H * (0.45 + i * 0.14) + Math.sin(t * 0.25 + i) * 14, off = ((t * (10 + i * 5)) % (R.W * 1.5)) - R.W * 0.25;
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, 'rgba(225,232,238,0)'); g.addColorStop(0.5, `rgba(225,232,238,${0.4 * a})`); g.addColorStop(1, 'rgba(225,232,238,0)');
      ctx.fillStyle = g; ctx.fillRect(off - R.W * 0.5, y - 60, R.W * 2, 120);
    }
    ctx.fillStyle = `rgba(215,222,230,${0.22 * a})`; ctx.fillRect(0, 0, R.W, R.H);
  }
  function drawSandHaze(ctx) {
    const a = R.state.sand; if (a <= 0.02) return;
    const g = ctx.createLinearGradient(0, R.H * 0.3, 0, R.H); g.addColorStop(0, `rgba(200,150,80,${0.05 * a})`); g.addColorStop(1, `rgba(190,135,60,${0.38 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
  }
  function drawHeat(ctx, t) {
    const a = R.state.heat; if (a <= 0.02) return;
    const g = ctx.createLinearGradient(0, R.H * 0.55, 0, R.H); g.addColorStop(0, 'rgba(255,170,60,0)'); g.addColorStop(1, `rgba(255,140,40,${0.3 * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.W, R.H);
    ctx.strokeStyle = `rgba(255,220,150,${0.18 * a})`; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const y0 = R.H * (0.7 + i * 0.04); ctx.beginPath();
      for (let x = 0; x <= R.W; x += 12) { const y = y0 + Math.sin(x * 0.03 + t * 2 + i) * 3; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function drawLightning(ctx, dt) {
    if (!R.state.storm) { R.flash = 0; R.bolt = null; return; }
    R.nextBolt -= dt;
    if (R.nextBolt <= 0) {
      R.nextBolt = 2.5 + rnd() * 5.5; R.flash = 1;
      let x = R.W * (0.15 + rnd() * 0.7), y = R.H * 0.1; const pts = [[x, y]];
      while (y < R.H * 0.68) { x += (rnd() - 0.5) * 60; y += 24 + rnd() * 34; pts.push([x, y]); }
      R.bolt = pts;
    }
    if (R.flash > 0.01) {
      ctx.fillStyle = `rgba(210,225,255,${R.flash * 0.32})`; ctx.fillRect(0, 0, R.W, R.H);
      if (R.bolt) {
        ctx.strokeStyle = `rgba(255,255,255,${R.flash})`; ctx.lineWidth = 2.4; ctx.shadowColor = '#bcd4ff'; ctx.shadowBlur = 14;
        ctx.beginPath(); R.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.shadowBlur = 0;
      }
      R.flash *= Math.pow(0.02, dt * 2.2);
    }
  }

  function frame(ts) {
    R.raf = requestAnimationFrame(frame);
    if (!R.enabled || document.hidden) return;
    const dtRaw = (ts - R.last) / 1000; if (dtRaw < 0.032) return;      // ~30 images/s
    const dt = Math.min(dtRaw, 0.1); R.last = ts; R.t += dt;
    // transition douce des couleurs
    const tg = R.tgt;
    ['top', 'bot', 'mount'].forEach((k) => { R.cur[k] = R.cur[k].map((v, i) => v + (tg[k][i] - v) * Math.min(1, dt * 2.2)); });
    R.cur.nightF += (tg.nightF - R.cur.nightF) * Math.min(1, dt * 2.2);
    const c = { top: R.cur.top.map(Math.round), bot: R.cur.bot.map(Math.round), mount: R.cur.mount.map(Math.round), nightF: R.cur.nightF };
    const ctx = R.ctx;
    drawSky(ctx, c); drawStars(ctx, c, R.t); drawSunMoon(ctx, c, R.t); drawClouds(ctx, c, dt);
    drawHeat(ctx, R.t); drawMountains(ctx, c, R.t); drawFog(ctx, c, R.t); drawSandHaze(ctx);
    drawParts(ctx, c, dt, R.t); drawLightning(ctx, dt);
  }

  function setState(s, instant) {
    R.state = s; R.tgt = skyColors(s);
    if (!R.cur || instant) R.cur = { top: R.tgt.top.slice(), bot: R.tgt.bot.slice(), mount: R.tgt.mount.slice(), nightF: R.tgt.nightF };
    genClouds(); genParts();
    if (R.ctx && !R.enabled) { R.enabled = true; frame(performance.now() + 50); R.enabled = false; }   // image fixe si animation coupée
  }
  function init(canvas) {
    R.cv = canvas; R.ctx = canvas.getContext('2d'); genMountains(); genStars(); resize();
    window.addEventListener('resize', resize);
    setState(R.state, true); cancelAnimationFrame(R.raf); R.raf = requestAnimationFrame(frame);
  }
  function setEnabled(b) { R.enabled = !!b; if (b) R.last = performance.now(); }

  // ───────── aperçu des ambiances ─────────
  const PRESETS = [
    ['☀️ نهار صافٍ', { T: 27, RH: 35, wspd: 3, cloud: 0.05, hour: 10, z0: 0.1 }],
    ['🌅 غروب', { T: 22, RH: 40, wspd: 3, cloud: 0.25, hour: 16.4, z0: 0.1 }],
    ['🌙 ليل صافٍ', { T: 14, RH: 45, wspd: 2, cloud: 0.05, hour: 22, z0: 0.1 }],
    ['⛅ غائم جزئياً', { T: 24, RH: 55, wspd: 6, cloud: 0.55, hour: 11, z0: 0.1 }],
    ['☁️ غائم', { T: 18, RH: 70, wspd: 5, cloud: 0.95, hour: 12, z0: 0.1 }],
    ['🌧 مطر', { T: 12, RH: 94, wspd: 6, cloud: 0.95, hour: 13, z0: 0.1 }],
    ['⛈ عاصفة رعدية', { T: 20, RH: 90, wspd: 18, cloud: 1, hour: 15, z0: 0.1 }],
    ['🌫 ضباب', { T: 8, RH: 98, wspd: 1, cloud: 0.4, hour: 7, z0: 0.1 }],
    ['❄️ ثلج', { T: -2, RH: 88, wspd: 4, cloud: 0.9, hour: 12, z0: 0.1 }],
    ['🌪 عاصفة رملية', { T: 34, RH: 20, wspd: 16, cloud: 0.2, hour: 12, z0: 0.005 }],
    ['🔥 حرّ شديد', { T: 44, RH: 12, wspd: 3, cloud: 0, hour: 12, z0: 0.005 }],
  ];
  function demo(on, cb) {
    clearInterval(R.demoTimer); R.onDemo = cb || null;
    if (!on) { if (cb) cb(null); return; }
    let i = 0;
    const step = () => { const [name, p] = PRESETS[i++ % PRESETS.length]; setState(classify(Object.assign({ wdirMil: 3600 }, p))); if (R.onDemo) R.onDemo(name); };
    step(); R.demoTimer = setInterval(step, 4200);
  }

  root.WX = { classify, init, setState, setEnabled, demo, PRESETS };
})(window);
