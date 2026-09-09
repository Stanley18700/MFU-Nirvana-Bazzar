One-line: every form control — the registration form must be finishable in under a minute, so keep fields few and labels plain.

```jsx
<Field label="Full name" required placeholder="As it appears on your student card" />
<Field label="Country" as="select" options={['Thailand','China','Myanmar']} />
<Field label="Email" error="That address is already registered" />
```

Focus draws a sky ring; error switches ring and border to danger. Never use placeholder text as the label.
