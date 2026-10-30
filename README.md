# Greenspan Events HQ

One read-only app for every show. Pick the event from the dropdown (or link straight to one with `?event=orlando26`).
No build step, no browser storage - it is plain HTML/CSS/JS.

## Files
- `index.html` - page shell (header, event dropdown, tabs)
- `app.js` - rendering logic (shared by every event, rarely needs touching)
- `edit.js` - admin edit mode (only active with `?admin=1`)
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

## Editing data in the app (admin mode)
Open the app with `?admin=1` on the end of the URL, e.g. `https://your-site.netlify.app/?event=orlando26&admin=1`.
Staff using the normal link never see the edit tools.

- Add / edit / delete shifts, accommodation, flights, MKT actions, key links and Show-info sections.
- **Event details** edits the title, subtitle, stand, show days, tabs, notices and allowance.
- **New event** creates a blank event (then add its `<script>` line to `index.html`).
- **Import Excel** loads a filled-in `templates/StaffTemplate.xlsx` (People, Rota, Accommodation, Flights sheets). The preview shows what will happen. **Add new only** skips rows already there; **Add new and update** also overwrites matching rows with the file's values; **Replace** swaps the sheets. Rows match on the same person (hyphens, spaces and case ignored) plus rota date + activity, hotel check-in date, or flight date + route. The app's own **Excel** export can be re-imported the same way. **Template** downloads a blank copy.
- Edits are held in the browser tab only. Click **Download event file**, replace `events/<id>.js` in the repo, commit - Netlify redeploys for everyone.
- Images (floor plan, uniform) are not uploaded from the app: commit them to `assets/<event>/` and type the path.

## Staff types
Every person has one or more types: **Sales, Support, Build, Visitor** (a person can be several). Types live on the person, not on each shift:
```
"people": [ { "id": "p1", "name": "Steven Howes", "types": ["Sales", "Build"] } ]
```
In edit mode use **Add person** on the Staff tab (or open a person and choose **Edit person** to change their types or rename them everywhere). Adding a shift, hotel or flight for a new name creates the person automatically - set their type afterwards.

## Offline
SheetJS (Excel export/import) is bundled in `vendor/`, so the app does not depend on a CDN for it.
