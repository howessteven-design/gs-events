# Greenspan Events HQ

One read-only app for every show. Pick the event from the dropdown (or link straight to one with `?event=orlando26`).
No build step, no browser storage - it is plain HTML/CSS/JS.

## Files
- `index.html` - page shell (header, event dropdown, tabs)
- `app.js` - rendering logic (shared by every event, rarely needs touching)
- `styles.css` - styling
- `events/` - ONE data file per event (rota, accommodation, actions, links, venue, hotel, floor plan, uniform, expenses)
- `assets/` - `logo.png`, plus a folder of images per event (`assets/london`, `assets/orlando`)

## Add a new event
1. Copy `events/orlando26.js` to `events/<short-name>.js` and fill it in.
2. Add one line to `index.html`: `<script src="events/<short-name>.js"></script>`
3. Drop any images in `assets/<short-name>/` and reference them in the data file.

Set `"default": true` on the event that should open first. Hide a tab by removing it from `"tabs"`.
Set `"expenses": null` to hide the allowance panel, or `{"symbol":"$","perDay":50,"note":"..."}` to show it.
Info sections (`"info"`) can be `venue`, `hotel`, `floorplan`, `uniform` or a free-text `notes` section (`{"type":"notes","title":"...","html":"..."}`).

## Deploy
Push to GitHub and connect the repo to Netlify: no build command, publish directory is the repo root.
