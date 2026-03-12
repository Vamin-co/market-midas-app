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
┌─────────────────────────────────────────────────────────────┐
│  [Sidebar 64px]  │  [Main Content Area — fills remainder]   │
│                  │                                           │
│  Logo            │  [Screen renders here]                    │
│  ─────           │                                           │
│  Analyze   ←nav  │                                           │
│  Positions       │                                           │
│  Alerts          │                                           │
│  Paper Wallet*   │                                           │
│  ─────           │                                           │
│  [MODE BADGE]    │                                           │
│  Settings        │                                           │
│                  │                                           │
└─────────────────────────────────────────────────────────────┘
* Only visible in Paper mode
```

### 1.2 macOS Window Ergonomics

The app is a native macOS window. The top of every screen must reserve space for the OS traffic light controls (close / minimize / zoom).

- **Title bar:** `h-10 w-full` strip at the very top of the window. Set `-webkit-app-region: drag` so the user can drag the window by it. This region contains no UI elements.
- **Sidebar top padding:** The first `40px` of the sidebar is padding only — no icons, no logo. This ensures the traffic lights (which sit at approximately `x:12, y:12` in a default macOS window) never overlap sidebar content.
- **First sidebar icon** starts at `y: 48px` from the top of the sidebar.
- The main content area also respects the `h-10` title bar — content begins below it.

### 1.3 Sidebar Specification & Ambient Mode System

The two modes are distinguished through **color temperature**, not badges or alarms. The distinction is felt, not announced. Neither mode should feel anxious — Paper feels warm and exploratory, Live feels precise and connected.

- **Background:** `bg-[#141210]` in both modes (Deep Slate — unchanged)
- **Width:** Fixed `64px`. No expanded state — labels appear as tooltips on hover. Never collapses. Layout never shifts.
- **Nav icons:** 24px, `text-[#FAFAF9]/40` at rest → `text-[#FAFAF9]` on hover → `text-[#CA8A04]` when active route
- **Active route indicator:** 2px left border `border-l-2 border-[#CA8A04]`. Gold is used on exactly one nav element at a time.

**Paper mode ambient treatment:**
- Sidebar right edge: `border-r border-[#CA8A04]/20` — a warm, barely-there gold breath
- Mode indicator at bottom of sidebar: `PAPER` in `text-[10px] font-bold uppercase tracking-widest text-[#CA8A04]/60`
- Effect: the sidebar glows faintly warm. Feels safe, exploratory, consequence-free.

**Live mode ambient treatment:**
- Sidebar right edge: `border-r border-[#FAFAF9]/10` — cool, crisp, neutral
- Mode indicator at bottom of sidebar: a single `●` dot in `text-[#27c93f]` (Status Green) followed by `LIVE` in `text-[10px] font-bold uppercase tracking-widest text-[#FAFAF9]/60`
- Effect: reads as "connected" and "on" — like a broadcast on-air signal or a healthy network node. Serious without being alarming.

> **Why green for Live, not red:** Red in this UI is reserved exclusively for negative P&L and destructive actions (abort, danger zone). Using red for mode would create false alarm signals every time the user glances at the sidebar. Green signals "active and connected" — which is exactly what Live mode is.

### 1.5 App-Level Motion

Transitions between screens: `opacity-0 → opacity-100` over `150ms ease-out`. No slide, no scale. The content fades in. This is faster than the website's `duration-500` because the user is navigating an app, not being guided through a story.

---

## 2. Onboarding Flow

### 2.1 Screen Sequence

```
Welcome → Mode Selection → Budget Setup → API Key → Done
```

Each step is a full-screen centered card. Progress shown as a 4-dot indicator at the top. No sidebar visible during onboarding.

### 2.2 Step Specifications

**Step 1 — Welcome**
- Bodoni Moda heading: `"Market Midas"`
- Jost subheading light: `"Your AI-powered trading terminal. Runs entirely on your Mac."`
- Single CTA button (Solid Action Button from MMDesign.md): `"Get Started"`

**Step 2 — Mode Selection**
- Heading: `"How would you like to start?"`
- Two cards side by side. Selected card gets `border-[#CA8A04]` border and gold checkmark. Unselected gets `border-white/5`.
  - **Paper Trading** — `"Practice with real market data and simulated money. Recommended for new users."`
  - **Live Trading** — `"Connect to your real Robinhood account. Real money, real trades."`
- Mode can be changed anytime in Settings. This is not a locked decision.

**Step 3 — Budget Setup**
- If **Live mode** selected:
  - Heading: `"What is your current Robinhood buying power?"`
  - Helper text (Jost light, `text-[#44403C]`): `"Open Robinhood and check your buying power. This helps us size position recommendations. You can update this anytime."`
  - Single number input, `$` prefix, large Bodoni Moda display text as the user types
  - Below input: `"We never store or access your Robinhood credentials directly."`
- If **Paper mode** selected:
  - Heading: `"Set your starting paper balance"`
  - Default pre-filled: `$100,000`
  - Helper: `"This is your simulated trading budget. It will update automatically as you make paper trades."`

**Step 4 — API Key**
- Heading: `"Connect your AI engine"`
- Helper: `"Market Midas uses Claude to power its analysis agents. Paste your Anthropic API key below."`
- Input: password-type field, masked, with a show/hide toggle
- Small note: `"Stored locally on your Mac only. Never transmitted to our servers."`

**Step 5 — Done**
- `"You're ready."` in Bodoni Moda
- Transition: fade into main app with Analyze screen active

---

## 3. Screen: Analyze (Home Screen)

This is the first screen the user sees after onboarding and on every app open. The cursor is focused on the search input immediately. No clicks required.

### 3.1 Empty State (App Open)

```
┌────────────────────────────────────────────────┐
│                                                │
│         [Bodoni Moda, large]                   │
│         What would you like to analyze?        │
│                                                │
│         ┌──────────────────────────────────┐   │
│         │  $ TICKER SYMBOL                 │   │
│         └──────────────────────────────────┘   │
│                                                │
│         Recent: NVDA  AAPL  TSLA               │
│                                                │
└────────────────────────────────────────────────┘
```

- Input styled as: `bg-white border border-[#1C1917]/10 rounded-md px-6 py-4 font-sans text-lg uppercase tracking-widest`
- On focus: `border-[#CA8A04]` transition `duration-300`
- Recent tickers shown as ghost pills. Click to pre-fill.
- Submit on Enter or arrow button.

### 3.2 Loading State — Data Pull

Triggered immediately after ticker submission. Full panel replaces the search area.

```
┌────────────────────────────────────────────────┐
│  NVDA  ·  NVIDIA Corporation                   │
│  ─────────────────────────────────────────────  │
│  ● Fetching market data...           [live dot] │
│  ○ Running quantitative analysis...             │
│  ○ Preparing recommendation...                  │
└────────────────────────────────────────────────┘
```

- Steps complete sequentially. Each ○ becomes ● with a `text-[#27c93f]` checkmark when done.
- Live dot: `animate-pulse text-[#CA8A04]` — the only animation on this screen.
- This takes 2–5 seconds. Do not skip it with a spinner. Showing the steps builds trust.

### 3.3 Analysis Results State

Three cards in a column layout after analysis completes:

**Card 1 — Price & Quant Summary** (Light Theme Card from MMDesign.md)
- Current price (large Bodoni Moda), daily change, 52-week range
- SMA-50 / SMA-200 indicators shown as simple labeled bars — above/below line clearly marked
- Volume vs average volume

**Card 2 — Recommendation** (Dark Theme Card from MMDesign.md)
- `BUY / SELL / HOLD` in large Bodoni Moda — color coded:
  - BUY: `text-[#27c93f]`
  - SELL: `text-[#ff5f56]`
  - HOLD: `text-[#CA8A04]`
- Conviction Score: animated horizontal bar, fills left to right over `600ms ease-out` on mount. Gold fill `bg-[#CA8A04]`, track `bg-white/10`
- 2–3 sentence rationale in Jost light

**Card 3 — Actions**
- Primary: `"Start Debate Session"` — Solid Action Button (gold, MMDesign.md spec)
- Secondary: `"Proceed to Trade"` — Ghost button, only visible if recommendation is BUY or SELL
- Tertiary: `"Search Another Ticker"` — inline text link, `hover:-translate-y-[1px] transition-transform duration-300`

---

## 4. Screen: Debate Session

This is the cinematic centerpiece of the app. It is the scroll-animation equivalent — the moment where the product shows its soul.

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  NVDA Debate Session                     [LIVE] ●           │
│  ─────────────────────────────────────────────────────────── │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  🐂 BULL             │  │  🐻 BEAR                     │ │
│  │  Conviction: ████░░  │  │  Conviction: ██░░░░          │ │
│  │                      │  │                              │ │
│  │  [streaming text...] │  │  [waiting...]                │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
│                                                             │
│  ─────────────────────────────────────────────────────────── │
│  [Final Verdict loads here after both agents complete]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Streaming Behavior

- Bull agent argues first. Text streams in character by character (or token by token depending on API). Bear panel shows a subtle `animate-pulse` waiting indicator.
- When Bull completes, Bear begins immediately. Bull panel freezes, conviction score animates to final value.
- Each argument is followed by cited references shown as small pill tags: `text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5`
- **This must never be batched and shown all at once.** The streaming IS the experience.

### 4.3 Conviction Meters

- Both meters start at 0 and animate to their final values when each agent completes.
- If Bull conviction > Bear conviction: Bull meter `bg-[#27c93f]`, Bear meter `bg-[#ff5f56]`
- If Bear conviction > Bull conviction: reverse colors
- Near-tie (within 10 points): both meters `bg-[#CA8A04]`

### 4.4 Final Verdict

Appears below both agent panels after both complete. Uses Dark Theme Card. Slight entrance animation: `translateY(8px) → translateY(0)` over `400ms ease-out`.

- Revised recommendation (may differ from initial analysis)
- Explanation of why the debate changed or confirmed the recommendation
- `"Why did it change?"` expandable section if recommendation differs from pre-debate

### 4.5 Post-Debate Actions

Same three-action pattern as Analysis Results. If the user is reviewing an existing position (re-analysis flow), the actions change to: `"Add to Position"` / `"Close Position"` / `"Hold — Set Alert"`

---

## 5. Screen: Trade Execution

This screen handles the highest-stakes moment in the app. Design for deliberation, not speed.

### 5.1 Order Review Panel

```
┌────────────────────────────────────────────────┐
│  Order Review                                  │
│  ─────────────────────────────────────────────  │
│                                                │
│  BUY  NVDA                                     │
│  10.12 shares  @  $177.34                      │
│  ───────────────────────────────               │
│  Total:  $1,794.68                             │
│  25% of your buying power ($7,178.72)          │
│  Based on balance from 3 days ago · [Update]   │
│                                                │
│  ─────────────────────────────────────────────  │
│  Mode: LIVE TRADING  ●                         │
│                                                │
│  [ABORT]                    [EXECUTE TRADE →]  │
└────────────────────────────────────────────────┘
```

**Buying power freshness — two-layer system:**

The app uses a lightweight manual nudge for recommendation accuracy and a silent automated correction at execution time. No redundant Playwright launches just to scrape a number.

| Buying power age | Visual treatment | Behavior |
|---|---|---|
| **Under 24 hours** | Nothing shown | Number is fresh, no friction |
| **1–7 days** | `text-[#44403C]` (Warm Stone): `"Based on balance from 3 days ago · Update"` | Inline `[Update]` opens a single-field popover — pre-filled number input + Save. Five seconds, no Robinhood required. |
| **Over 7 days** | Position size line turns `text-[#CA8A04]` (gold, not red — a flag, not an alarm). `EXECUTE TRADE →` is replaced by `"Update Balance First"` as the primary action. | User must update the number OR explicitly dismiss a modal reading: `"Your stored buying power is 12 days old. Proceeding may result in an order you cannot fund."` with `[Update Now]` and `[Proceed Anyway]` options. |

**Silent Playwright validation (always runs, regardless of freshness tier):**
When Playwright opens Robinhood for the actual trade, it reads the live buying power off the screen. If the live number differs from the stored number by more than 10%, it silently updates the stored value and surfaces the drift warning modal before filling the order. The user is never surprised at the Robinhood confirmation screen.

**Critical button placement logic:**
- `ABORT` — left side, Ghost button, `text-[#ff5f56] border-[#ff5f56]/30`
- `EXECUTE TRADE →` — right side, Solid Action Button (gold). The arrow signals consequence.
- These two buttons are always on opposite sides. Never adjacent. Spatial distance is the friction.

### 5.2 HITL Playwright State

After `EXECUTE TRADE →` is pressed:

```
┌────────────────────────────────────────────────┐
│  ● Robinhood is opening...                     │
│                                                │
│  Please log in and complete 2FA if prompted.   │
│  We'll take it from here once you're inside.   │
│                                                │
│  ─────────────────────────────────────────────  │
│  ○ Waiting for Robinhood to load               │
│  ○ Navigating to order entry                   │
│  ○ Filling order details                       │
│  ○ Awaiting your confirmation                  │
│                                                │
│                              [ABORT MISSION]   │
└────────────────────────────────────────────────┘
```

- Steps progress with live dots, same pattern as Analysis loading state
- `ABORT MISSION` — always visible, right side, `text-[#ff5f56]`. Playwright closes Robinhood if aborted.
- The final step "Awaiting your confirmation" pauses until the user physically clicks Buy on Robinhood.

### 5.3 Trade Confirmed State

```
✓  Trade Executed
   NVDA  ·  10.12 shares  ·  $177.34
   Logged to your positions.

   [View Positions]    [Analyze Another]
```

Entrance animation: checkmark draws in with a `stroke-dashoffset` animation over `500ms`. This is the one moment of celebration the app allows.

---

## 6. Screen: Positions (Trade Tracker)

### 6.1 Layout

Two sections, always visible:

**Open Positions** — table format
- Columns: Ticker / Shares / Entry Price / Current Price / P&L ($) / P&L (%) / Actions
- P&L column: `text-[#27c93f]` if positive, `text-[#ff5f56]` if negative. Numbers update on a 60-second polling interval with a subtle `transition-colors duration-500` when they change.
- Actions per row: `Re-analyze` · `Set Alert` · `Close Position`
- Manual sale badge: `[⚠ Manual]` pill on positions closed outside the app

**Closed Positions** — collapsed by default, expandable
- Paginated, 10 per page
- Shows entry price, exit price, realized P&L, close method (AI / Manual)

### 6.2 Empty State

```
No open positions.

Start by analyzing a ticker on the Analyze screen.
[Go to Analyze →]
```

### 6.3 Close Position Flow

Clicking `Close Position` on a row opens a bottom sheet (not a full modal):

- Shows current P&L
- Fallback waterfall status (live price / stale / manual entry) — as designed in Phase 4
- `CONFIRM CLOSE` button — same deliberate placement as Execute Trade. Gold, right side.

---

## 7. Screen: Alerts

Clean list view. Each alert shows:
- Ticker / threshold / current status (active / triggered / paused)
- `[Edit]` · `[Delete]` inline actions

**Add Alert** CTA at top right — Ghost button that opens a simple modal: ticker input + price threshold input.

Triggered alerts show with `text-[#ff5f56]` and a bell icon. They persist until dismissed.

---

## 8. Screen: Paper Wallet

Only accessible in Paper mode (sidebar item only appears in Paper mode).

Simple balance display:
- Starting balance
- Current balance (large Bodoni Moda)
- Realized P&L
- Unrealized P&L (from open paper positions)
- Reset button: `"Reset Paper Wallet"` — Ghost button, requires a confirmation modal before resetting.

---

## 9. Screen: Settings

Organized into sections, not tabs. Single scrolling page.

**Sections:**
1. **Account** — Display name, sign out
2. **Trading Mode** — Paper / Live toggle (global). Switching from Live → Paper shows a confirmation: `"Switch to Paper mode? Live trading will be paused."`
3. **Risk Controls** — Stop-loss threshold (%), Max daily drawdown (%), Default position size (% of buying power, default 25%)
4. **Buying Power** — Current stored value, timestamp of last update, and `[Update]` button that opens the single-field popover (same component used inline on the Trade Execution screen). Helper: `"Update this whenever your Robinhood balance changes significantly. It also updates automatically when you execute a trade."`
5. **API Key** — Masked display, `[Reveal]` · `[Update]` actions
6. **Danger Zone** — `"Reset All Settings"` in `text-[#ff5f56]`. Requires typing `RESET` to confirm.

---

## 10. App-Native Motion System

This replaces the website's scroll-based animations. These are the only approved motion patterns.

| Moment | Animation | Duration | Easing |
|--------|-----------|----------|--------|
| Screen transition | `opacity 0→1` | `150ms` | `ease-out` |
| Card mount | `translateY(8px)→0, opacity 0→1` | `300ms` | `ease-out` |
| Conviction meter fill | `width 0→final` | `600ms` | `ease-out` |
| P&L color change | `color transition` | `500ms` | `ease-in-out` |
| Trade confirmed checkmark | `stroke-dashoffset draw` | `500ms` | `ease-in-out` |
| Agent step completion (●) | `opacity 0→1` | `200ms` | `ease-out` |
| Streaming debate text | Character/token append | Real-time | — |
| Button hover (all) | `scale 1→1.03` | `300ms` | `cubic-bezier(0.25,0.46,0.45,0.94)` |
| Button active (all) | `scale →0.98` | `100ms` | `ease-in` |

**What is never animated:** Layout shifts, sidebar, prices updating in the table, loading spinners. If something is functional data, it changes instantly.

---

## 11. State Variation Reference

Every component that accepts data must define these four states before any code is written:

| State | Description | Visual Treatment |
|-------|-------------|-----------------|
| **Empty** | No data yet | Centered text + CTA, no skeleton, no fake data |
| **Loading** | Data in flight | Sequential step indicators (never spinner alone) |
| **Populated** | Data present | Full component as designed |
| **Error** | Fetch failed | `text-[#ff5f56]` inline message + retry action. Never a full-page error. |

---

## 12. Prompt Engineering Notes for Gemini 3.1 Pro

When using this document with Gemini 3.1 Pro in Antigravity, always specify:

1. **Thinking level:** Always set to **High**. Antigravity only offers High and Low — use High for all tasks, UI generation and agent logic alike.
2. **Reference MMDesign.md for all tokens** — colors, typography weights, spacing, button styles. Do not redefine them here.
3. **Reference MMAppDesign.md for all behavior** — screen hierarchy, state variations, motion durations, interaction patterns.
4. **Specify the exact screen and state** — never say "build the dashboard." Say "build the Analyze screen in its Analysis Results state, using the three-card layout defined in Section 3.3."
5. **Forbid these explicitly in every prompt:** generic gradients, Inter/Roboto/system fonts, purple color schemes, instant transitions (duration-0 or duration-75), and full-page loading spinners.
6. **Name the motion table** — paste Section 11 directly into prompts where animation is involved. Models hallucinate animation values without explicit constraints.
7. **Include macOS ergonomics** — paste Section 1.2 into any prompt that touches the app shell or sidebar. Gemini will omit the title bar region without this.

---

## 13. Design Anti-Patterns (Never Do)

These are the failure modes of trading app UI. Explicitly banned in Market Midas:

- **Alert fatigue in the UI** — do not use red for anything except negative P&L and destructive actions. If everything is red, nothing is an alert.
- **Data density for its own sake** — every number visible on screen should be answering a question the user currently has. Not all data, all the time.
- **Buried mode indicator** — Paper vs Live mode is never in a dropdown, tooltip, or settings page only. It is always in the sidebar, always visible.
- **Confirmation dialogs for non-destructive actions** — only Execute Trade, Close Position, Reset Wallet, and Reset Settings require confirmation. Everything else is immediately reversible or low-stakes.
- **Fake precision** — never show `$1,794.6800000001`. Round to 2 decimal places for dollar amounts, 2 decimal places for share quantities displayed in tables (keep full precision in the data layer).
