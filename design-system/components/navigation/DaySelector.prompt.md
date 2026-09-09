One-line: the day scope on every admin panel — labelled "Day 1/2/3", never by date.

```jsx
<DaySelector days={event.days} value={day} onChange={setDay} />
```

The selected pill is white on a tinted well. It defaults to today when today is an event day, otherwise "All".
