One-line: the passport's bottom bar — never more than three pages, and scan is always the raised circle.

```jsx
<TabBar active="stamps" onChange={setPage} onScan={openScanner}
  tabs={[{id:'cover',label:'Cover',icon:<Icon name="cover"/>},
         {id:'stamps',label:'Stamps',icon:<Icon name="stamps"/>},
         {id:'prize',label:'Prize',icon:<Icon name="prize"/>}]} />
```

The bar is translucent white over blur so the sky ground still reads through it.
