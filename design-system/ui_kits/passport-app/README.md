# UI kit — MFU InterFest Passport (guest app)

The visitor-facing passport, on the festival theme. Screen structure and behaviour are read
from `MFU-Event-Planning/src/pages/visitor/*`; the visual layer is the festival brand —
sky ground, paper-cut mountains, white panels, torn-paper labels, gold foil for reward states.

| Screen | Structure from |
|---|---|
| Cover | `src/pages/visitor/Cover.tsx` |
| Stamps | `src/pages/visitor/Stamps.tsx` + `src/components/Stamp.tsx` |
| Prize | `src/pages/visitor/Prize.tsx` |
| Scan + result | `src/pages/visitor/Scan.tsx`, `ScanResult.tsx` |
| Shell / tab bar | `src/pages/visitor/PassportLayout.tsx` |

There is no `data-theme` wrapper — the app uses the same `--app-*` surfaces as the console
and the kiosk. Booth accents come from the nine paper-scrap `--booth-*` tokens.

Interaction: the tab bar switches pages, the scan circle runs a simulated scan and lands a new
stamp, tapping a stamp opens its booth sheet. All data is mock.
