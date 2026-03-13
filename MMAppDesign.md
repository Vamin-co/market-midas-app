# MMAppDesign.md — Market Midas Mac Application Design System
### Companion to MMDesign.md · App-Native Interaction Patterns · Single Source of Truth

> This document extends `MMDesign.md` for the desktop application context. All color tokens, typography, and component shapes are inherited from `MMDesign.md` and are not repeated here. This document defines **what `MMDesign.md` cannot**: screen hierarchy, user flow, state variations, app-native motion, and interaction patterns.

---

## 0. Core Design Philosophy for the App

The website achieved its cinematic quality through **scroll pacing** — content revealed itself as the user moved through time. The app cannot use scroll as a metaphor. Its equivalent must come from **data drama**: the feeling that something real and consequential is happening, right now, on your machine.

The three principles that replace scroll-based cinema in the app:

1. **Purposeful latency** — When agents are working, show it. Streaming text, live timers, animated conviction meters. Never show a spinner when you can show progress.
2. **Consequence clarity** — Every destructive or financial action (execute, abort, close position) requires a deliberate second gesture. The UI physically makes you reach further to confirm.
3. **Mode permanence** — The user always knows whether they are in Paper or Live mode. This is never ambiguous, never hidden, never one tap away from confusion.

---

## 1. Application Shell

### 1.1 Layout Structure

```
┌────────────────────────────────────────────────────────────────────┐
│  [Title Bar h-8 — full width drag region — Bell icon top right]    │
├──────────────┬─────────────────────────────────────────────────────┤
│  [Sidebar    │  [Main Content Area — fills remainder]              │
│   64px]      │                                                     │
│              │  [Screen renders here]                              │
│  Analyze ←nav│                                                     │
│  Positions   │                                                     │
│  Settings    │                                                     │
│  ─────       │                                                     │
│  [MODE BADGE]│                                                     │
│              │                                                     │
└──────────────┴─────────────────────────────────────────────────────┘
```

**Removed from sidebar:** Paper Wallet (merged into Positions), Alerts (moved to bell panel in title bar)

### 1.2 macOS Window Ergonomics

The app is a native macOS window. The top of every screen must reserve space for the OS traffic light controls.

- **Title bar:** `h-8 w-full` strip at the very top of the window. Set `-webkit-app-region: drag`. Contains only the bell icon (top right, `-webkit-app-region: no-drag`).
- **Sidebar top padding:** First `40px` of sidebar is padding only — no icons. Traffic lights sit at approximately `x:12, y:12` and must never overlap sidebar content.
- **First sidebar icon** starts at `y: 48px` from top of sidebar.
- Main content area begins below the `h-8` title bar.

### 1.3 Bell Icon (Title Bar — Top Right)

The bell icon lives in the title bar, positioned `absolute right-3 top-1/2 -translate-y-1/2`.

- Size: 14px (lucide-react Bell)
- Wrapper: `w-7 h-7 flex items-center justify-center rounded-md`
- Hover: `bg-[#FAFAF9]/10 transition-colors duration-200`
- Cursor: `default` (not pointer — native app feel)
- Rest state: `text-[#FAFAF9]/40`
- Has active alerts: `text-[#FAFAF9]/70`
- Has triggered alerts: `text-[#CA8A04]`
- Gold dot: `w-1.5 h-1.5 rounded-full bg-[#CA8A04] absolute top-1 right-1 animate-pulse` — only when triggered alerts exist
- Tooltip: "Alerts" shown on hover, `text-[10px] bg-[#1C1917] text-[#FAFAF9] px-2 py-1 rounded absolute top-full right-0 mt-1`
- onClick: dispatches `toggle-alerts-panel`
- Color logic reads from AppContext:
  ```typescript
  const hasTriggered = alerts.some(a => a.triggered)
  const hasActive = alerts.some(a => a.active)
  ```

### 1.4 Sidebar Specification & Ambient Mode System

The two modes are distinguished through **color temperature**, not badges or alarms.

