# Holistic Research

## Purpose
References, technology candidates, feature ideas, and non-immediate open questions.

## Read when
Evaluating new technology, researching prior art, or exploring feature ideas.

## Skip when
Working on active tasks, checking the roadmap, or looking for architecture decisions.

## Canonical for
Technology candidates, app references, external links, feature ideas, open questions.

---

## Existing App References

| App / project | What to borrow | What not to copy blindly | Reference |
| --- | --- | --- | --- |
| Notion | Page as object, rich embeds, database views, relations | Cloud-only assumptions and weak file portability | https://www.notion.com/product/notion |
| Notion Databases | Database-style views over content | Over-centralizing into one opaque backend | https://www.notion.com/help/what-is-a-database |
| Miro | Board ergonomics, canvas as collaboration surface | Heavy always-live multiplayer cost | https://miro.com/what-is-miro/ |
| Obsidian Canvas | `.canvas` compatibility and markdown-first ownership | Assuming every advanced node maps cleanly | https://help.obsidian.md/Plugins/Canvas |
| Obsidian Bases | Local database views that remain file-native | Treating every query view as a custom backend | https://help.obsidian.md/bases |
| AFFiNE | Dual page/board model, attachments, edgeless mode | Coupling all content to one app-specific model | https://docs.affine.pro/ |
| Anytype | Offline-first mindset, local API, data ownership | Custom encrypted object model too early | https://doc.anytype.io/ |
| tldraw | Tool architecture, editor component patterns | Replacing the engine too early | https://tldraw.dev/faq |
| Excalidraw | Simple diagramming and embeddable patterns | Sketch-only interaction model | https://docs.excalidraw.com/ |

## Technology Candidates

| Capability | Candidate | Stage |
| --- | --- | --- |
| Board interchange | JSON Canvas | Immediate |
| Canvas runtime | Custom Braindump runtime | Immediate |
| Canvas runtime alt | tldraw SDK | Evaluate |
| Markdown editing | BlockNote | Evaluate |
| Rich text primitives | ProseMirror / Tiptap | Evaluate |
| Realtime sync | Yjs | Later |
| Realtime sync alt | Automerge | Later |
| Presence / comments | Liveblocks | Later |
| Local file access | File System Access API | Immediate |
| Local structured data | SQLite WASM | Evaluate |
| PDF viewing | PDF.js | Evaluate |
| Diagrams in docs | Mermaid | Immediate |
| Versioning | GitHub Issues/PRs | Phase 1-2 |
| In-browser apps | WebContainers | Later |

## Feature Ideas

- Clean and easy to edit tables inside boards and markdown files
- Database linked board contents
- Embed boards in boards as preview
- nokta_os as reference for drawing and navigation features
- Plugin support
- Full portability to/from Obsidian, Notion, Figma, FigJam, Miro, AFFiNE, Anytype
- Core encryption implementation
- Right click functionality for additional features
- Universal search/command-line
- Note: Live web embeds cannot render sites like GitHub or Google due to iframe restrictions

## Open Questions

| # | Question |
| --- | --- |
| 1 | Should markdown remain the clear durable source of truth, or should a block-doc format become equally canonical? |
| 2 | Should shared linked entities arrive before or after the first cosmoboard onboarding page? |
| 3 | How much live editing should embedded boards allow before opening a full view? |
| 4 | Which safe file types should get true in-place editing first? |
| 5 | When realtime starts, do boards, markdown, and structured data share one sync model or phase in on separate adapters? |

## External References

| Topic | URL |
| --- | --- |
| JSON Canvas | https://jsoncanvas.org/ |
| Obsidian Canvas | https://help.obsidian.md/Plugins/Canvas |
| Obsidian Bases | https://help.obsidian.md/bases |
| Obsidian embeds | https://help.obsidian.md/embeds |
| Notion product | https://www.notion.com/product/notion |
| Notion databases | https://www.notion.com/help/what-is-a-database |
| Miro product | https://miro.com/what-is-miro/ |
| AFFiNE docs | https://docs.affine.pro/ |
| Anytype docs | https://doc.anytype.io/ |
| tldraw docs | https://tldraw.dev/faq |
| Excalidraw docs | https://docs.excalidraw.com/ |
| Yjs docs | https://docs.yjs.dev/ |
| Automerge docs | https://automerge.org/docs/hello/ |
| BlockNote | https://www.blocknotejs.org/ |
| ProseMirror | https://prosemirror.net/docs/guide/ |
| Liveblocks | https://liveblocks.io/docs |
| File System Access API | https://developer.chrome.com/docs/capabilities/web-apis/file-system-access |
| GitHub PRs | https://docs.github.com/en/pull-requests |
| GitHub Issues | https://docs.github.com/en/issues |
| Mermaid | https://mermaid.js.org/ |
| PDF.js | https://mozilla.github.io/pdf.js/ |
| SQLite WASM | https://www.sqlite.org/wasm |
| WebContainers | https://webcontainers.io/ |
