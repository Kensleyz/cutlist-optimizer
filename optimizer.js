/**
 * CutList Optimizer — core engine
 * Shelf-based First-Fit Decreasing (FFD) 2D bin packing
 * with piece rotation and saw-kerf compensation.
 *
 * Pure functions, no DOM. Reusable in Node or browser.
 */

const Optimizer = (() => {

  /**
   * @param {Object} config
   * @param {number} config.sheetW      Stock sheet width (mm)
   * @param {number} config.sheetH      Stock sheet height (mm)
   * @param {number} config.kerf        Saw blade kerf (mm)
   * @param {boolean} config.allowRotation
   * @param {Array}  pieces  [{ id, label, w, h, qty }]
   * @returns {Object} result
   */
  function optimize(config, pieces) {
    const { sheetW, sheetH, kerf, allowRotation } = config;

    // --- 1. Expand quantities & validate -------------------------------
    const expanded = [];
    const rejected = [];
    for (const p of pieces) {
      for (let i = 1; i <= p.qty; i++) {
        const item = { ...p, uid: `${p.label}_${i}` };
        const fitsNormal  = p.w <= sheetW && p.h <= sheetH;
        const fitsRotated = allowRotation && p.h <= sheetW && p.w <= sheetH;
        if (fitsNormal || fitsRotated) expanded.push(item);
        else rejected.push(item);
      }
    }

    // --- 2. Sort: First-Fit DECREASING (largest first) -----------------
    expanded.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h));

    // --- 3. Pack onto sheets using shelves -----------------------------
    const sheets = [];

    const newSheet = () => {
      const s = { shelves: [], usedY: 0, placements: [] };
      sheets.push(s);
      return s;
    };

    const tryPlaceOnShelf = (sheet, shelf, w, h) => {
      if (h > shelf.height) return null;                 // too tall for this shelf
      if (shelf.usedX + w > sheetW) return null;         // no horizontal room
      const pos = { x: shelf.usedX, y: shelf.y };
      shelf.usedX += w + kerf;
      return pos;
    };

    const tryNewShelf = (sheet, w, h) => {
      if (sheet.usedY + h > sheetH) return null;         // no vertical room
      if (w > sheetW) return null;
      const shelf = { y: sheet.usedY, height: h, usedX: 0 };
      sheet.shelves.push(shelf);
      sheet.usedY += h + kerf;
      const pos = { x: 0, y: shelf.y };
      shelf.usedX = w + kerf;
      return pos;
    };

    const placePiece = (item) => {
      // orientations to try: [w,h] and rotated [h,w]
      const orientations = [{ w: item.w, h: item.h, rotated: false }];
      if (allowRotation && item.w !== item.h) {
        orientations.push({ w: item.h, h: item.w, rotated: true });
      }

      // Pass 1: existing sheets, existing shelves
      for (const sheet of sheets) {
        for (const shelf of sheet.shelves) {
          for (const o of orientations) {
            const pos = tryPlaceOnShelf(sheet, shelf, o.w, o.h);
            if (pos) return record(sheet, item, o, pos);
          }
        }
        // Pass 2: existing sheets, new shelf
        for (const o of orientations) {
          const pos = tryNewShelf(sheet, o.w, o.h);
          if (pos) return record(sheet, item, o, pos);
        }
      }
      // Pass 3: brand new sheet
      const sheet = newSheet();
      for (const o of orientations) {
        const pos = tryNewShelf(sheet, o.w, o.h);
        if (pos) return record(sheet, item, o, pos);
      }
      return false; // should not happen (validated earlier)
    };

    const record = (sheet, item, o, pos) => {
      sheet.placements.push({
        uid: item.uid, label: item.label,
        x: pos.x, y: pos.y, w: o.w, h: o.h,
        rotated: o.rotated
      });
      return true;
    };

    expanded.forEach(placePiece);

    // --- 4. Stats ------------------------------------------------------
    const sheetArea = sheetW * sheetH;
    const sheetStats = sheets.map((s, i) => {
      const used = s.placements.reduce((a, p) => a + p.w * p.h, 0);
      return {
        index: i + 1,
        placements: s.placements,
        usedArea: used,
        wasteArea: sheetArea - used,
        utilization: used / sheetArea
      };
    });

    const totalUsed  = sheetStats.reduce((a, s) => a + s.usedArea, 0);
    const totalArea  = sheetArea * sheets.length;

    return {
      config,
      sheets: sheetStats,
      rejected,
      totals: {
        pieceCount: expanded.length,
        sheetCount: sheets.length,
        usedArea: totalUsed,
        totalArea,
        wasteArea: totalArea - totalUsed,
        wastePct: totalArea ? (totalArea - totalUsed) / totalArea : 0,
        utilizationPct: totalArea ? totalUsed / totalArea : 0
      }
    };
  }

  return { optimize };
})();

// Node export for tests / reuse
if (typeof module !== 'undefined') module.exports = Optimizer;