- **Background:** `bg-[#141210]` (Deep Slate)
- **Width:** Fixed `64px`. No expanded state. Labels appear as tooltips on hover.
- **Nav icons:** 24px, `text-[#FAFAF9]/40` at rest → `text-[#FAFAF9]` on hover → `text-[#CA8A04]` when active
- **Active route indicator:** 2px left border `border-l-2 border-[#CA8A04]`
- **Nav items:** Analyze, Positions, Settings only

**Paper mode ambient treatment:**
- Sidebar right edge: `border-r border-[#CA8A04]/20` — warm gold breath
- Mode indicator: `PAPER` in `text-[10px] font-bold uppercase tracking-widest text-[#CA8A04]/60`

**Live mode ambient treatment:**
- Sidebar right edge: `border-r border-[#FAFAF9]/10` — cool, neutral
- Mode indicator: `● LIVE` — dot in `text-[#27c93f]`, text in `text-[10px] font-bold uppercase tracking-widest text-[#FAFAF9]/60`

> **Why green for Live, not red:** Red is reserved exclusively for negative P&L and destructive actions. Green signals "active and connected."

### 1.5 Alerts Panel (Global Overlay — Focused Mode)

The alerts panel is a focused overlay. When open, the entire app enters a paused state.

**Backdrop:**
- `fixed inset-0 z-40`
- `background: rgba(28,25,23,0.4)`
- `backdrop-filter: blur(12px)` + `-webkit-backdrop-filter: blur(12px)`
- Covers everything including sidebar and title bar
- onClick: dispatches `toggle-alerts-panel` to close

**Panel:**
- `fixed top-[32px] right-0 bottom-0 w-[380px] z-50`
- `background: #FAFAF9`
- `border-left: 1px solid rgba(28,25,23,0.08)`
- `box-shadow: -8px 0 32px rgba(28,25,23,0.12)`
- No border radius on right edge (flush with screen)
- Slide in: `translateX(100%) → translateX(0)` over `300ms cubic-bezier(0.25,0.46,0.45,0.94)`

**Panel header:**
- `h-14 px-6 flex items-center justify-between border-b border-[#1C1917]/8`
- "Alerts" in Bodoni Moda `text-xl text-[#1C1917]`
- × close button

**Alert row cards:**
- `bg-white rounded-2xl border border-[#1C1917]/5 shadow-sm p-4 mb-3`
- Ticker: Bodoni Moda `text-lg text-[#1C1917]`
- Type badge: `text-[9px] uppercase tracking-widest text-[#44403C]/50`
- Active: `● ACTIVE text-[#27c93f] text-[9px] font-bold uppercase tracking-widest`
- Paused: `○ PAUSED text-[#44403C]/40 text-[9px] uppercase tracking-widest`
- Delete: `× text-[#44403C]/30 hover:text-[#ff5f56] transition-colors`
- Progress bar: `w-full h-1 bg-[#1C1917]/8 rounded-full` — fill `bg-[#CA8A04]`, turns `bg-[#ff5f56]` within 10% of trigger

**Panel footer:**
- ADD ALERT + button: `bg-[#CA8A04] text-[#1C1917] w-full py-3 rounded-xl font-bold uppercase tracking-widest text-xs`
- onClick: dispatches `open-alert-modal`

**Empty state:**
- Centered: Bodoni Moda `text-xl text-[#1C1917]/30` "No alerts"
- Subtext: `text-xs text-[#44403C]/40` "Set an alert from any position or after analyzing"

**Event listeners:**
- `toggle-alerts-panel` — opens OR closes (bell icon only)
- `open-alerts-panel` — always opens, never closes (used after modal POST)

**Closes automatically when:**
- Backdrop is clicked
- Pathname changes (usePathname hook)

### 1.6 App-Level Motion

| Moment | Animation | Duration | Easing |
|--------|-----------|----------|--------|
| Screen transition | `opacity 0→1` | `150ms` | `ease-out` |
| Card mount | `translateY(8px)→0, opacity 0→1` | `300ms` | `ease-out` |
| Alerts panel slide | `translateX(100%)→0` | `300ms` | `cubic-bezier(0.25,0.46,0.45,0.94)` |
| Onboarding step | `translateX(100%)→0` | `200ms` | `ease` |
| Conviction meter fill | `width 0→final` | `600ms` | `ease-out` |
| P&L color change | `color transition` | `500ms` | `ease-in-out` |
| Trade confirmed checkmark | `stroke-dashoffset draw` | `500ms` | `ease-in-out` |
| Agent step completion (●) | `opacity 0→1` | `200ms` | `ease-out` |
| Button hover | `scale 1→1.03` | `300ms` | `cubic-bezier(0.25,0.46,0.45,0.94)` |
| Button active | `scale →0.98` | `100ms` | `ease-in` |

