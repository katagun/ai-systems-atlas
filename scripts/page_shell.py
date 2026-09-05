#!/usr/bin/env python3
"""Presentation constants shared by every generated page.

They sit apart from any one generator so the share pages and the blog can both
use them without importing each other. The blog needs this styling; the
share-page module needs the blog's URLs for the sitemap it owns. Two real
dependencies pointing opposite ways, which is a cycle unless what they share
lives in a third place.
"""
from __future__ import annotations

SITE_URL = "https://peacefulcoexistance.com/"
SITE_NAME = "peacefulcoexistance"
SITE_TAGLINE = "AI systems directory"

STYLE = """
:root { color-scheme: light dark; --bg: #f7f9fc; --panel: #ffffff; --text: #16233a; --muted: #5b6b82; --line: #d8e0ea; --accent: #0f766e; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f141b; --panel: #171e28; --text: #e6ebf2; --muted: #9aa7b8; --line: #2a3441; --accent: #3fb8b0; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif; }
main { max-width: 44rem; margin: 3rem auto 2rem; padding: 0 1.25rem; }
.eyebrow, dt, footer, .note { font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace; }
.eyebrow { margin: 0 0 .5rem; color: var(--accent); font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0 0 .75rem; font: 700 clamp(2rem, 6vw, 3rem)/1.05 "Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif; letter-spacing: -.02em; text-wrap: balance; }
.lead { margin: 0 0 1.5rem; font-size: 1.1rem; color: var(--muted); }
dl { display: grid; grid-template-columns: max-content 1fr; gap: .35rem 1rem; margin: 0 0 1.5rem; padding: 1rem 1.25rem; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
dt { color: var(--muted); font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; padding-top: .2rem; }
dd { margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; margin: 0 0 1.25rem; }
.primary { display: inline-block; padding: .65rem 1.1rem; background: var(--text); color: var(--bg); border-radius: 999px; font-weight: 600; text-decoration: none; }
.primary:hover { background: var(--accent); }
a { color: var(--accent); }
.note { margin: 0; color: var(--muted); font-size: .78rem; }
footer { max-width: 44rem; margin: 0 auto 3rem; padding: 1rem 1.25rem 0; border-top: 1px solid var(--line); color: var(--muted); font-size: .72rem; }
@media (max-width: 560px) { dl { grid-template-columns: 1fr; gap: .1rem; } dt { margin-top: .5rem; } }
""".strip()
