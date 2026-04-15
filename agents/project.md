# Project Summary

## Project

Personal portfolio website for Evren Ucar.

## Current goals

- Clean up the codebase and file structure.
- Keep the website easy to maintain.
- Improve copy across the main pages.
- Improve SEO with better metadata and supporting files.
- Make room for future project content coming from Notion.

## Visual constraints

The site should remain close to the original version.

That means:

- dark overall look
- left sidebar navigation
- simple typography
- teal highlights
- photography page should keep a dense image-grid style

Avoid turning it into a completely different brand or layout.

## Content constraints

The text should reflect:

- Evren Ucar is a TU Delft graduate
- Evren Ucar works as a freelance industrial design engineer
- the work sits between an idea and a physical thing that can be tested
- the practice includes mechanics, electronics, prototyping, and practical problem-solving
- outside work there is a strong making practice including analog photography, lino printing, metalworking, and related hands-on processes
- OMA Collective work currently includes a darkroom build and a small metal casting kiln

## Technical direction

- Keep the site lightweight.
- Prefer simple static generation over heavy frameworks.
- Support future project overrides or links from Notion.
- A GitHub Action can later fetch Notion data and rebuild the site.
- Use Playwright when checking layout and interaction changes.

## Existing repo direction

The repo now includes:

- shared site data in `src/site-data.mjs`
- a lightweight build script in `scripts/build-site.mjs`
- shared styling in `CSS/site.css`
- shared front-end behavior in `JavaScript/site.js`
- SEO support such as `robots.txt` and `sitemap.xml`
- documentation for future Notion sync

Any future work should preserve the original site feel while improving maintainability.
