# UI kit — Admin console

The organiser-side console, on the festival theme. Structure from
`MFU-Event-Planning/src/pages/admin/*`.

| Screen | Structure from |
|---|---|
| Shell / sidebar | `admin/AdminLayout.tsx` (three groups: Run, Set up, Records) |
| Dashboard | `admin/Dashboard.tsx`, `useDashboardModel.ts`, `Readiness.tsx` |
| Booths | `admin/Booths.tsx`, `BoothCards.tsx` |

Sidebar is `--app-chrome` (green-900) with the festival logo at its head; content sits on
`--app-page-quiet` so white panels read cleanly. Booth rows are keyed with the nine
`--booth-*` paper-scrap accents.

Every dashboard panel carries its own quiet CSV action in the panel header, and exports that
contain personal data ask for confirmation first (spec §4.1, §10). Ethnic-group data never
appears in a per-person view and is suppressed below five people, so it is absent here by design.

Charts are static SVG stand-ins; the real console uses Recharts.