**Never animated:** Layout shifts, sidebar, prices updating, loading spinners.

---

## 2. Add Alert Modal (Global)

Mounted in layout.tsx. Listens to `open-alert-modal` event.

- Captures `detail: { ticker }` to pre-fill ticker input
- Two tabs: Stop Loss (%) and Price Target ($)
- On POST success: call `fetchAlerts()`, close modal, dispatch `open-alerts-panel`
- Backdrop: same blur pattern as alerts panel
- Card: `bg-white rounded-2xl shadow-2xl p-8 w-[480px]`

---

## 3. Screen: Analyze (Home Screen)

First screen after login/onboarding. Cursor focused on search input immediately.

### 3.1 Empty State
```
What would you like to analyze?   [Bodoni Moda, large]

  ┌──────────────────────────────────┐
  │  $ TICKER SYMBOL              →  │
  └──────────────────────────────────┘

Recent: NVDA  AAPL  TSLA
```
- Input: `bg-white border border-[#1C1917]/10 rounded-md px-6 py-4 font-sans text-lg uppercase tracking-widest`
- On focus: `border-[#CA8A04] transition duration-300`
- Submit on Enter or arrow button

### 3.2 Loading State
3-step sequential indicator. Never a spinner.

### 3.3 Results State
Three cards: Price card, Recommendation card, Action bar.

Below Recommendation card: `"Set Alert →"` text link
- Dispatches `open-alert-modal` with current ticker
- Style: `text-xs text-[#44403C]/50 hover:text-[#CA8A04] transition-colors cursor-default`

---

## 4. Screen: Debate Session (`/debate`)

Side-by-side Bull/Bear panels. Sequential streaming — Bull types first.

- Conviction meters animate `0 → final` over `600ms` after each agent completes
- Color logic: >10pt diff = green/red, within 10pt = gold
- Final Verdict card: dark theme, `translateY` entrance, BUY/SELL/HOLD colored
- Bottom bar: ABORT (left, red ghost) + PROCEED TO TRADE (right, gold)
- ABORT navigates back to `/?ticker=` preserving ticker

---

## 5. Screen: Trade Execution (`/trade`)

Recommendation + ownership passed as URL params: `/trade?ticker=X&action=BUY&owned=false`

**BUY/SELL/HOLD logic:**
- Not owned + BUY → EXECUTE TRADE (gold, right)
- Not owned + HOLD/SELL → "Trade anyway →" subtle link only
- Owned + BUY → ADD TO POSITION
- Owned + SELL → EXECUTE TRADE
- Owned + HOLD → SET ALERT as primary action

**Three states:**
1. Order Review — ticker, shares, price, total, buying power with freshness indicator
2. Execution in progress:
   - Paper mode: "Simulating trade..." (not Robinhood checklist)
   - Live mode: 4-step Playwright progress
3. Trade Confirmed — SVG checkmark draw animation, "Trade Executed"

ABORT always left, execute always right. Never reversed.

---

## 6. Screen: Positions (`/positions`)

Two-column master/detail layout. No outer scroll.

**Left column (w-72):**
- Portfolio summary
- SVG donut chart (pure SVG, no library) — segments per ticker, color cycle, center shows count
- Compact position list — only tickers where totalShares > 0

**Right column:**
- Empty state: "Select a position"
- Detail view on click: ticker (Bodoni Moda text-5xl), P&L, days held, stats row, order history
- Action bar: ADD TO POSITION (gold), CLOSE POSITION (red ghost), SET ALERT (neutral ghost)

**Buying power display:**
- Paper mode: shows `walletBalance` from settings.json
- Live mode: shows scraped Robinhood balance with freshness indicator (green=today, gold=≤7days, red=>7days)

