---
page: debate
---
A complex React Next.js page for the Market-Midas "Debate Mode Panel".

**DESIGN SYSTEM OVERRIDES (REQUIRED):**
* Apply a "Resonant Stark" and "Snug Simple" aesthetic. Ivory/cream background (#F9F8F6) with deep charcoal text (#2D2D2D). Zero generic AI aesthetics: no purple/pink gradients, no floating glass cards.
* **Typography:** 'Lora' (Serif) for headings. 'Poppins' (Sans-Serif) for body text and data numbers.
* **Palette:** Sage Green (#8FB996) for Bull/Positive. Muted Terracotta (#C86A58) for Bear/Negative. 

**Chat+ Structural Layout (Supervisor Workspace):**
1. **Header:** Title "Debate Mode: NVDA Sector Analysis".
2. **Split Pane Layout (Main Content):** 
   * **Left Pane (Conversational Arena):** A vertical timeline or chat interface. Displays distinct back-and-forth arguments. Bull agent messages use light Sage backgrounds/accents. Bear agent messages use light Terracotta backgrounds/accents. Within the conversational bubbles, place 'Explainability Chips' and 'Confidence Meters' to provide local explanations for their statistical claims.
   * **Right Pane (Dynamic Data Canvas):** A clean Bento Box Grid layout. Displays the raw data the agents are referencing: "4H RSI Chart", "Institutional Order Flow", and "Macro News Sentiment".
3. **Anchored Action Bar (Bottom Fixed):** A sticky, fixed action bar at the absolute bottom. MUST contain:
   * A pulsing indicator text: "Execution Pipeline PAUSED. Awaiting Supervisor Authorization." (Use a CSS pulse effect).
   * Large, tactile "Confirm Execution" button (Sage Green).
   * Large, tactile "Kill-Switch / Abort" button (Muted Terracotta).
   * Clear hover and focus states for the buttons.
