# Saved Session Embeds For Web Tools

## Problem / Why
The product thesis says saved web app sessions inside markdown or canvas matter more than opening tools in new tabs. Today, embedding a CAD viewer or code playground means an iframe that loads from scratch every time and forgets your camera, your file, your cursor. We want the embed to remember the session as data that lives next to the note.

## Sketch
- Define a small adapter contract per tool: `serialize(state) -> json`, `hydrate(iframe, json)`, plus a preview image generator. Ship adapters for a CAD viewer, a code playground like CodeSandbox or a local Monaco, a sketch tool like Excalidraw, and a photo viewer with pan and zoom.
- Store the session JSON inline in the canvas node or as a sidecar file referenced from markdown. Preview image is captured on save and rendered as the default frozen view.
- Click-to-activate flips preview into a live iframe and pipes the saved JSON in via `postMessage`. On blur or save, the adapter serializes back and we write a new preview image.
- Adapters are user-extensible via a plain JS file in the vault. Unknown tools fall back to a generic "URL plus saved scroll position plus screenshot" adapter.
- Permissions per adapter, default sandboxed iframe with no network unless the user opts in for that specific tool.

## Notes
- Precedents: Observable embeds, Excalidraw scene JSON in Obsidian, RunKit cells, Notion's Figma and CodePen embeds. The differentiator is that the session data lives in the user's own files.
- Touches: canvas node renderer, markdown embed shortcode, a new `adapters/` registry, and the sandbox iframe wrapper.
- Open question: how to version the JSON when the upstream tool ships breaking changes. Maybe pin adapter version in the saved blob.
