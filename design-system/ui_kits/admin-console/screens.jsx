const { Button, Card, Fig, Notice, DaySelector, CsvButton, Flag } = window.MFUInternationalFestival2026DesignSystem_f3c3aa;

const GROUPS = [
  { title: 'Run', items: ['Dashboard', 'Hall screen', 'Prize desk', 'Stage draw'] },
  { title: 'Set up', items: ['Event', 'Booths', 'Prizes & stock', 'Users & invites'] },
  { title: 'Records', items: ['Audit log', 'Reference lists'] },
];
const BOARD = [
  { n: 'International Food Festival', s: 214, c: 'var(--booth-1)', host: 'Student Union', loc: 'Hall A · middle', p: 15 },
  { n: 'Study Abroad Exhibition', s: 198, c: 'var(--booth-2)', host: 'Office of International Affairs', loc: 'Hall A · entrance', p: 10 },
  { n: 'Cultural Workshops', s: 184, c: 'var(--booth-8)', host: 'School of Liberal Arts', loc: 'Hall B · far corner', p: 20 },
  { n: 'Cultural Performances', s: 141, c: 'var(--booth-5)', host: 'MFU Cultural Centre', loc: 'Main stage', p: 20 },
  { n: 'Youth Booth', s: 126, c: 'var(--booth-3)', host: 'School of Applied Digital Technology', loc: 'Hall B · middle', p: 15 },
  { n: 'Special Talks and Seminars', s: 88, c: 'var(--booth-6)', host: 'Graduate School', loc: 'Hall C · far corner', p: 20 },
  { n: 'Zero Waste Corner', s: 41, c: 'var(--booth-9)', host: 'Green Campus Office', loc: 'Hall C · entrance', p: 10 },
];
const COUNTRIES = [['TH', 612], ['CN', 148], ['MM', 96], ['BT', 44], ['LA', 39], ['IN', 27], ['NP', 21], ['KH', 18]];
const CNAME = { TH: 'Thailand', CN: 'China', MM: 'Myanmar', BT: 'Bhutan', LA: 'Laos', IN: 'India', NP: 'Nepal', KH: 'Cambodia' };
const TIMELINE = [2, 5, 9, 14, 21, 26, 31, 28, 24, 27, 33, 29, 22, 17, 12, 8, 5, 3];

const lbl = { fontSize: 11, fontWeight: 600, letterSpacing: 'var(--tracking-eyebrow)', textTransform: 'uppercase', color: 'var(--app-ink-soft)', margin: 0 };
const fig = { fontVariantNumeric: 'tabular-nums', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontFamily: 'var(--font-display)' };

