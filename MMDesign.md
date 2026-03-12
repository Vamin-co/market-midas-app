# Design System: Market Midas (Mac Application)

This document serves as the single source of truth for all UI generation in the upcoming Local-First Mac Application, directly extracted from the Anthropic Humanist aesthetic of the marketing website.

## 1. Typography & Spacing

### Fonts
The application explicitly pairs a highly legible geometric sans-serif for UI elements with a distinguished serif for major headings to achieve the Anthropic Humanist aesthetic.
- **Sans-Serif (Primary UI & Body):** `"Jost", sans-serif`
- **Serif (Headings & Display):** `"Bodoni Moda", serif`

### Weights
- **Light / Normal (300/400):** Used for standard body copy, long-form text, and secondary descriptions (`font-light`).
- **Medium / SemiBold (500/600):** Used for buttons, labels, and small structural elements.
- **Bold (700+):** Exclusively reserved for headings, accents, and critical status indicators (e.g., `font-bold uppercase tracking-widest`).

### Spacing Scale
The design system strictly adheres to the **default Tailwind CSS spacing scale**. 
*Key patterns observed:*
- **Padding/Margins:** Heavy use of generous spacing. Sections often use `py-24`, `pt-48`, `mb-40`. Element-level spacing frequently uses `p-8` or `p-10`.
- **Gaps:** Flex and grid gaps often use `gap-4` for tight items, and `gap-16` or `gap-32` for structural sectional blocks.

## 2. Color Palette & Tokens

The exact hex codes have been extracted from the source material. 
*(Note: "Sage Green" and "Muted Terracotta" mentioned in the prompt's example were not present in the marketing codebase; only the following strict palette maps to the actual Anthropic Humanist website source).*

| Semantic Name | Hex Code | Usage context |
| ------------- | -------- | ------------- |
| **primary** | `#1C1917` | Deep Charcoal. Used for primary text on light backgrounds, dark mode containers. |
| **secondary** | `#44403C` | Warm Stone. Used for secondary/muted text, reading paragraphs. |
| **accent** | `#CA8A04` | Burnished Gold. Used for semantic highlights, active link states, CTA backgrounds. |
| **background** | `#FAFAF9` | Alabaster Off-White. Global application background. |

### Extended Palette (Dark UI / Modals)
- **Deep Slate:** `#141210` (Used for sidebar and deep nested modal backgrounds)
- **Subtle Edges:** `white/5` or `white/10` (Used for borders in dark mode)
- **Status Green:** `#27c93f` (Used for success/active states in the mock engine)
- **Status Red:** `#ff5f56` (Used for error/disconnected states)

## 3. Component Architecture

### Cards & Layout Elements
The aesthetic relies on clean bounds, minimal borders, and extremely subtle drop shadows.
- **Light Theme Cards:** 
  - `bg-white p-10 rounded-2xl border border-primary/5 shadow-sm`
  - *Interaction:* `hover:shadow-xl transition-shadow duration-500`
- **Secondary Block Cards:** 
  - `bg-[#FAFAF9] p-10 rounded-2xl border border-primary/10 shadow-sm`
- **Dark Theme / App Interface Cards:**
  - `bg-[#1C1917] p-10 rounded-2xl shadow-sm border border-white/5 text-[#FAFAF9]`
- **Modals:** 
  - Overlays use `bg-[#1C1917]/80 backdrop-blur-md`. 
  - Content boxes use deep dark `bg-[#141210] border border-white/10 rounded-2xl shadow-2xl` with internal gradients (e.g., `bg-gradient-to-b from-[#141210] to-[#1C1917]`).

### Buttons & Interactive Elements
Interactions are slow, deliberate, and premium, avoiding standard instant hovers.
- **Primary Ghost/Fill Transition Button (Navbar/Footer):** 
  - Pill-shaped (`rounded-full`), `border-primary text-primary`. 
  - Typography: `font-sans text-sm tracking-widest uppercase`.
  - *Interaction:* Relies on an absolute inset `span` that translates in `group-hover:translate-x-0` or `group-hover:translate-y-0` with a smooth `duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]` custom easing.
- **Solid Action Button:** 
  - `bg-[#CA8A04] text-[#1C1917] px-8 py-3 rounded-md font-sans font-bold uppercase tracking-widest text-xs`.
  - *Interaction:* `hover:bg-[#A16207] transition-colors`.
- **Micro-Interactions (Magnetic & Links):**
  - **Magnetic Buttons:** Custom utility classes apply `transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]`. Hover states use `hover:scale-[1.03]` and active `active:scale-[0.98]`.
  - **Inline Links:** Subtly float up on hover: `hover:-translate-y-[1px] transition-transform duration-300`.
  - **Focus Rings:** The design system generally prefers minimal default browser outlines or relies entirely on the structural transform/color shifts for keyboard focus, maintaining the clean Humanist aesthetic.
