# Loot Calculator

A simple static website for tallying D&D loot and splitting it across a party. No build step, no dependencies, just open `index.html`.

## Features

- Add magic items by name and rarity (Common / Uncommon / Rare / Very Rare / Legendary)
- Rarity value defaults, with prices editable per item
- Consumable items are worth 50% less (except spell scrolls)
- Spell scroll level ranges called out per rarity
- Total value, sell price (half), and per-member shares (total + sell)
- Loot list and party size persist across refreshes via `localStorage`
- Neobrutalism theme

## Rarity defaults

| Rarity | Value | Spell scrolls | Magic weapon bonus |
| ------ | ----- | ------------- | ------------------ |
| Common | 100 gp | Levels 0-1 | - |
| Uncommon | 400 gp | Levels 2-3 | +1 |
| Rare | 4,000 gp | Levels 4-5 | +2 |
| Very Rare | 40,000 gp | Levels 6-8 | +3 |
| Legendary | 200,000 gp | Level 9 | - |

## Usage

1. Open `index.html` in any modern browser.
2. Enter an item name, pick a rarity, optionally mark it consumable, and hit **Add Item**.
3. Adjust the party size; the totals and per-member shares update automatically.

## Files

- `index.html` — page structure
- `styles.css` — neobrutalism theme
- `app.js` — state, persistence, and calculations
- `favicon.svg` — gold coin favicon