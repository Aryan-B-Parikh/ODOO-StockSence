#!/usr/bin/env node
/**
 * StockSense accessibility regression guard — `npm run audit:a11y`
 * Dependency-free. Exits non-zero if ANY check fails.
 *
 * ============================================================================
 * RECONSTRUCTION NOTICE (2026-10-05)
 * The original revision of this file was LOST — it was never committed to git
 * (it predates the first commit that included `scripts/`), and it disappeared
 * from the working tree during a branch switch / cleanup. It is unrecoverable:
 * not in any commit, not in any dangling object, not on disk.
 *
 * This file was REBUILT from the specification preserved in
 * `docs/ux-accessibility-report.md` §5 and `docs/ux-accessibility-manifest.json`,
 * plus the source facts it asserts on. It preserves the documented structure:
 *
 *   section 1 .... 44 token contrast checks  (21 pairs x 2 themes + 2 focus-ring)
 *   section 2 .... 13 hard-coded colour pairs (source pattern re-asserted)
 *   section 3 .... 13 static guards SG-01..SG-13
 *   --------------------------------------------------------------- 70 checks
 *
 * It is NOT guaranteed to be check-for-check identical to the lost revision.
 * The counts and guard IDs match the documentation; the exact membership of
 * section 2 could not be recovered and was re-derived from current source.
 * See `ai/known-issues.md`.
 * ============================================================================
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// File reads resolve against ROOT, never process.cwd() — a bug fixed during the
// original UX pass (FOCUS_RING_ALPHA silently reported 100% from another cwd).
const read = (rel) => {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};
const globRead = (dir, exts) => {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.next' || e === '.git') continue;
      const f = join(d, e);
      let st;
      try { st = statSync(f); } catch { continue; }
      if (st.isDirectory()) walk(f);
      else if (exts.some((x) => e.endsWith(x))) out.push(f);
    }
  };
  walk(join(ROOT, dir));
  return out;
};

let failures = 0;
let passes = 0;
const results = [];

const pass = (section, id, detail = '') => {
  passes++;
  results.push({ section, id, ok: true, detail });
};
const fail = (section, id, detail) => {
  failures++;
  results.push({ section, id, ok: false, detail });
};
const skip = (section, id, detail) => {
  results.push({ section, id, ok: true, skipped: true, detail });
};

/* ==========================================================================
 * Colour maths — OKLCH -> linear sRGB -> relative luminance.
 *
 * The sRGB transfer function is applied INVERSE when decoding (linearisation)
 * before computing luminance. Skipping this step is what made the repository's
 * earlier, hand-rolled contrast audit produce false failures — never simplify
 * these functions.
 * ========================================================================== */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Parse `oklch(L C H)`, `oklch(L C H / A%)`, `#rrggbb` or `rgb()` -> {r,g,b,a} in 0..1 sRGB. */
function parseColor(str) {
  if (!str) return null;
  const s = String(str).trim();

  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const ok = /^oklch\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)$/i.exec(s);
  if (ok) {
    const L = parseFloat(ok[1]);
    const C = parseFloat(ok[2]);
    const H = (parseFloat(ok[3]) * Math.PI) / 180;
    const a = ok[4] !== undefined ? parseFloat(ok[4]) / 100 : 1;
    const labA = C * Math.cos(H);
    const labB = C * Math.sin(H);

    const l_ = L + 0.3963377774 * labA + 0.2158037573 * labB;
    const m_ = L - 0.1055613458 * labA - 0.0638541728 * labB;
    const s_ = L - 0.0894841775 * labA - 1.291485548 * labB;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const linR = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const linG = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const linB = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    const toSrgb = (v) => {
      const c = Math.min(1, Math.max(0, v));
      return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    };
    return { r: toSrgb(linR), g: toSrgb(linG), b: toSrgb(linB), a };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)%?\s*)?\)$/i.exec(s);
  if (rgb) {
    const f = (v) => (v > 1 ? v / 255 : v);
    return { r: f(parseFloat(rgb[1])), g: f(parseFloat(rgb[2])), b: f(parseFloat(rgb[3])), a: rgb[4] !== undefined ? parseFloat(rgb[4]) : 1 };
  }
  return null;
}

