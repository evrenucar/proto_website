# Mobile Sidebar As Bottom Sheet

## Problem / Why
The left sidebar is the filesystem hierarchy and is central to navigation, but a fixed left rail eats too much width on phones. A bottom sheet that the user can drag up gives full filesystem access without sacrificing canvas real estate, and matches the gesture language people already use in Maps, Notes, and Files.

## Sketch
- Below a breakpoint, replace the left rail with a peek bar pinned to the bottom showing the current path and a small handle. Drag up to expand to half height, drag higher to full height.
- Implement with a CSS `transform: translateY` driven by pointer move, snap to three rest points, and respect safe area insets so it clears the home indicator on iOS.
- Inside the sheet, reuse the same tree component as desktop. Hit targets get bumped to at least 44 px, with chevrons sized for thumbs.
- A swipe right from the left edge opens the sheet at half height as a shortcut, mirroring iOS back gesture grammar without conflicting with browser back if we only listen above a small threshold.
- Tablet behaves like desktop in landscape and like mobile in portrait, picked at runtime by viewport width, not user agent.

## Notes
- Precedents: Apple Maps, Google Maps, Things 3 quick find, Linear mobile.
- Keep desktop, tablet, and mobile in scope per project direction. The same tree should not fork into two implementations.
- Code areas: sidebar component, app shell layout, viewport hook. Add a single `useLayoutMode` that returns rail or sheet.
