/**
 * Theme Registry — provides themed CSS overrides for benchmark HTML reports.
 *
 * Each theme defines: CSS variables, font imports, body background treatments,
 * frame/border styles, and scanline effects.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface Theme {
  name: string;
  description: string;
  fontImport: string;
  cssVariables: string;
  bodyExtra: string;
  scanlineOverride: string;
  frameOverride: string;
}

const THEMES: Record<string, Theme> = {
  'arwes': {
    name: 'Arwes',
    description: 'Default sci-fi cyan/teal theme',
    fontImport: `@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');`,
    cssVariables: `
:root {
  --bg: #020810;
  --bg2: #061018;
  --cyan: #00f0ff;
  --cyan-dim: rgba(0,240,255,0.15);
  --cyan-glow: rgba(0,240,255,0.4);
  --teal: #00d4aa;
  --magenta: #ff00aa;
  --amber: #ffbb00;
  --red: #ff3355;
  --text: #b0d4e8;
  --text-bright: #e0f4ff;
  --mono: 'Share Tech Mono', monospace;
  --display: 'Orbitron', sans-serif;
}`,
    bodyExtra: '',
    scanlineOverride: '',
    frameOverride: '',
  },

  'codex-seraphinianus': {
    name: 'Codex Seraphinianus',
    description: 'Surreal botanical manuscript — parchment, sepia ink, alien flora marginalia',
    fontImport: `@import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Uncial+Antiqua&family=MedievalSharp&display=swap');`,
    cssVariables: `
:root {
  --bg: #1a1510;
  --bg2: #231e16;
  --cyan: #c4956a;
  --cyan-dim: rgba(196,149,106,0.18);
  --cyan-glow: rgba(196,149,106,0.35);
  --teal: #8b9e6b;
  --magenta: #9e4a5c;
  --amber: #d4a234;
  --red: #a83232;
  --text: #c8b89a;
  --text-bright: #ede0c8;
  --mono: 'IM Fell English', serif;
  --display: 'Uncial Antiqua', cursive;
}`,
    bodyExtra: `
body {
  background-image:
    radial-gradient(ellipse at 15% 20%, rgba(139,158,107,0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 75%, rgba(158,74,92,0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(196,149,106,0.03) 0%, transparent 70%);
}
body::before {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cpath d='M200 50 C180 80 160 130 170 180 C175 210 195 230 200 260 C205 230 225 210 230 180 C240 130 220 80 200 50Z' fill='none' stroke='rgba(139,158,107,0.04)' stroke-width='1'/%3E%3Cpath d='M200 260 C185 270 165 290 175 310 C180 320 195 325 200 330 C205 325 220 320 225 310 C235 290 215 270 200 260Z' fill='none' stroke='rgba(139,158,107,0.03)' stroke-width='1'/%3E%3Ccircle cx='200' cy='180' r='30' fill='none' stroke='rgba(196,149,106,0.03)' stroke-width='0.5'/%3E%3Ccircle cx='200' cy='180' r='50' fill='none' stroke='rgba(196,149,106,0.02)' stroke-width='0.5'/%3E%3Cpath d='M150 180 C160 160 180 150 200 150 C220 150 240 160 250 180' fill='none' stroke='rgba(139,158,107,0.03)' stroke-width='0.5'/%3E%3Cpath d='M150 180 C160 200 180 210 200 210 C220 210 240 200 250 180' fill='none' stroke='rgba(139,158,107,0.03)' stroke-width='0.5'/%3E%3C/svg%3E") center/400px 400px repeat;
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}
#app { position: relative; z-index: 1; }
`,
    scanlineOverride: `
#scanline {
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(196,149,106,0.015) 3px,
    rgba(196,149,106,0.015) 4px
  );
  animation: none;
  opacity: 0.6;
}`,
    frameOverride: `
.frame {
  border: 1px solid rgba(196,149,106,0.25);
  border-radius: 2px;
  background: linear-gradient(135deg, rgba(26,21,16,0.95), rgba(35,30,22,0.9));
  box-shadow: inset 0 0 30px rgba(196,149,106,0.04);
}
.frame:hover {
  border-color: var(--cyan);
  box-shadow: 0 0 15px rgba(196,149,106,0.1), inset 0 0 25px rgba(196,149,106,0.06);
}
.frame-corner {
  border-color: var(--cyan);
}
.frame:hover .frame-corner {
  box-shadow: 0 0 6px var(--cyan-glow);
}
h1, h2, .panel-title {
  letter-spacing: 3px;
}
.header-content h1 {
  text-shadow: 0 0 15px rgba(196,149,106,0.3), 0 0 30px rgba(196,149,106,0.1);
}
.score-ring .ring-fill { stroke: var(--cyan); }
.score-ring .ring-bg { stroke: var(--cyan-dim); }
`,
  },
};

export function getActiveThemeName(): string {
  try {
    const configPath = join(process.cwd(), '.a5c/plugins/themes/active-theme.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.theme || 'arwes';
  } catch {
    return 'arwes';
  }
}

export function getTheme(name?: string): Theme {
  const themeName = name ?? getActiveThemeName();
  return THEMES[themeName] ?? THEMES['arwes'];
}

export function getThemeCSS(name?: string): string {
  const theme = getTheme(name);
  return [
    theme.fontImport,
    theme.cssVariables,
    theme.bodyExtra,
    theme.scanlineOverride,
    theme.frameOverride,
  ].filter(Boolean).join('\n');
}

export function listThemes(): Array<{ name: string; description: string }> {
  return Object.entries(THEMES).map(([key, t]) => ({
    name: key,
    description: t.description,
  }));
}
