# Editorial Utility design contract

Every route, component, modal, empty state, loading state, and future feature uses the shared owners imported by `src/app/globals.css`.

## Visual rules

- Light mode only: warm canvas, white working surfaces, graphite text, and hairline neutral borders.
- Coral is reserved for the single primary action in a context and critical attention. It is not decorative.
- Sage, blue, amber, and red are semantic status colors only.
- Major page and authentication headlines use the display serif; operational labels and controls use the sans-serif.
- Layout follows an 8px spacing rhythm, 6–16px radii, and low-elevation shadows.
- Normal cards use borders rather than shadows. Shadows are reserved for overlays and sticky action surfaces.
- Controls must include hover, focus-visible, disabled, error, success, empty, and responsive states.

## Enforcement

- Add or change palette values only in `src/styles/tokens.css`.
- Do not add raw hex colors to feature styles.
- Extend an existing stylesheet owner or register a new feature style owner in `architecture/feature-map.json`.
- Run `npm run check:architecture`, `npm run lint`, and `npm run build` before merging.
