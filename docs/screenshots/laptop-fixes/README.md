# Laptop run fixes (q1, 11 Nov 2026)

Before (`main` at 4bb6e4b) and after, on the e2e build, from a solo Endless match on the Arcanist taken past level 10
(`setLevel(13)`, then a level up in wave 1, so max HP is fractional: 865.52).

| Picture | What it shows |
| --- | --- |
| `*-hero-panel-1920.webp`, `*-hero-panel-1280.webp` | The hero panel: "384 / 865.52" → "383 / 866"; the mana line "297 / 332" cut at its bar's bottom → inside it; Frost Nova's count over "Frost Nova" → over its icon |
| `*-skill-cooldown-1920.webp` | The four skill buttons with Frost Nova on cooldown |
| `*-end-card-1920.webp` | Endless's end card: "Change hero / mode" → "Back to lobby" |
| `*-settings-412.webp`, `after-settings-ask-412.webp` | ⚙ on a 412 × 839 phone in a solo match: the Match row with Back to lobby at the top, and its question (Leave / Stay) |

Made with a throwaway Playwright script against `vite preview` of both builds (not kept in the repo).