function Sidebar({ view, setView }) {
  return (
    <aside style={{ position: 'relative', width: 236, flexShrink: 0, background: 'var(--app-chrome)', color: 'var(--app-ink-on-chrome)', minHeight: 900, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '18px 18px 14px' }}>
        <img src="../../assets/logo-festival.png" alt="MFU International Festival 2026" style={{ display: 'block', width: 168, height: 'auto' }} />
        <div style={{ marginTop: 10, fontWeight: 700, fontSize: 16, fontFamily: 'var(--font-display)' }}>Passport admin</div>
      </div>
      <nav style={{ padding: '0 10px', position: 'relative' }}>
        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div style={{ ...lbl, color: 'var(--app-ink-on-chrome-soft)', padding: '0 10px 6px' }}>{g.title}</div>
            {g.items.map((it) => {
              const on = it === view;
              return (
                <button key={it} onClick={() => setView(it)} style={{
                  display: 'block', width: '100%', textAlign: 'left', font: 'inherit',
                  fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: on ? 600 : 400,
                  border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-pill)', padding: '8px 14px',
                  background: on ? 'rgba(255,255,255,.14)' : 'transparent',
                  color: on ? '#fff' : 'var(--app-ink-on-chrome-soft)',
                }}>{it}</button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ marginTop: 'auto', padding: 18, fontSize: 12, color: 'var(--app-ink-on-chrome-soft)', lineHeight: 1.7, position: 'relative' }}>
        My passport (test as visitor)<br />My account<br /><span style={{ textDecoration: 'underline' }}>Sign out</span>
      </div>
      <img src="../../assets/illus-campus-papercut.png" alt="" style={{ position: 'absolute', bottom: -30, left: -80, width: 420, opacity: .14, pointerEvents: 'none' }} />
    </aside>
  );
}

function Panel({ title, action, children }) {
  return (
    <section style={{ background: 'var(--app-panel)', borderRadius: 'var(--radius-xl)', padding: 20, boxShadow: 'var(--shadow-card)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={lbl}>{title}</h2>{action}
      </div>
      <div style={{ marginTop: 14 }}>{children}</div>
    </section>
  );
}

function Dashboard() {
  const [day, setDay] = React.useState('2026-09-17');
  const max = Math.max(...BOARD.map((b) => b.s));
  const tmax = Math.max(...TIMELINE);
  const pts = TIMELINE.map((v, i) => `${(i / (TIMELINE.length - 1)) * 100},${40 - (v / tmax) * 38}`).join(' ');
  return (
    <div>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--app-live)' }} />
            Live · connected · counters 1 min old
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--app-ink)' }}>Dashboard</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <DaySelector days={['2026-09-16', '2026-09-17', '2026-09-18']} value={day} onChange={setDay} />
          <Button tone="ghost" size="sm">Print / PDF</Button>
        </div>
      </header>

      <div style={{ marginTop: 16 }}><Notice tone="warning">Two booths have not uploaded badge artwork. They will use the generated stamp, which is the intended fallback — no action needed unless they want their own.</Notice></div>

      <section style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Card elevation="card" padding="18px"><Fig value="1,248" label="Visitors registered" /></Card>
        <Card elevation="card" padding="18px"><Fig value="992" label="Stamps collected" accent="var(--sky-800)" /></Card>
        <Card elevation="card" padding="18px"><Fig value="310" label="Prizes redeemed" accent="var(--app-warn-text)" /></Card>
        <Card elevation="card" padding="18px"><Fig value="87" label="Active last 15 min" accent="var(--green-500)" /></Card>
      </section>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="Booth leaderboard" action={<CsvButton name="leaderboard" rows={BOARD} />}>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BOARD.map((b, i) => (
              <li key={b.n} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--app-ink)' }}>
                <span style={{ width: 16, textAlign: 'right', color: 'var(--app-ink-soft)' }}>{i + 1}</span>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: b.c, flexShrink: 0 }} />
                <span style={{ width: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{b.n}</span>
                <span style={{ flex: 1, height: 18, borderRadius: 'var(--radius-xs)', background: 'var(--app-well)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(b.s / max) * 100}%`, background: i === 0 ? 'var(--app-foil)' : b.s < 60 ? 'var(--orange-500)' : b.c, borderRadius: 'var(--radius-xs)' }} />
                </span>
                <span style={{ ...fig, width: 40, textAlign: 'right', fontSize: 15 }}>{b.s}</span>
                <span style={{ width: 92, textAlign: 'right', fontSize: 11, fontWeight: 600, color: i === 0 || b.s < 60 ? 'var(--app-warn-text)' : 'var(--app-ink-soft)' }}>{i === 0 ? '★ top booth' : b.s < 60 ? 'needs traffic' : '·'}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Stamps per 5 minutes" action={<CsvButton name="timeline" rows={TIMELINE.map((v, i) => ({ t: i, stamps: v }))} />}>
          <svg viewBox="0 0 100 42" preserveAspectRatio="none" style={{ width: '100%', height: 190 }}>
            <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#23A9C9" stopOpacity=".38" /><stop offset="100%" stopColor="#23A9C9" stopOpacity=".02" /></linearGradient></defs>
            {[10, 20, 30].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(23,65,78,.1)" strokeWidth=".3" />)}
            <polygon points={`0,40 ${pts} 100,40`} fill="url(#tg)" />
            <polyline points={pts} fill="none" stroke="#23A9C9" strokeWidth=".8" vectorEffect="non-scaling-stroke" />
          </svg>
        </Panel>

        <Panel title="Participation" action={<CsvButton name="participation" rows={[{ a: 1 }]} confirm="This export contains personal data. Continue?" />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            <Fig value="836" label="Thai" size="sm" /><Fig value="412" label="International" size="sm" />
            <Fig value="704" label="Students" size="sm" /><Fig value="311" label="Public" size="sm" />
          </div>
          <h3 style={{ ...lbl, marginTop: 20 }}>Visitor funnel</h3>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Registered', 1248], ['First stamp', 1102], ['Five stamps', 618], ['Redeemed', 310]].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--app-ink)' }}>
                <span style={{ width: 92, color: 'var(--app-ink-soft)' }}>{l}</span>
                <span style={{ flex: 1, height: 14, background: 'var(--app-well)', borderRadius: 'var(--radius-xs)' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(v / 1248) * 100}%`, background: 'var(--sky-600)', borderRadius: 'var(--radius-xs)' }} />
                </span>
                <span style={{ ...fig, width: 44, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={`Countries · ${COUNTRIES.length} represented`} action={<CsvButton name="countries" rows={COUNTRIES.map(([c, n]) => ({ country: c, visitors: n }))} />}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: 'var(--app-ink)' }}>
            {COUNTRIES.map(([c, n]) => (
              <li key={c} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Flag code={c} /><span style={{ width: 110 }}>{CNAME[c]}</span>
                <span style={{ flex: 1, height: 12, background: 'var(--app-well)', borderRadius: 'var(--radius-xs)' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(n / COUNTRIES[0][1]) * 100}%`, background: 'var(--sky-600)', borderRadius: 'var(--radius-xs)' }} />
                </span>
                <span style={{ ...fig, width: 34, textAlign: 'right' }}>{n}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Booths() {
  const td = { padding: '12px 14px', borderBottom: '1px solid var(--app-rule)' };
  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div><div style={lbl}>Set up</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 32, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--app-ink)' }}>Booths</h1></div>
        <div style={{ display: 'flex', gap: 10 }}><Button tone="ghost" size="sm">Print table cards</Button><Button tone="primary" size="sm">Add a booth</Button></div>
      </header>
      <section style={{ marginTop: 18, background: 'var(--app-panel)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--app-ink)' }}>
          <thead><tr style={{ textAlign: 'left' }}>
            {['', 'Booth', 'Host unit', 'Location', 'Points', 'Days', 'Badge', 'Stamps'].map((h) => (
              <th key={h} style={{ ...lbl, ...td }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {BOARD.map((b, i) => (
              <tr key={b.n}>
                <td style={td}><span style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: b.c }} /></td>
                <td style={{ ...td, fontWeight: 600 }}>{b.n}</td>
                <td style={{ ...td, color: 'var(--app-ink-soft)' }}>{b.host}</td>
                <td style={{ ...td, color: 'var(--app-ink-soft)' }}>{b.loc}</td>
                <td style={{ ...td, ...fig }}>{b.p}</td>
                <td style={{ ...td, color: 'var(--app-ink-soft)' }}>1 · 2 · 3</td>
                <td style={{ ...td, color: i > 4 ? 'var(--app-warn-text)' : 'var(--app-ink-soft)' }}>{i > 4 ? 'generated' : 'uploaded'}</td>
                <td style={{ ...td, ...fig }}>{b.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p style={{ marginTop: 14, fontSize: 13, color: 'var(--app-ink-soft)', maxWidth: '64ch' }}>Points are priced by how far into the hall a booth sits — entrance 10, middle 15, far corner 20 — which is what makes a visitor walk past the entrance row.</p>
    </div>
  );
}

Object.assign(window, { Sidebar, Dashboard, Booths });
