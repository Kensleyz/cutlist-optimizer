# CutList Optimizer

Free, open-source cutting list optimizer that runs **100% in the browser** — no server, no signup, no cost. Host it on GitHub Pages and share the link.

**Live demo:** `https://YOUR-USERNAME.github.io/cutlist-optimizer/`

## What it does

Enter your stock sheet size and the parts you need to cut. The tool packs them onto as few sheets as possible and gives you:

- **Animated nesting** — watch parts land on the sheet one by one as the plan is computed
- **Stats dashboard** — count-up stat cards (sheets, cost in ZAR, utilization %, waste %) plus Chart.js doughnut + per-sheet utilization bars
- **Interactive cutting diagrams** — canvas technical drawings with a 100 mm grid and dimension lines; hover a part for a live tooltip, hover a cut-table row to highlight it on the sheet (and vice versa)
- **Color-coded parts** — every part label gets a stable color across the input list, diagrams, and cut tables
- **Cut table** — X/Y coordinates, sizes, and rotation flags per part
- **CSV export**, **print-friendly workshop sheet**, and `Ctrl+Enter` to optimize
- Fully responsive, keyboard-accessible, respects reduced-motion preferences

## How it works

- **Algorithm:** Shelf-based First-Fit Decreasing (FFD) 2D bin packing
- **Kerf:** saw blade width is added between every cut
- **Rotation:** optional 90° rotation (turn off when grain direction matters)
- **Validation:** parts too large for the stock are flagged, not silently dropped

Stack: vanilla JS + HTML + CSS, [Chart.js](https://www.chartjs.org/) via CDN. No build step.

```
cutlist-optimizer/
├── index.html
├── style.css
├── optimizer.js      ← pure algorithm, no DOM (reusable in Node)
└── app.js            ← UI, charts, canvas drawings, CSV export
```

## Deploy to GitHub Pages (free hosting)

1. Create a new repo on GitHub, e.g. `cutlist-optimizer`
2. Push these files:
   ```bash
   git init
   git add .
   git commit -m "CutList Optimizer v1.0"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/cutlist-optimizer.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / root → Save**
4. Wait ~1 minute. Your tool is live at `https://YOUR-USERNAME.github.io/cutlist-optimizer/`

## Run locally

Just open `index.html` in a browser. That's it.

## Reuse the engine elsewhere

`js/optimizer.js` has zero DOM dependencies:

```js
const Optimizer = require('./js/optimizer.js');

const result = Optimizer.optimize(
  { sheetW: 2440, sheetH: 1220, kerf: 3, allowRotation: true },
  [{ id: 0, label: 'SIDE', w: 720, h: 580, qty: 4 }]
);

console.log(result.totals.sheetCount, result.totals.wastePct);
```

## Roadmap ideas

- Guillotine / free-rectangle packing for higher utilization
- Grain direction per part
- Multiple stock sizes / offcut reuse
- Save projects to a shareable URL

## License

MIT — use it, fork it, sell services around it.
