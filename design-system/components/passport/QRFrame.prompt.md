One-line: the booth display's centrepiece — a white code card ringed in the booth's colour, with the rotation countdown drawn around it.

```jsx
<QRFrame size={320} accent="var(--scrap-terracotta)" progress={msLeft / 20000} urgent={msLeft < 3000}>
  <img src={qrDataUrl} width={320} height={320} alt="" />
</QRFrame>
```

The countdown sits just outside the accent ring so the booth's colour still dominates the screen.
Pair it with the manual code below the frame, set in tabular figures at .15em tracking.
