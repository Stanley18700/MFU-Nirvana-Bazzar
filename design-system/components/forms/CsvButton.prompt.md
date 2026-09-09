One-line: the export affordance on every dashboard panel — small, underlined, top-right of the panel header.

```jsx
<CsvButton name="leaderboard" rows={board} />
<CsvButton name="visitors" rows={visitors} confirm="This export contains personal data. Continue?" />
```

Never a filled button: it must not compete with the panel's own content. Disabled (not hidden) when there is nothing to export.
