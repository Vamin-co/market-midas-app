# Page Override: Debate Mode Panel

**Directory:** `design-system/pages/debate-mode.md`
**Inheritance Protocol:**
This document OVERRIDES structural layout patterns for the Debate Mode feature. All visual design tokens (colors, typography, spacing primitives) MUST be inherited from the Master `DESIGN.md` (Anthropic Humanist theme).

---

## 1. Global Token Inheritance (Strictly Enforced)
*   **Palette:** Background Ivory (#F9F8F6), Text Charcoal (#2D2D2D), Bull Sage Green (#8FB996), Bear Muted Terracotta (#C86A58).
*   **Typography:** Headings (Lora), Body (Poppins).
*   **Theme Aesthetic:** "Resonant Stark" & "Snug Simple". Zero generic AI aesthetics (no glassmorphism, no neon purple glow).

## 2. Structural Pattern: Chat+ (Co-Creator Workspace)
This is fundamentally NOT a generic chatbot interface. It must operate as a high-bandwidth, multi-pane cognitive arena where the user acts as a Supervisor reviewing the autonomous debate.
*   **Split Layout Architecture:** A prominent side-by-side or split-pane view. 
*   **The Conversational Arena (Left/Main Pane):** Displays the back-and-forth arguments of the Bull and Bear agents. They present their arguments as distinct conversational blocks, utilizing their designated Sage/Terracotta accent colors. 
*   **The Dynamic Data Canvas (Right/Context Pane):** A Bento Box Grid layout displaying the live charts, technical indicators, and news sentiment snippets that the agents are actively referencing. This provides immediate visual proof for the arguments made in the Arena.

## 3. Cognitive Affordances & Explainability ('Local Explanations')
The UX must never ask the user to blindly trust the AI. Every claim must be tied to its underlying reasoning.
*   **Embedded `<ExplainabilityChip>`:** Directly inside the agent's dialogue bubble, specific technical claims (e.g., "RSI is oversold", "Earnings risk elevated") MUST be wrapped in or immediately followed by our reusable `ExplainabilityChip` component. This allows the Supervisor to click for deeper insight into the statistical or historical reasoning behind that localized point.
*   **Inline `<ConfidenceMeter>`:** Each agent's overall thesis block must include a micro-`ConfidenceMeter` component. This visually indicates the strength of their argument relative to the data on the canvas, ensuring the debate is quantified.

## 4. HITL Safety Interlocks & Dependency Awareness
The interface is a gateway to live financial execution. The human user operates strictly in a 'Supervisor Model'.
*   **The Anchored Action Bar:** The bottom of the Viewport must feature a highly prominent, fixed/sticky Action Bar that acts as the final gatekeeper.
*   **Dependency Awareness Indicator:** The UI MUST actively communicate that the automated pipeline is halted. Prominently display a status pulse or label: *"Playwright tracking pipeline PAUSED. Awaiting Supervisor Authorization."* 
*   **Non-Hidden Assurances:** The overriding buttons must not be hidden behind sub-menus or "advanced" toggles.
    *   **"Confirm Execution"**: Large, tactile button using the positive Sage Green accent.
    *   **"Kill-Switch / Abort"**: Large, tactile button using the defensive Muted Terracotta accent. Must look like an emergency stop, not just a "Cancel" button.
