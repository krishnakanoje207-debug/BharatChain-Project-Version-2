# BharatChain Design System

**Status: first reference — pending sign-off (do not adopt into apps yet).**

The single source of truth for the BharatChain frontend rebuild. Design language:
**"modern gov-tech, polished"** — a calm, trustworthy India palette (deep navy lead,
saffron `#FF9933` + green `#138808` as *sparing* accents), Ashoka emblem, generous
whitespace, strong typography, card-based. Refined DigiLocker/UMANG feel — deliberately
not a busy india.gov.in clone.

## Structure
- `styles/theme.css` — the design system: CSS-variable tokens (color / type / space /
  radius / shadow, incl. a `[data-contrast="high"]` a11y mode) + base component classes
  (button, badge, chip, card, input, search, stat, emblem). Token-first so it maps 1:1
  onto a **shadcn/ui + Tailwind** CSS-variable theme when adopted.
- `foundations/index.html` — tokens & components preview card.
- `screens/public-home.html` — the public / citizen home reference screen (masthead +
  a11y strip, hero search, stats, scheme browse, how-it-works, footer).

## Claude Design
Synced to the **"BharatChain Design System"** project on claude.ai/design
(project `bc791aec-fdad-41ab-8f20-77ae74154a98`) via the `/design-sync` workflow
(DesignSync tool: `finalize_plan` → `write_files`). Each preview's first line carries a
`<!-- @dsCard group="…" -->` marker that the Design System pane turns into a card.

To preview: open the `.html` files in a browser, or view the cards on claude.ai/design.

## Next (after sign-off)
1. Extract `theme.css` into the Vite app as the shadcn/Tailwind theme.
2. Build the public/citizen site for real against the live backend API.
3. Replicate the system to the token / admin / RBI surfaces.
