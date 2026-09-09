One-line: the collectable — one visa label per booth, in the booth's own accent colour.

```jsx
<Stamp shortName="SAB" validFor="Sabai Sabai Zone" collected tilt={-4} accent="var(--scrap-terracotta)" />
<Stamp shortName="YTH" points={20} size={150} />
```

It is a **visa label**, not a round cachet: ICAO MRV-B proportion (105 × 74), field block,
visa number, and a two-line 44-character MRZ. `size` is the **width**; height follows.
At 150px and up you get the full field block; below that the booth code carries the label.
Unissued slots are dashed and faint with no MRZ ink, so the grid reads as a passport waiting
to be filled. `animate` plays the drop-and-settle exactly once, on the scan-success screen.
Every slot still needs a text label next to it — colour is never the only signal that a booth
was collected. Booth accents are used for the frame, tint, number and cachet; the data itself
stays `--app-ink`, because seven of the nine accents fall below 4.5:1 on white.
