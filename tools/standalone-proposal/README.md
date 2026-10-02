# Standalone proposal page (one-off HTML)

A single self-contained `.html` of the client proposal page (v3): React, the page,
its styles, Gotham, the logo, the cover mark and the match HOA logo are all inlined,
so the file works from a desktop, an email attachment, a shared drive or any host.

```
npm run proposal:standalone                       # → out/proposal-standalone.html (sample data)
npm run proposal:standalone -- clients/acme.json  # → out/acme.html
```

## Data
The file carries its own data in a `<script id="proposal-data" type="application/json">`
block near the bottom, so a built file can also be edited by hand in a text editor.
Shape = `{ account, proposal }` where `proposal` uses the **engagement_proposals row
field names** (snake_case): `title`, `ref`, `start_date`, `valid_through`,
`prepared_by_name/phone/email`, `next_steps_title`, `exclusivity_miles`, the client
legal fields, `plans` (1–3; `matchHoa`, `portal`, `fuel`, `guarantee`, `exclusive`,
`referralDiscount`, `recommended`), `compare_rows` / `sections` toggles,
`custom_rows`, `reference_links`, `testimonial_vimeo_id`. A row copied straight from
the database works. See `proposal-sample.json`.

## What differs from the portal
- No sign-in, no user, no acceptance: the accept card says acceptance happens in the
  Growth Portal and names the rep. The agreement opens read-only (Download PDF works).
- No activity tracking, no live updates. Edit the JSON and rebuild (or hand-edit).
- Links to view.alloygp.co documents and Vimeo open as usual.