const flatten = (c, over) => {
  const base = over || { r: 1, g: 1, b: 1, a: 1 };
  return {
    r: c.r * c.a + base.r * (1 - c.a),
    g: c.g * c.a + base.g * (1 - c.a),
    b: c.b * c.a + base.b * (1 - c.a),
    a: 1,
  };
};

const luminance = (c) => {
  // sRGB -> linear, then Y. Do not skip the linearisation step.
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
};

const contrast = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

/* ==========================================================================
 * Token source
 * ========================================================================== */

const globalsCss = read('src/app/globals.css');
if (!globalsCss) {
  console.error('FATAL: src/app/globals.css not found — cannot audit.');
  process.exit(2);
}

function extractThemeTokens(selector) {
  // Anchored to line start: a bare indexOf('.dark') would match
  // `@custom-variant dark (&:is(.dark *))` at the top of the file and return the
  // @theme block's tokens instead of the real dark palette.
  const idx = globalsCss.search(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm'));
  if (idx < 0) return {};
  const start = globalsCss.indexOf('{', idx);
  let depth = 0;
  let end = start;
  for (let i = start; i < globalsCss.length; i++) {
    if (globalsCss[i] === '{') depth++;
    else if (globalsCss[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const block = globalsCss.slice(start, end);
  const tokens = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) tokens[m[1]] = m[2].trim();
  return tokens;
}

const lightTokens = extractThemeTokens(':root');
const darkTokens = extractThemeTokens('.dark');

/** Resolve a token name (with or without leading --) to a parsed colour. */
function tokenColor(tokens, name) {
  const raw = tokens[name.startsWith('--') ? name : `--${name}`];
  if (!raw) return null;
  const parsed = parseColor(raw);
  if (!parsed) return null;
  if (parsed.a < 1) {
    const backdrop = tokens['--background'];
    return flatten(parsed, parseColor(backdrop) || { r: 1, g: 1, b: 1, a: 1 });
  }
  return parsed;
}

/**
 * Focus-ring opacity is DERIVED FROM SOURCE, never hard-coded. If someone
 * reintroduces `ring-ring/60` or `outline-ring/40` the derived alpha drops and
 * the numeric check below fails, instead of the guard silently skipping it.
 */
function focusRingAlpha() {
  const files = globRead('src', ['.tsx', '.ts', '.css']);
  let best = 1;
  const hits = [];
  for (const f of files) {
    const c = readFileSync(f, 'utf8');
    const re = /(?:ring-ring|outline-ring|ring-foreground)\/(\d{1,3})/g;
    let m;
    while ((m = re.exec(c))) {
      const alpha = parseInt(m[1], 10) / 100;
      hits.push({ file: f.replace(ROOT + '/', ''), alpha });
      if (alpha < best) best = alpha;
    }
  }
  return { alpha: best, hits };
}

/* ==========================================================================
 * SECTION 1 — 44 token contrast checks (21 pairs x 2 themes + 2 focus-ring)
 * ========================================================================== */

const TOKEN_PAIRS = [
  // [foreground, background, minimum, label]
  ['foreground', 'background', 4.5, 'body text on page'],
  ['card-foreground', 'card', 4.5, 'text on cards'],
  ['popover-foreground', 'popover', 4.5, 'text in popovers/menus'],
  ['primary-foreground', 'primary', 4.5, 'label on primary actions'],
  ['secondary-foreground', 'secondary', 4.5, 'label on secondary actions'],
  ['muted-foreground', 'muted', 4.5, 'muted text on muted surfaces'],
  ['accent-foreground', 'accent', 4.5, 'text on accent surfaces'],
  ['destructive-foreground', 'destructive', 4.5, 'label on destructive actions'],
  ['muted-foreground', 'background', 4.5, 'muted text on page'],
  ['muted-foreground', 'card', 4.5, 'muted text on cards'],
  ['sidebar-foreground', 'sidebar', 4.5, 'sidebar text'],
  ['primary', 'background', 3.0, 'primary as UI accent on page'],
  ['destructive', 'background', 3.0, 'destructive as UI accent on page'],
  // UX-030/UX-031 (spec correction, not a product defect): this slot used to be
  // `['border', 'background', 3.0]`, which failed at 1.28:1 light / 1.20:1 dark.
  // That was MY error rebuilding the guard — WCAG 1.4.11 only requires 3:1 for a
  // boundary that is the *sole* means of identifying a control, and shadcn
  // controls use `--input` for that, which passes on the next line. A decorative
  // divider/card border is exempt, so asserting 3:1 on it was a false positive.
  // Replaced with a real, previously-unchecked scenario: popover text sitting
  // directly on the page background (menus that overflow their own surface).
  ['popover-foreground', 'background', 4.5, 'popover text over the page background'],
  ['input', 'background', 3.0, 'form-control boundary on page'],
  ['sidebar-primary', 'sidebar', 3.0, 'sidebar active indicator'],
  ['chart-1', 'card', 3.0, 'chart series 1'],
  ['chart-2', 'card', 3.0, 'chart series 2'],
  ['chart-3', 'card', 3.0, 'chart series 3'],
  ['chart-4', 'card', 3.0, 'chart series 4'],
  ['chart-5', 'card', 3.0, 'chart series 5'],
];

function section1() {
  const themes = [['light', lightTokens], ['dark', darkTokens]];
  for (const [theme, tokens] of themes) {
    for (const [fgName, bgName, min, label] of TOKEN_PAIRS) {
      const id = `TOK/${theme}/${fgName}/${bgName}`;
      const fg = tokenColor(tokens, fgName);
      const bg = tokenColor(tokens, bgName);
      if (!fg || !bg) {
        fail('1 token contrast', id, `missing token: ${!fg ? fgName : bgName} (${theme})`);
        continue;
      }
      const ratio = contrast(fg, bg);
      const detail = `${label}: ${ratio.toFixed(2)}:1 (min ${min}) [${theme}]`;
      if (ratio >= min) pass('1 token contrast', id, detail);
      else fail('1 token contrast', id, detail);
    }

    // Focus ring, alpha derived from source (2 checks, one per theme).
    const ringName = 'ring';
    const bgName = 'background';
    const fgRaw = tokenColor(tokens, ringName);
    const bg = tokenColor(tokens, bgName);
    const { alpha } = focusRingAlpha();
    const id = `FOCUS/${theme}`;
    if (!fgRaw || !bg) {
      fail('1 token contrast', id, 'missing ring/background token');
      continue;
    }
    const composited = flatten({ ...fgRaw, a: 1 }, bg); // ring drawn OVER the page
    const withAlpha = {
      r: fgRaw.r * alpha + bg.r * (1 - alpha),
      g: fgRaw.g * alpha + bg.g * (1 - alpha),
      b: fgRaw.b * alpha + bg.b * (1 - alpha),
      a: 1,
    };
    const ratio = contrast(withAlpha, bg);
    const min = 3.0;
    const detail = `focus ring at ${(alpha * 100).toFixed(0)}% opacity: ${ratio.toFixed(2)}:1 (min ${min}) [${theme}]`;
    void composited;
    if (ratio >= min) pass('1 token contrast', id, detail);
    else fail('1 token contrast', id, detail);
  }
}

/* ==========================================================================
 * SECTION 2 — 13 hard-coded colour pairs.
 * Each carries a source `pattern` re-asserted BEFORE measurement: if a refactor
 * removes the code, the check reports PATTERN-GONE rather than quietly passing.
 * Values come from the compiled Tailwind palette when `.next` exists, with a
 * hard-coded fallback so the script still runs on a clean checkout.
 * ========================================================================== */

// Fallbacks (Tailwind v4 default palette, OKLCH). Overridden by .next when present.
const FALLBACKS = {
  'emerald-400': 'oklch(0.765 0.177 163.225)',
  'emerald-500': 'oklch(0.696 0.17 162.48)',
  'emerald-600': 'oklch(0.596 0.145 163.225)',
  'emerald-700': 'oklch(0.508 0.118 165.612)',
  'amber-300': 'oklch(0.879 0.169 91.605)',
  'amber-400': 'oklch(0.828 0.189 84.429)',
  'amber-500': 'oklch(0.769 0.188 70.08)',
  'amber-600': 'oklch(0.666 0.157 58.318)',
  'amber-700': 'oklch(0.555 0.132 66.442)',
  'red-400': 'oklch(0.704 0.191 22.216)',
  'red-500': 'oklch(0.637 0.237 25.331)',
  'red-600': 'oklch(0.577 0.245 27.325)',
  'red-700': 'oklch(0.505 0.213 27.518)',
  'teal-400': 'oklch(0.777 0.152 181.912)',
  'teal-700': 'oklch(0.511 0.096 186.391)',
  'stone-300': 'oklch(0.869 0.005 96.71)',
  'stone-600': 'oklch(0.553 0.013 58.071)',
  'zinc-300': 'oklch(0.87 0.005 286.286)',
};

/** Read a Tailwind colour from compiled .next CSS, else the fallback. */
function tailwindColor(name) {
  const varName = `--color-${name}`;
  const dirs = ['.next'];
  for (const d of dirs) {
    const base = join(ROOT, d);
    if (!existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = readdirSync(dir); } catch { continue; }
      for (const e of entries) {
        const f = join(dir, e);
        let st;
        try { st = statSync(f); } catch { continue; }
        if (st.isDirectory()) stack.push(f);
        else if (e.endsWith('.css')) {
          try {
            const c = readFileSync(f, 'utf8');
            const re = new RegExp(`${varName}\\s*:\\s*([^;}]+)`);
            const m = re.exec(c);
            if (m) {
              const parsed = parseColor(m[1].trim());
              if (parsed) return { color: parsed, source: '.next compiled' };
            }
          } catch { /* unreadable */ }
        }
      }
    }
  }
  const fb = FALLBACKS[name];
  return fb ? { color: parseColor(fb), source: 'hard-coded fallback' } : { color: null, source: 'none' };
}

/** Composite a /10-alpha tint over an opaque surface, as the browser renders it. */
function tint(colorName, alpha, surface) {
  const { color, source } = tailwindColor(colorName);
  if (!color) return null;
  return { color: flatten({ ...color, a: alpha }, surface), source };
}

// [pattern, foreground class, alpha, background token, theme, min, label]
const COLOR_PAIRS = [
  ['text-emerald-400', 'emerald-400', 1, 'card', 'dark', 4.5, 'positive delta on dark card'],
  ['text-amber-400', 'amber-400', 1, 'card', 'dark', 4.5, 'warning delta on dark card'],
  ['text-red-400', 'red-400', 1, 'card', 'dark', 4.5, 'critical delta on dark card'],
  ['text-teal-400', 'teal-400', 1, 'card', 'dark', 4.5, 'neutral delta on dark card'],
  ['text-zinc-300', 'zinc-300', 1, 'card', 'dark', 4.5, 'label on dark card'],
  ['text-stone-300', 'stone-300', 1, 'card', 'dark', 4.5, 'label on dark card'],
  ['text-emerald-700', 'emerald-700', 1, 'card', 'light', 4.5, 'positive delta on light card'],
  ['text-amber-700', 'amber-700', 1, 'card', 'light', 4.5, 'warning delta on light card'],
  ['text-red-600', 'red-600', 1, 'card', 'light', 4.5, 'critical delta on light card'],
  ['text-teal-700', 'teal-700', 1, 'card', 'light', 4.5, 'neutral delta on light card'],
  ['text-stone-600', 'stone-600', 1, 'background', 'light', 4.5, 'secondary label on page'],
  // UX-034/UX-035: these were `text-emerald-600` / `text-amber-600`, measured at
  // 3.57:1 and 3.05:1 against the light page - a WCAG 1.4.3 failure for normal
  // text (e.g. the 11px link in login-view). The shades were darkened to -700,
  // which measures 5.13:1 and 4.69:1. The optional 8th element keeps the old
  // shade banned, so reverting the fix cannot pass as a removal.
  ['text-emerald-700', 'emerald-700', 1, 'background', 'light', 4.5, 'positive label on page', 'text-emerald-600'],
  ['text-amber-700', 'amber-700', 1, 'background', 'light', 4.5, 'warning label on page', 'text-amber-600'],
];

function section2() {
  const srcFiles = globRead('src', ['.tsx', '.ts']);
  const sources = srcFiles.map((f) => ({ f, c: readFileSync(f, 'utf8') }));

  for (const [pattern, colorName, alpha, bgToken, theme, min, label, forbidden] of COLOR_PAIRS) {
    const id = `PAIR/${pattern}`;
    const present = sources.filter((s) => s.c.includes(pattern));
    if (present.length === 0) {
      // Deliberately loud: a refactor that removes the code must not look like a pass.
      fail('2 colour pairs', id, `PATTERN-GONE — no file under src/ contains "${pattern}"`);
      continue;
    }
    // Anti-regression: the shade this pair was darkened away from must stay gone.
    // (Without this, "fixing" the finding by reverting the colour would be
    // indistinguishable from deleting it.)
    if (forbidden) {
      const reverted = sources.filter((s) => s.c.includes(forbidden));
      if (reverted.length > 0) {
        fail('2 colour pairs', id, `REGRESSED — "${forbidden}" is back in ${reverted.length} file(s) (min ${min}:1, below WCAG 1.4.3)`);
        continue;
      }
    }
    const tokens = theme === 'dark' ? darkTokens : lightTokens;
    const bg = tokenColor(tokens, bgToken);
    const fg = tint(colorName, alpha, bg);
    if (!bg || !fg?.color) {
      fail('2 colour pairs', id, `could not resolve colours (${fg?.source ?? 'unknown'})`);
      continue;
    }
    const ratio = contrast(fg.color, bg);
    const detail = `${label}: ${ratio.toFixed(2)}:1 (min ${min}) — ${present.length} source file(s), colour via ${fg.source}`;
    if (ratio >= min) pass('2 colour pairs', id, detail);
    else fail('2 colour pairs', id, detail);
  }
}

/* ==========================================================================
 * SECTION 3 — 13 static guards (SG-01 .. SG-13)
 * ========================================================================== */

const KNOWN_OPEN = {
  // SG-13 exceptions. Each entry names a deferred UX finding; the entry drops
  // out of this set automatically once the fix lands, so it cannot go stale.
  'src/components/auth/login-view.tsx': 'UXA-025',
};

function section3() {
  const checks = [];
  const tsx = globRead('src', ['.tsx', '.ts']);
  const tsxSources = tsx.map((f) => ({ rel: f.slice(ROOT.length + 1).replace(/\\/g, '/'), c: readFileSync(f, 'utf8') }));

  // SG-01 — page zoom is not disabled (WCAG 1.4.4)
  {
    const layout = read('src/app/layout.tsx') || '';
    const viewportBlock = /export\s+const\s+viewport[\s\S]{0,400}?};/.exec(layout)?.[0] || layout;
    const bad = /user-scalable\s*:\s*["']?no|maximum-scale\s*:\s*["']?(?!1\b)\d/.test(viewportBlock);
    checks.push(bad ? ['SG-01', false, 'viewport disables zoom (user-scalable/maximum-scale)'] : ['SG-01', true, 'viewport leaves zoom enabled']);
  }

  // SG-02 — skip link to the main region exists
  {
    const shell = tsxSources.find((s) => s.rel.endsWith('shell/app-shell.tsx'));
    const ok = !!shell && /href="#main-content"/.test(shell.c) && /Skip to main content/i.test(shell.c);
    checks.push(ok ? ['SG-02', true, 'skip link present in app shell'] : ['SG-02', false, 'no #main-content skip link found']);
  }

  // SG-03 — skip link precedes the navigation landmarks in source order
  {
    const shell = tsxSources.find((s) => s.rel.endsWith('shell/app-shell.tsx'));
    if (!shell) checks.push(['SG-03', false, 'app-shell.tsx not found']);
    else {
      const skipAt = shell.c.indexOf('href="#main-content"');
      const navAt = shell.c.indexOf('<Sidebar');
      const ok = skipAt >= 0 && navAt >= 0 && skipAt < navAt;
      checks.push(ok ? ['SG-03', true, `skip link at ${skipAt} precedes nav at ${navAt}`] : ['SG-03', false, `skip link ${skipAt} vs nav ${navAt}`]);
    }
  }

  // SG-04 — focus indicator is not drawn at reduced opacity
  {
    const { alpha, hits } = focusRingAlpha();
    const ok = hits.length === 0 || alpha >= 0.6;
    checks.push(ok
      ? ['SG-04', true, `focus ring alpha ${(alpha * 100).toFixed(0)}% across ${hits.length} source hit(s)`]
      : ['SG-04', false, `focus ring drawn at ${(alpha * 100).toFixed(0)}% opacity — reintroduced ring-ring/${Math.round(alpha * 100)}`]);
  }

  // SG-05 — mobile bottom navigation marks the current destination
  {
    const nav = tsxSources.find((s) => s.rel.includes('mobile-bottom-nav'));
    const n = nav ? (nav.c.match(/aria-current=/g) || []).length : 0;
    checks.push(n > 0 ? ['SG-05', true, `${n} aria-current bindings in mobile bottom nav`] : ['SG-05', false, 'no aria-current in mobile bottom nav']);
  }

  // SG-06 — desktop sidebar marks the current destination
  {
    const side = tsxSources.find((s) => s.rel.endsWith('sidebar.tsx'));
    const n = side ? (side.c.match(/aria-current=/g) || []).length : 0;
    checks.push(n > 0 ? ['SG-06', true, `${n} aria-current binding(s) in sidebar`] : ['SG-06', false, 'no aria-current in sidebar']);
  }

  // SG-07 — view changes move focus and announce (incl. the modal guard)
  {
    const shell = tsxSources.find((s) => s.rel.endsWith('shell/app-shell.tsx'));
    if (!shell) checks.push(['SG-07', false, 'app-shell.tsx not found']);
    else {
      const focuses = /\.focus\(\)/.test(shell.c) || /focus\(\)/.test(shell.c);
      const announces = /role="status"/.test(shell.c) && /aria-live="polite"/.test(shell.c);
      checks.push(focuses && announces
        ? ['SG-07', true, 'focus() on view change + sr-only live region present']
        : ['SG-07', false, `focus=${focuses} announce=${announces}`]);
    }
  }

  // SG-08 — document title tracks the active view
  {
    const hits = tsxSources.filter((s) => /document\.title\s*=/.test(s.c)).length;
    checks.push(hits > 0 ? ['SG-08', true, `${hits} file(s) assign document.title`] : ['SG-08', false, 'no document.title assignment']);
  }

  // SG-09 — continuous animation respects prefers-reduced-motion
  {
    const css = globalsCss || '';
    const hasQuery = /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css);
    const killsLoop = hasQuery && /animation:\s*none/.test(css);
    checks.push(killsLoop ? ['SG-09', true, 'prefers-reduced-motion block disables looping animations'] : ['SG-09', false, 'reduced-motion block missing or does not stop animation']);
  }

  // SG-10 — fixed bottom tab bar does not cover page content
  {
    const has = /\.bottom-nav-space\s*\{/.test(globalsCss || '') && /padding-bottom/.test(globalsCss || '');
    checks.push(has ? ['SG-10', true, '.bottom-nav-space reserves padding-bottom'] : ['SG-10', false, 'no .bottom-nav-space clearance']);
  }

  // SG-11 — every <th> declares scope, and TableHead still defaults it
  {
    const table = tsxSources.find((s) => s.rel.endsWith('ui/table.tsx'));
    const defaults = !!table && /scope\s*=\s*["']col["']/.test(table.c) && /scope=\{scope\}/.test(table.c);
    const rawTh = tsxSources
      .filter((s) => !s.rel.endsWith('ui/table.tsx'))
      .filter((s) => /<th[\s>]/.test(s.c));
    const bad = rawTh.filter((s) => !/scope\s*=/.test(s.c));
    const ok = defaults && bad.length === 0;
    checks.push(ok
      ? ['SG-11', true, `TableHead defaults scope="col"; ${rawTh.length} raw <th> all scoped`]
      : ['SG-11', false, `default=${defaults}, unscoped raw <th> in: ${bad.map((b) => b.rel).join(', ') || 'none'}`]);
  }

  // SG-12 — FormMessage still carries a live-region role
  {
    const form = tsxSources.find((s) => s.rel.endsWith('ui/form.tsx'));
    const ok = !!form && /function\s+FormMessage/.test(form.c) && /role=\{error\s*\?\s*'alert'/.test(form.c);
    checks.push(ok ? ['SG-12', true, 'FormMessage announces validation errors via role="alert"'] : ['SG-12', false, 'FormMessage lost its live-region role']);
  }

  // SG-13 — every control setting aria-invalid links its visible error
  {
    const offenders = [];
    let checked = 0;
    for (const s of tsxSources) {
      const expr = /aria-invalid=\{/.test(s.c); // JSX expression, not a CSS utility
      if (!expr) continue;
      checked++;
      const hasLink = /aria-describedby=\{/.test(s.c) || /aria-describedby="/.test(s.c);
      if (!hasLink) {
        const known = KNOWN_OPEN[s.rel];
        if (!known) offenders.push(s.rel);
        else offenders.push(`${s.rel} (known-open ${known})`);
      }
    }
    const blocking = offenders.filter((o) => !o.includes('known-open'));
    const ok = checked > 0 && blocking.length === 0;
    const note = offenders.length ? ` — ${offenders.join('; ')}` : '';
    checks.push(ok
      ? ['SG-13', true, `${checked} aria-invalid control file(s) linked${note}`]
      : ['SG-13', false, `unlinked aria-invalid: ${blocking.join(', ')}${note}`]);
  }

  for (const [id, ok, detail] of checks) {
    if (ok) pass('3 static guards', id, detail);
    else fail('3 static guards', id, detail);
  }
}

/* ==========================================================================
 * Run
 * ========================================================================== */

section1();
section2();
section3();

const bySection = {};
for (const r of results) {
  bySection[r.section] ||= { pass: 0, fail: 0 };
  bySection[r.section][r.ok ? 'pass' : 'fail']++;
}

console.log('');
console.log('StockSense accessibility regression guard (scripts/audit-a11y.mjs)');
console.log('='.repeat(78));
for (const [section, v] of Object.entries(bySection)) {
  console.log(`  ${section.padEnd(20)} ${String(v.pass).padStart(3)} pass  ${String(v.fail).padStart(3)} fail`);
}
console.log('='.repeat(78));

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.log('\nFAILURES:\n');
  for (const f of failed) console.log(`  FAIL  [${f.section}] ${f.id}\n        ${f.detail}`);
  console.log(`\n${failures} of ${results.length} checks failed.`);
  process.exit(1);
}

if (process.env.A11Y_VERBOSE) {
  console.log('');
  for (const r of results) console.log(`PASS  ${r.id.padEnd(34)} ${r.detail}`);
}
console.log('\nALL CHECKS PASS');
console.log(`${passes} checks passed, 0 failed.`);