**Price refresh:** GET /prices for all open tickers on mount, 30s polling interval.

---

## 7. Screen: Settings (`/settings`)

Single scrolling page, organized into cards. All inline edits save via explicit Save button — never on blur.

**Sections:**
1. **Account** — Display name, sign out button
2. **Trading Mode** — Paper/Live pill toggle. Switching Live→Paper shows confirmation.
3. **AI Provider** — Provider selector (OpenAI / Anthropic / Google), API key (masked inline edit), model (auto-selected with optional override)
4. **Risk Controls** — Stop-loss (%), max daily drawdown (%), default position size (%)
5. **Buying Power** — Current value, last updated timestamp, Update button
6. **Danger Zone** — "Reset All Settings" `text-[#ff5f56]`, requires typing `RESET` to confirm

**Default models per provider:**
- OpenAI → `gpt-4o`
- Anthropic → `claude-sonnet-4-20250514`
- Google → `gemini-2.0-flash`

---

## 8. Screen: Onboarding (`/onboarding`)

Runs on first launch only (`onboardingComplete: false` in settings.json). No sidebar visible. 4-step flow.

**Step 1 — Welcome**
- Bodoni Moda: "Market Midas"
- Jost light: "Your AI-powered trading terminal. Runs entirely on your Mac."
- CTA: "Get Started"

**Step 2 — Trading Mode**
- Two cards: Paper Trading / Live Trading
- Live card must include: "Requires an active Robinhood account. We automate the browser to place trades on your behalf."
- Default: Paper Trading

**Step 3 — Budget Setup**
- Paper: "Set your starting paper balance" — prefilled $100,000
- Live: "What is your current Robinhood buying power?" — manual $ entry

**Step 4 — Stop Loss**
- "Set your default stop loss" — prefilled 5%
- Helper: "We'll warn you if a position drops this much from your entry price."

On complete: PATCH /settings with all fields + `onboardingComplete: true` → redirect to `/`

---

## 9. Screen: Login

Shown on app launch if no valid auth token stored locally. No sidebar visible.

- Bodoni Moda heading: "Market Midas"
- Email + password inputs
- "Sign In" CTA (gold, full width)
- Footer: "Don't have an account? Sign up at market-midas.vercel.app"
- On success: store token locally, check `onboardingComplete` → route to `/onboarding` or `/`
- On failure: inline error `text-[#ff5f56]`, stay on login screen

---

## 10. State Variation Reference

Every component that accepts data must define these four states before any code is written:

| State | Description | Visual Treatment |
|-------|-------------|-----------------|
| **Empty** | No data yet | Centered text + CTA, no skeleton, no fake data |
| **Loading** | Data in flight | Sequential step indicators, never spinner alone |
| **Populated** | Data present | Full component as designed |
| **Error** | Fetch failed | `text-[#ff5f56]` inline message + retry. Never full-page error. |

---

## 11. Prompt Engineering Notes

When prompting any agent with this document:

1. **Reference MMDesign.md for all tokens** — colors, typography, spacing, buttons
2. **Reference MMAppDesign.md for all behavior** — screen hierarchy, states, motion
3. **Specify exact screen and state** — never say "build the dashboard"
4. **Forbid explicitly:** Inter/Roboto/system fonts, purple gradients, instant transitions, spinners
5. **Paste Section 1.6 motion table** into any prompt involving animation
6. **Paste Section 1.2** into any prompt touching the app shell or sidebar
7. **Frontend tasks → Gemini:** UI screens, components, styling, event wiring
8. **Backend/AI tasks → Opus or GPT:** Python logic, LiteLLM, FastAPI endpoints

---

## 12. Design Anti-Patterns (Never Do)

- **Alert fatigue** — red only for negative P&L and destructive actions
- **Data density for its own sake** — every visible number answers a current question
- **Buried mode indicator** — Paper/Live always visible in sidebar
- **Confirmation for non-destructive actions** — only Execute Trade, Close Position, Reset Settings
- **Fake precision** — always round to 2 decimal places for display
- **Spinner instead of progress** — sequential steps during all loading states
- **On-blur save** — explicit Save button for all inline edits in Settings
