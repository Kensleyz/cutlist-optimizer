/* ============================================================
   CutList Optimizer — UI layer
   Depends on: optimizer.js (Optimizer.optimize), Chart.js (CDN)
   ============================================================ */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    sheetW: $('#sheetW'), sheetH: $('#sheetH'),
    kerf: $('#kerf'), price: $('#price'),
    rotation: $('#rotation'),
    pieceRows: $('#pieceRows'),
    addRow: $('#addRow'),
    run: $('#run'),
    results: $('#results'),
    empty: $('#emptyState'),
    stats: $('#statsStrip'),
    chartsPanel: $('#chartsPanel'),
    sheetsHost: $('#sheetsHost'),
    warnHost: $('#warnHost'),
    exportCsv: $('#exportCsv'),
    printBtn: $('#printBtn'),
    loadDemo: $('#loadDemo'),
  };

  let charts = { donut: null, bars: null };
  let lastResult = null;

  // ---------- Piece rows ----------------------------------------------
  function addPieceRow(label = '', w = '', h = '', qty = 1) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="p-label" value="${label}" placeholder="PART-01" aria-label="Part label"></td>
      <td><input type="number" class="p-w" value="${w}" min="1" placeholder="600" aria-label="Width mm"></td>
      <td><input type="number" class="p-h" value="${h}" min="1" placeholder="400" aria-label="Height mm"></td>
      <td><input type="number" class="p-qty" value="${qty}" min="1" aria-label="Quantity"></td>
      <td><button type="button" class="row-del" title="Remove part" aria-label="Remove part">✕</button></td>`;
    tr.querySelector('.row-del').addEventListener('click', () => tr.remove());
    els.pieceRows.appendChild(tr);
  }

  function readPieces() {
    return $$('#pieceRows tr').map((tr, i) => ({
      id: i,
      label: tr.querySelector('.p-label').value.trim() || `PART-${String(i + 1).padStart(2, '0')}`,
      w: +tr.querySelector('.p-w').value,
      h: +tr.querySelector('.p-h').value,
      qty: Math.max(1, +tr.querySelector('.p-qty').value || 1),
    })).filter(p => p.w > 0 && p.h > 0);
  }

  // ---------- Formatting ----------------------------------------------
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
    const pieces = readPieces();

    if (!config.sheetW || !config.sheetH || pieces.length === 0) {
      els.warnHost.innerHTML = `<div class="warn">Add a stock sheet size and at least one part before optimizing.</div>`;
      return;
    }

    const result = Optimizer.optimize(config, pieces);
    lastResult = result;
    render(result, +els.price.value || 0);
  }

  // ---------- Render ---------------------------------------------------
  function render(result, pricePerSheet) {
    const t = result.totals;
    els.empty.hidden = true;
    els.results.hidden = false;
    els.warnHost.innerHTML = result.rejected.length
      ? `<div class="warn">⚠ ${result.rejected.length} part(s) don't fit on the stock sheet and were skipped: ${
          [...new Set(result.rejected.map(r => r.label))].join(', ')}</div>`
      : '';

    // Stats strip
    const cost = t.sheetCount * pricePerSheet;
    els.stats.innerHTML = `
      <div class="stat blue"><div class="k">Sheets required</div><div class="v">${t.sheetCount}</div></div>
      <div class="stat"><div class="k">Parts placed</div><div class="v">${t.pieceCount}</div></div>
      <div class="stat blue"><div class="k">Material cost</div><div class="v">${fmtR(cost)}</div></div>
      <div class="stat"><div class="k">Utilization</div><div class="v">${fmtPct(t.utilizationPct)}</div></div>
      <div class="stat red"><div class="k">Waste</div><div class="v">${fmtPct(t.wastePct)} <small>${fmtM2(t.wasteArea)}</small></div></div>`;

    renderCharts(result);
    renderSheets(result);
  }

  // ---------- Charts (Chart.js) ----------------------------------------
  function renderCharts(result) {
    const t = result.totals;
    const css = getComputedStyle(document.documentElement);
    const C = (v) => css.getPropertyValue(v).trim();
    const mono = C('--mono');

    Chart.defaults.font.family = mono;
    Chart.defaults.color = C('--ink');

    charts.donut?.destroy();
    charts.donut = new Chart($('#donutChart'), {
      type: 'doughnut',
      data: {
        labels: ['Used material', 'Waste'],
        datasets: [{
          data: [t.usedArea, t.wasteArea],
          backgroundColor: [C('--timber'), C('--waste')],
          borderColor: C('--ink'),
          borderWidth: 1.5,
        }],
      },
      options: {
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtM2(c.raw)}` } },
        },
      },
    });

    charts.bars?.destroy();
    charts.bars = new Chart($('#barChart'), {
      type: 'bar',
      data: {
        labels: result.sheets.map(s => `Sheet ${String(s.index).padStart(2, '0')}`),
        datasets: [{
          label: 'Utilization %',
          data: result.sheets.map(s => +(s.utilization * 100).toFixed(1)),
          backgroundColor: C('--blue'),
          borderColor: C('--ink'),
          borderWidth: 1.5,
        }],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => v + '%' } },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  // ---------- Sheet technical drawings ---------------------------------
  function renderSheets(result) {
    const { sheetW, sheetH } = result.config;
    els.sheetsHost.innerHTML = '';

    result.sheets.forEach((sheet) => {
      const card = document.createElement('section');
      card.className = 'panel sheet-card';
      card.innerHTML = `
        <div class="panel-head">
          <h2>Sheet ${String(sheet.index).padStart(2, '0')}</h2>
          <span class="sheet-meta">${sheetW} × ${sheetH} mm · UTIL ${fmtPct(sheet.utilization)}</span>
        </div>
        <div class="sheet-canvas-wrap"><canvas class="sheet" aria-label="Cutting diagram for sheet ${sheet.index}"></canvas></div>
        <div class="panel-body">
          <table class="cutlist-table">
            <thead><tr><th>#</th><th>Part</th><th>X</th><th>Y</th><th>W</th><th>H</th><th>Rot</th></tr></thead>
            <tbody>${sheet.placements.map((p, i) => `
              <tr><td>${i + 1}</td><td>${p.label}</td>
                  <td>${p.x}</td><td>${p.y}</td><td>${p.w}</td><td>${p.h}</td>
                  <td>${p.rotated ? '<span class="rot">90°</span>' : '—'}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      els.sheetsHost.appendChild(card);
      drawSheet(card.querySelector('canvas'), sheet, sheetW, sheetH);
    });
  }

  function drawSheet(canvas, sheet, sheetW, sheetH) {
    const css = getComputedStyle(document.documentElement);
    const C = (v) => css.getPropertyValue(v).trim();

    const maxW = Math.min(canvas.parentElement.clientWidth - 8, 900);
    const scale = maxW / sheetW;
    const pad = 26; // room for dimension labels
    const w = Math.round(sheetW * scale) + pad * 2;
    const h = Math.round(sheetH * scale) + pad * 2;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const X = (mm) => pad + mm * scale;
    const Y = (mm) => pad + mm * scale;

    // paper + grid
    ctx.fillStyle = C('--paper');
    ctx.fillRect(pad, pad, sheetW * scale, sheetH * scale);
    ctx.strokeStyle = C('--line'); ctx.lineWidth = 0.5;
    const grid = 100; // 100 mm grid
    for (let gx = grid; gx < sheetW; gx += grid) {
      ctx.beginPath(); ctx.moveTo(X(gx), Y(0)); ctx.lineTo(X(gx), Y(sheetH)); ctx.stroke();
    }
    for (let gy = grid; gy < sheetH; gy += grid) {
      ctx.beginPath(); ctx.moveTo(X(0), Y(gy)); ctx.lineTo(X(sheetW), Y(gy)); ctx.stroke();
    }

    // pieces
    ctx.font = `${Math.max(9, 11 * Math.min(1, scale * 4))}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    sheet.placements.forEach((p) => {
      const px = X(p.x), py = Y(p.y), pw = p.w * scale, ph = p.h * scale;
      ctx.fillStyle = C('--timber');
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = C('--timber-deep'); ctx.lineWidth = 1.25;
      ctx.strokeRect(px, py, pw, ph);
      if (pw > 46 && ph > 26) {
        ctx.fillStyle = C('--ink');
        ctx.fillText(p.label, px + pw / 2, py + ph / 2 - 7, pw - 8);
        ctx.fillStyle = C('--timber-deep');
        ctx.fillText(`${p.w}×${p.h}`, px + pw / 2, py + ph / 2 + 7, pw - 8);
      }
    });

    // sheet border (drawn last, on top)
    ctx.strokeStyle = C('--ink'); ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, sheetW * scale, sheetH * scale);

    // dimension lines (drafting-blue)
    ctx.strokeStyle = C('--blue'); ctx.fillStyle = C('--blue');
    ctx.lineWidth = 1; ctx.font = '10px "IBM Plex Mono", monospace';
    // top width dim
    ctx.beginPath(); ctx.moveTo(X(0), pad - 12); ctx.lineTo(X(sheetW), pad - 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), pad - 16); ctx.lineTo(X(0), pad - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(sheetW), pad - 16); ctx.lineTo(X(sheetW), pad - 8); ctx.stroke();
    ctx.fillText(`${sheetW}`, X(sheetW / 2), pad - 18);
    // left height dim
    ctx.save();
    ctx.translate(pad - 12, Y(sheetH / 2)); ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${sheetH}`, 0, -6);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(pad - 12, Y(0)); ctx.lineTo(pad - 12, Y(sheetH)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad - 16, Y(0)); ctx.lineTo(pad - 8, Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad - 16, Y(sheetH)); ctx.lineTo(pad - 8, Y(sheetH)); ctx.stroke();
  }

  // ---------- CSV export ----------------------------------------------
  function exportCsv() {
    if (!lastResult) return;
    const rows = [['Sheet', 'Part', 'X_mm', 'Y_mm', 'W_mm', 'H_mm', 'Rotated']];
    lastResult.sheets.forEach(s =>
      s.placements.forEach(p =>
        rows.push([s.index, p.label, p.x, p.y, p.w, p.h, p.rotated ? 'YES' : 'NO'])));
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'cutlist.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Demo data ------------------------------------------------
  function loadDemo() {
    els.pieceRows.innerHTML = '';
    [
      ['CAB-TOP', 900, 600, 2],
      ['CAB-SIDE', 720, 580, 4],
      ['CAB-SHELF', 864, 560, 6],
      ['DOOR', 715, 447, 4],
      ['BACK-PANEL', 900, 720, 2],
      ['DRAWER-FRONT', 445, 175, 6],
    ].forEach(([l, w, h, q]) => addPieceRow(l, w, h, q));
  }

  // ---------- Wire up --------------------------------------------------
  els.addRow.addEventListener('click', () => addPieceRow());
  els.run.addEventListener('click', run);
  els.exportCsv.addEventListener('click', exportCsv);
  els.printBtn.addEventListener('click', () => window.print());
  els.loadDemo.addEventListener('click', () => { loadDemo(); run(); });

  // start with three blank rows
  addPieceRow(); addPieceRow(); addPieceRow();
})();
