One-line: the festival's pill button — use it for every action, and let one tone dominate a screen.

```jsx
<Button tone="primary" size="lg" onClick={scan}>Scan a booth</Button>
<Button tone="ghost">Close</Button>
<Button tone="accent" size="sm">Print card</Button>
```

Tones: `primary` (sky, default action), `secondary` (green), `accent` (orange, prize/reward moments),
`ghost` (dismiss, secondary), `danger` (void, delete), `onDark` (on green or navy grounds).
Sizes `sm | md | lg`; `block` for phone forms. Press shrinks to .98; hover darkens the fill — never lightens.
