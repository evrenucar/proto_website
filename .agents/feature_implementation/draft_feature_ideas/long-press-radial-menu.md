# Long Press Radial Menu

## Problem / Why
Right click is the primary contextual entry point on desktop, but touch users have no equivalent. A long press menu gives mobile and tablet users access to the same per node actions like edit, duplicate, link, and delete without forcing a separate mobile UI.

## Sketch
- On `pointerdown` over a node, start a 350 to 500 ms timer. If the pointer moves more than a few CSS pixels, cancel. If it fires, open a radial or arc menu anchored at the touch point.
- Items adapt to context: a markdown card shows edit, link out, copy block. A canvas group shows ungroup, recolor, embed. An empty area shows new card, paste, new board.
- Use a haptic hint via `navigator.vibrate(10)` when the menu opens so the gesture feels confirmed on Android. iOS will simply ignore it.
- Position with edge avoidance so the menu never opens off screen, and dismiss on outside tap or a second long press.
- Mirror every action to the existing keyboard and right click pathways so there is one source of truth for commands.

## Notes
- Reference UX: Miro long press, iOS share sheet, Things 3 plus button, Notion mobile context menu.
- Keep it static host friendly, no service worker needed for this.
- Open question: radial pie versus a vertical list. Radial reads faster for 4 to 6 items but a list scales better. A short arc that fans toward the safe side of the screen is a good compromise.
