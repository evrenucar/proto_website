# Print Stylesheet for Markdown Pages

## Problem / Why
Markdown pages on the site are read like essays and notes. Right now, hitting print produces a dark page with sidebar chrome, hidden link targets, and awkward page breaks. A clean print sheet makes the portfolio usable as a leave-behind, and it is a small, well-scoped polish task.

## Sketch
- Add a `@media print` block scoped to markdown article pages. Set background to white, foreground to near-black, and use a serif or the existing body font at 11pt to 12pt for body, with headings scaled down a notch.
- Hide the sidebar, header chrome, theme toggle, and any embedded canvas controls. Keep the article title, author line, and last-updated date.
- Expand link affordances for paper. After each external link, append the URL in parentheses using `a[href^="http"]::after { content: " (" attr(href) ")"; }`. Skip this for in-page anchors.
- Tune page breaks: avoid breaks inside headings, code blocks, and figure captions, using `break-inside: avoid` and `break-after: avoid` on headings.
- Render canvas embeds as their preview thumbnail with a caption "Canvas: <title>" and a short URL. Live embeds are dropped to the same preview.

## Notes
- Touch points: the markdown page layout component, the canvas embed component's print branch, the global stylesheet.
- Test with the browser's "Save as PDF" path on a few real pages, including a long one and a code-heavy one.
- This pairs well with the light mode work but is independent and shippable on its own.

