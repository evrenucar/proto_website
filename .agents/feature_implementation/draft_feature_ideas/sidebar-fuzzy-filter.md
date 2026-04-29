# Sidebar Fuzzy Filter

## Problem / Why
The sidebar already shows the filesystem hierarchy, which is the primary organizing principle. As the tree grows, scanning it visually gets slow. A small filter input at the top of the sidebar would let the existing structure stay the source of truth while making it instantly navigable.

## Sketch
- Add a slim input pinned to the top of the sidebar with placeholder "filter".
- Typing filters the tree in place. Folders that contain a match stay expanded and visible. Non matching siblings collapse out of view.
- Matching is fuzzy on the leaf name first, then on the full path. Matched characters are underlined in teal.
- Up/Down arrows move through visible matches, Enter opens the focused entry, Esc clears the filter and restores the previous expansion state.
- Pure DOM filter, no re-fetch, no re-route. State is local to the sidebar component.

## Notes
- Distinct from the quick open palette: this preserves spatial context in the tree, the palette flattens everything.
- Should restore prior expand/collapse state cleanly on Esc, otherwise users lose their place.
- Touch points: the sidebar component, plus a small fuzzy match utility shared with the palette.
