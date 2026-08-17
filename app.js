/* ============================================================
   CutList Optimizer v2 — UI layer
   Signature features:
     · animated packing sequence (watch pieces land on the sheet)
     · linked highlighting: hover cut-table row ⇆ piece on canvas
     · live tooltip with part data on canvas hover
     · count-up stat numbers, color-coded parts
   Depends on: optimizer.js, Chart.js (CDN)
   ============================================================ */

(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Distinct part colors (cycled per unique label) — muted, dark-bg friendly
  const PART_COLORS = ['#E8B15C', '#8FBF7C', '#6FA8DC', '#D98A9E', '#B49CD8', '#6CC5B0', '#D9A05B', '#9DB2C8'];

  const els = {
    sheetW: $('#sheetW'), sheetH: $('#sheetH'),
    kerf: $('#kerf'), price: $('#price'),
    rotation: $('#rotation'),
    partRows: $('#partRows'),
    addRow: $('#addRow'), run: $('#run'), loadDemo: $('#loadDemo'),
    results: $('#results'), empty: $('#emptyState'),
    stats: $('#statsStrip'), warnHost: $('#warnHost'),
    sheetsHost: $('#sheetsHost'),
    exportCsv: $('#exportCsv'), printBtn: $('#printBtn'),
    tip: $('#tip'),
  };

  let charts = { donut: null, bars: null };
  let lastResult = null;
  let colorMap = new Map();

  const colorFor = (label) => {
    if (!colorMap.has(label)) colorMap.set(label, PART_COLORS[colorMap.size % PART_COLORS.length]);
    return colorMap.get(label);
  };

  // ---------- Part rows ------------------------------------------------
  function addPartRow(label = '', w = '', h = '', qty = 1) {
    const row = document.createElement('div');
    row.className = 'part-row';
    row.innerHTML = `
      <div class="swatch-input">
        <span class="swatch"></span>
        <input type="text" class="p-label" value="${label}" placeholder="PART-01" aria-label="Part label">
      </div>
      <input type="number" class="p-w" value="${w}" min="1" placeholder="W" aria-label="Width mm">
      <input type="number" class="p-h" value="${h}" min="1" placeholder="H" aria-label="Height mm">
      <input type="number" class="p-qty" value="${qty}" min="1" aria-label="Quantity">
      <button type="button" class="row-del" title="Remove part" aria-label="Remove part">✕</button>`;
    row.querySelector('.row-del').addEventListener('click', () => row.remove());
    const labelInput = row.querySelector('.p-label');
    const paint = () => {
      const v = labelInput.value.trim();
      row.querySelector('.swatch').style.background = v ? colorFor(v) : 'var(--line)';
    };
    labelInput.addEventListener('input', paint);
    paint();
    els.partRows.appendChild(row);
  }

  function readParts() {
    return $$('.part-row').map((row, i) => ({
      id: i,
      label: row.querySelector('.p-label').value.trim() || `PART-${String(i + 1).padStart(2, '0')}`,
      w: +row.querySelector('.p-w').value,
      h: +row.querySelector('.p-h').value,
      qty: Math.max(1, +row.querySelector('.p-qty').value || 1),
    })).filter(p => p.w > 0 && p.h > 0);
  }

  // ---------- Formatting -----------------------------------------------
  const fmtR = (n) => 'R ' + n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n) => (n * 100).toFixed(1) + '%';
  const fmtM2 = (mm2) => (mm2 / 1e6).toFixed(2) + ' m²';

  // ---------- Run ------------------------------------------------------
  function run() {
    const config = {
      sheetW: +els.sheetW.value,
      sheetH: +els.sheetH.value,
      kerf: +els.kerf.value || 0,
      allowRotation: els.rotation.checked,
    };
    const parts = readParts();

    if (!config.sheetW || !config.sheetH || parts.length === 0) {
      els.warnHost.innerHTML = `<div class="warn">Add a stock sheet size and at least one part, then optimize.</div>`;
      return;
    }

    colorMap = new Map();
    parts.forEach(p => colorFor(p.label)); // stable color order = row order

    lastResult = Optimizer.optimize(config, parts);
    render(lastResult, +els.price.value || 0);
  }

  // ---------- Render ---------------------------------------------------
  function render(result, pricePerSheet) {
    const t = result.totals;
    els.empty.hidden = true;
    els.results.hidden = false;

    els.warnHost.innerHTML = result.rejected.length
      ? `<div class="warn">⚠ ${result.rejected.length} part(s) exceed the stock sheet and were skipped: ${
          [...new Set(result.rejected.map(r => r.label))].join(', ')}</div>`
      : '';

    const cost = t.sheetCount * pricePerSheet;
    els.stats.innerHTML = `
      <div class="stat blue"><div class="k">Sheets required</div><div class="v" data-count="${t.sheetCount}" data-dec="0">0</div></div>
      <div class="stat"><div class="k">Parts placed</div><div class="v" data-count="${t.pieceCount}" data-dec="0">0</div></div>
      <div class="stat blue"><div class="k">Material cost</div><div class="v" data-count="${cost}" data-dec="2" data-prefix="R ">R 0.00</div></div>
      <div class="stat green"><div class="k">Utilization</div><div class="v" data-count="${(t.utilizationPct * 100).toFixed(1)}" data-dec="1" data-suffix="%">0%</div></div>
      <div class="stat red"><div class="k">Waste</div><div class="v" data-count="${(t.wastePct * 100).toFixed(1)}" data-dec="1" data-suffix="%">0% <small>${fmtM2(t.wasteArea)}</small></div></div>`;
    animateCounts();

    renderCharts(result);
    renderSheets(result);
  }

  function animateCounts() {
    $$('.stat .v').forEach(el => {
      const target = +el.dataset.count;
      const dec = +el.dataset.dec;
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const small = el.querySelector('small')?.outerHTML || '';
      const set = (v) => {
        const num = dec > 0
          ? v.toLocaleString('en-ZA', { minimumFractionDigits: dec, maximumFractionDigits: dec })
          : Math.round(v).toString();
        el.innerHTML = prefix + num + suffix + (small ? ' ' + small : '');
      };
      if (reduceMotion) return set(target);
      const t0 = performance.now(), dur = 650;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        set(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // ---------- Charts ---------------------------------------------------
  function renderCharts(result) {
    const t = result.totals;
    const css = getComputedStyle(document.documentElement);
    const C = (v) => css.getPropertyValue(v).trim();

    Chart.defaults.font.family = '"IBM Plex Mono", monospace';
    Chart.defaults.color = C('--text-dim');
    Chart.defaults.borderColor = C('--line-soft');

    charts.donut?.destroy();
    charts.donut = new Chart($('#donutChart'), {
      type: 'doughnut',
      data: {
        labels: ['Used material', 'Waste'],
        datasets: [{
          data: [t.usedArea, t.wasteArea],
          backgroundColor: [C('--blue'), C('--red')],
          borderColor: C('--bg-panel'),
          borderWidth: 3,
        }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtM2(c.raw)}` } },
        },
      },
    });

    charts.bars?.destroy();
    charts.bars = new Chart($('#barChart'), {
      type: 'bar',
      data: {
        labels: result.sheets.map(s => `SHEET ${String(s.index).padStart(2, '0')}`),
        datasets: [{
          data: result.sheets.map(s => +(s.utilization * 100).toFixed(1)),
          backgroundColor: C('--blue'),
          borderRadius: 4,
          maxBarThickness: 46,
        }],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => v + '%', font: { size: 10 } }, grid: { color: C('--line-soft') } },
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` Utilization: ${c.raw}%` } },
        },
      },
    });
  }

  // ---------- Sheet drawings -------------------------------------------
  function renderSheets(result) {
    const { sheetW, sheetH } = result.config;
    els.sheetsHost.innerHTML = '';

    result.sheets.forEach((sheet) => {
      const card = document.createElement('section');
      card.className = 'panel';
      card.innerHTML = `
        <div class="panel-head">
          <h2>Sheet ${String(sheet.index).padStart(2, '0')}</h2>
          <span class="meta">${sheetW} × ${sheetH} mm · ${sheet.placements.length} parts · UTIL ${fmtPct(sheet.utilization)}</span>
        </div>
        <div class="sheet-canvas-wrap"><canvas class="sheet" aria-label="Cutting diagram, sheet ${sheet.index}"></canvas></div>
        <div class="panel-body">
          <table class="cutlist-table">
            <thead><tr><th>#</th><th>Part</th><th>X</th><th>Y</th><th>W</th><th>H</th><th>Rot</th></tr></thead>
            <tbody>${sheet.placements.map((p, i) => `
              <tr data-uid="${p.uid}">
                <td>${i + 1}</td>
                <td><span class="chip" style="background:${colorFor(p.label)}"></span>${p.label}</td>
                <td>${p.x}</td><td>${p.y}</td><td>${p.w}</td><td>${p.h}</td>
                <td>${p.rotated ? '<span class="rot">90°</span>' : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      els.sheetsHost.appendChild(card);

      const canvas = card.querySelector('canvas');
      const view = makeSheetView(canvas, sheet, sheetW, sheetH);
      view.animateIn();

      // table row ⇆ canvas linking
      card.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('mouseenter', () => view.highlight(tr.dataset.uid));
        tr.addEventListener('mouseleave', () => view.highlight(null));
      });
      canvas.addEventListener('piecehover', (e) => {
        card.querySelectorAll('tbody tr').forEach(tr =>
          tr.classList.toggle('hl', tr.dataset.uid === e.detail));
      });
    });
  }

  /** Canvas view with animation, hover hit-testing, and highlight API */
  function makeSheetView(canvas, sheet, sheetW, sheetH) {
    const css = getComputedStyle(document.documentElement);
    const C = (v) => css.getPropertyValue(v).trim();

    const maxW = Math.min(canvas.parentElement.clientWidth - 12, 940);
    const scale = maxW / sheetW;
    const pad = 30;
    const w = Math.round(sheetW * scale) + pad * 2;
    const h = Math.round(sheetH * scale) + pad * 2;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const X = (mm) => pad + mm * scale;
    const Y = (mm) => pad + mm * scale;
    let hoverUid = null;
    let progress = reduceMotion ? sheet.placements.length : 0; // pieces fully drawn

    function base() {
      ctx.clearRect(0, 0, w, h);
      // sheet body
      ctx.fillStyle = C('--bg');
      ctx.fillRect(pad, pad, sheetW * scale, sheetH * scale);
      // 100 mm grid
      ctx.strokeStyle = C('--line-soft'); ctx.lineWidth = 0.5;
      for (let gx = 100; gx < sheetW; gx += 100) {
        ctx.beginPath(); ctx.moveTo(X(gx), Y(0)); ctx.lineTo(X(gx), Y(sheetH)); ctx.stroke();
      }
      for (let gy = 100; gy < sheetH; gy += 100) {
        ctx.beginPath(); ctx.moveTo(X(0), Y(gy)); ctx.lineTo(X(sheetW), Y(gy)); ctx.stroke();
      }
    }

    function piece(p, alpha = 1, lift = 0) {
      const px = X(p.x), py = Y(p.y) - lift, pw = p.w * scale, ph = p.h * scale;
      const col = colorFor(p.label);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col + 'CC';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = col; ctx.lineWidth = hoverUid === p.uid ? 2.5 : 1.25;
      ctx.strokeRect(px, py, pw, ph);
      if (hoverUid === p.uid) {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(px, py, pw, ph);
      }
      if (pw > 52 && ph > 30) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#10161C';
        ctx.fillText(p.label, px + pw / 2, py + ph / 2 - 7, pw - 10);
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.fillStyle = 'rgba(16,22,28,0.72)';
        ctx.fillText(`${p.w}×${p.h}`, px + pw / 2, py + ph / 2 + 7, pw - 10);
      }
      ctx.globalAlpha = 1;
    }

    function frame(partial) {
      base();
      const n = Math.floor(progress);
      for (let i = 0; i < Math.min(n, sheet.placements.length); i++) piece(sheet.placements[i]);
      if (partial && n < sheet.placements.length) {
        const f = progress - n; // 0..1 within current piece
        piece(sheet.placements[n], f, (1 - f) * 14);
      }
      // border + dims on top
      ctx.strokeStyle = C('--line'); ctx.lineWidth = 1.5;
      ctx.strokeRect(pad, pad, sheetW * scale, sheetH * scale);
      ctx.strokeStyle = C('--blue'); ctx.fillStyle = C('--blue');
      ctx.lineWidth = 1; ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.beginPath(); ctx.moveTo(X(0), pad - 13); ctx.lineTo(X(sheetW), pad - 13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), pad - 17); ctx.lineTo(X(0), pad - 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(sheetW), pad - 17); ctx.lineTo(X(sheetW), pad - 9); ctx.stroke();
      ctx.fillText(`${sheetW} mm`, X(sheetW / 2), pad - 18);
      ctx.beginPath(); ctx.moveTo(pad - 13, Y(0)); ctx.lineTo(pad - 13, Y(sheetH)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad - 17, Y(0)); ctx.lineTo(pad - 9, Y(0)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad - 17, Y(sheetH)); ctx.lineTo(pad - 9, Y(sheetH)); ctx.stroke();
      ctx.save();
      ctx.translate(pad - 18, Y(sheetH / 2)); ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${sheetH} mm`, 0, 0);
      ctx.restore();
    }

    function animateIn() {
      if (reduceMotion) { frame(false); return; }
      progress = 0;
      const perPiece = Math.max(45, Math.min(110, 900 / sheet.placements.length)); // ms per piece
      let last = performance.now();
      const tick = (now) => {
        progress += (now - last) / perPiece;
        last = now;
        if (progress >= sheet.placements.length) { progress = sheet.placements.length; frame(false); return; }
        frame(true);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // hover hit-testing + tooltip
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left - pad) / scale;
      const my = (e.clientY - r.top - pad) / scale;
      const hit = sheet.placements.find(p => mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) || null;
      const uid = hit ? hit.uid : null;
      if (uid !== hoverUid) {
        hoverUid = uid;
        frame(false);
        canvas.dispatchEvent(new CustomEvent('piecehover', { detail: uid, bubbles: false }));
      }
      if (hit) {
        els.tip.hidden = false;
        els.tip.style.left = e.clientX + 'px';
        els.tip.style.top = e.clientY + 'px';
        els.tip.innerHTML = `${hit.label} <span class="dim">· ${hit.w}×${hit.h} mm · @ ${hit.x},${hit.y}${hit.rotated ? ' · rotated 90°' : ''}</span>`;
      } else {
        els.tip.hidden = true;
      }
    });
    canvas.addEventListener('mouseleave', () => {
      hoverUid = null; els.tip.hidden = true; frame(false);
      canvas.dispatchEvent(new CustomEvent('piecehover', { detail: null }));
    });

    return {
      animateIn,
      highlight(uid) { hoverUid = uid; frame(false); },
    };
  }

  // ---------- CSV export -----------------------------------------------
  function exportCsv() {
    if (!lastResult) return;
    const rows = [['Sheet', 'Part', 'X_mm', 'Y_mm', 'W_mm', 'H_mm', 'Rotated']];
    lastResult.sheets.forEach(s =>
      s.placements.forEach(p =>
        rows.push([s.index, p.label, p.x, p.y, p.w, p.h, p.rotated ? 'YES' : 'NO'])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'cutlist.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Demo -----------------------------------------------------
  function loadDemo() {
    els.partRows.innerHTML = '';
    colorMap = new Map();
    [
      ['CAB-TOP', 900, 600, 2],
      ['CAB-SIDE', 720, 580, 4],
      ['CAB-SHELF', 864, 560, 6],
      ['DOOR', 715, 447, 4],
      ['BACK-PANEL', 900, 720, 2],
      ['DRAWER-FRONT', 445, 175, 6],
    ].forEach(a => addPartRow(...a));
  }

  // ---------- Wire up --------------------------------------------------
  els.addRow.addEventListener('click', () => addPartRow());
  els.run.addEventListener('click', run);
  els.loadDemo.addEventListener('click', () => { loadDemo(); run(); });
  els.exportCsv.addEventListener('click', exportCsv);
  els.printBtn.addEventListener('click', () => window.print());
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  });

  addPartRow(); addPartRow(); addPartRow();
})();
