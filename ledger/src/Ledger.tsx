import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { bagRateFromKg, clientFromHash, clientsOf, emptyForm, isClient, kgRateFromBag, kgs, missingOf, monthName, NOT_NAMED, pct, rate, roll, sortLines, taka, today, validate, type Sale, type SaleForm } from './logic.ts'
import { supabase } from './supabase.ts'

const PAGE = 1000

// PostgREST returns at most 1000 rows per request, so read page by page.
async function fetchSales() {
  const all: Sale[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('ledger_sales').select('id, month, date, description, product, party, kg, rate, cost, note').order('id').range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as Sale[]))
    if (data.length < PAGE) return all
  }
}

const SAVE_ERROR = 'That did not save. Check your connection and try again.'

export function Ledger({ email }: { email: string }) {
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [overhead, setOverhead] = useState(150000)
  const [target, setTarget] = useState(0.15)
  const [overheadInput, setOverheadInput] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [month, setMonth] = useState('all')
  const [clientName, setClientName] = useState(() => clientFromHash(location.hash))
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [form, setForm] = useState<SaleForm>(emptyForm)
  const [editing, setEditing] = useState<Sale | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [status, setStatus] = useState({ text: '', err: false })
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false) // Phones only: the form stays hidden until asked for. Larger screens always show it.
  const formRef = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    try {
      const [rows, settings] = await Promise.all([fetchSales(), supabase.from('ledger_settings').select('overhead, target').single()])
      if (settings.error) throw settings.error
      setSales(rows)
      setOverhead(settings.data.overhead)
      setTarget(settings.data.target)
      setOverheadInput((v) => v || String(settings.data.overhead))
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  // The chosen customer lives in the address, so the phone's back button returns to all customers.
  useEffect(() => {
    const onHash = () => {
      setClientName(clientFromHash(location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (formOpen && window.matchMedia('(max-width: 640px)').matches) formRef.current?.scrollIntoView({ block: 'start' })
  }, [formOpen])

  useEffect(() => {
    if (!status.text || status.err) return
    const timer = setTimeout(() => setStatus({ text: '', err: false }), 5000)
    return () => clearTimeout(timer)
  }, [status])

  const lines = useMemo(() => sales ?? [], [sales])
  const months = useMemo(() => [...new Set(lines.map((s) => s.month))].sort().reverse(), [lines])
  const activeMonth = month !== 'all' && months.includes(month) ? month : 'all'
  const inMonth = activeMonth === 'all' ? lines : lines.filter((s) => s.month === activeMonth)
  const clients = clientsOf(inMonth)
  const client = clientName !== null ? lines.find((s) => isClient(s, clientName))?.party ?? null : null
  const clientLines = client === null ? lines : lines.filter((s) => isClient(s, client))
  const scoped = client === null ? inMonth : inMonth.filter((s) => isClient(s, client))
  const total = roll(scoped)
  const overheadTotal = overhead * new Set(scoped.map((s) => s.month)).size
  const net = total.gp - overheadTotal
  const needDetails = scoped.filter((s) => missingOf(s).length)
  const shown = (onlyMissing ? needDetails : scoped).slice().sort(sortLines)
  const products = [...new Set(scoped.map((s) => s.product))]
    .map((name) => ({ name, ...roll(scoped.filter((s) => s.product === name)) }))
    .sort((a, b) => b.gp - a.gp)
  const named = (key: 'product' | 'party') => [...new Set(lines.map((s) => s[key]))].filter((x) => x !== NOT_NAMED).sort()

  const barMax = Math.max(target * 1.25, 0.01)
  const set = (key: keyof SaleForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const say = (text: string, err = false) => setStatus({ text, err })
  const clientField = client === null || client === NOT_NAMED ? '' : client
  const clearForm = () => {
    setEditing(null)
    setFormOpen(false)
    setForm({ ...emptyForm, party: clientField })
  }
  const openClient = (name: string) => {
    location.hash = 'client=' + encodeURIComponent(name)
  }

  // New sales added from a customer's page start with that customer filled in.
  useEffect(() => {
    if (!editing) setForm((f) => ({ ...f, party: clientField }))
  }, [clientField])

  const startEdit = (s: Sale) => {
    setEditing(s)
    setForm({
      date: s.date ?? '',
      product: s.product === NOT_NAMED ? '' : s.product,
      party: s.party === NOT_NAMED ? '' : s.party,
      kg: String(s.kg),
      rate: String(bagRateFromKg(s.rate)),
      cost: String(s.cost),
      description: s.description,
      note: s.note,
    })
    say('')
    setFormOpen(true)
    formRef.current?.scrollIntoView({ block: 'nearest' })
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const problem = validate(form, editing?.month)
    if (problem) return say(problem, true)
    const row = {
      month: form.date ? form.date.slice(0, 7) : editing!.month,
      date: form.date || null,
      product: form.product.trim(),
      party: form.party.trim(),
      kg: Number(form.kg),
      rate: kgRateFromBag(Number(form.rate)),
      cost: Number(form.cost),
      description: form.description.trim(),
      note: form.note.trim(),
    }
    setSaving(true)
    const { error } = editing ? await supabase.from('ledger_sales').update(row).eq('id', editing.id) : await supabase.from('ledger_sales').insert(row)
    setSaving(false)
    if (error) return say(SAVE_ERROR, true)
    say(editing ? 'Changes saved.' : 'Sale added. Totals are updated.')
    clearForm()
    await load()
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from('ledger_sales').delete().eq('id', id)
    if (error) return say(SAVE_ERROR, true)
    setConfirming(null)
    if (editing?.id === id) clearForm()
    say('Sale deleted.')
    await load()
  }

  const saveOverhead = async (e: FormEvent) => {
    e.preventDefault()
    const value = Number(overheadInput)
    if (overheadInput === '' || !(value >= 0)) return say('Enter the monthly overhead as a number.', true)
    const { error } = await supabase.from('ledger_settings').update({ overhead: value }).eq('id', true)
    if (error) return say(SAVE_ERROR, true)
    say('Overhead saved.')
    await load()
  }

  const kg = Number(form.kg)
  const sell = kgRateFromBag(Number(form.rate))
  const previewReady = kg > 0 && sell > 0 && form.cost !== ''
  const previewRev = kg * sell
  const previewGp = previewRev - kg * Number(form.cost)

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Onno Ledger</h1>
          <p className="sub">
            {loadFailed ? 'Could not load the latest sales. Check your connection.' : sales ? `${lines.length} sales lines` : 'Loading sales…'} · {email}{' '}
            <button type="button" className="link" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </p>
        </div>
        <label>
          Showing
          <select id="f-month" value={activeMonth} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {client !== null && (
        <div className="clienthead">
          <button type="button" onClick={() => { location.hash = '' }}>← All customers</button>
          <h2>{client}</h2>
        </div>
      )}

      {client === null ? (
        <section className="tiles" aria-label="Summary">
          <Tile label="Revenue" value={taka(total.revenue)} />
          <Tile label="Gross profit" value={taka(total.gp)} />
          <Tile label="Fixed overhead" value={taka(overheadTotal)} />
          <Tile label="Net profit" value={taka(net)} />
          <Tile label="Net margin" value={pct(net / total.revenue)} />
          <Tile label="Kg sold" value={kgs(total.kg)} />
        </section>
      ) : (
        <section className="tiles" aria-label={`Summary for ${client}`}>
          <Tile label="Revenue" value={taka(total.revenue)} />
          <Tile label="Gross profit" value={taka(total.gp)} />
          <Tile label="Gross margin" value={pct(total.gp / total.revenue)} />
          <Tile label="Kg sold" value={kgs(total.kg)} />
          <Tile label="Avg rate" value={total.kg ? rate(total.revenue / total.kg) : '—'} />
          <Tile label="Sales lines" value={String(scoped.length)} />
        </section>
      )}

      {client === null && clients.length > 0 && (
        <section className="panel">
          <h2>Customers</h2>
          <div className="boxes">
            {clients.map((c) => (
              <button type="button" className="box" key={c.name} onClick={() => openClient(c.name)}>
                <strong>{c.name}</strong>
                <b>{taka(c.revenue)}</b>
                <span className={c.gp < 0 ? 'bad' : ''}>Profit {taka(c.gp)} · {pct(c.gp / c.revenue)}</span>
                <span>{kgs(c.kg)} kg · {c.sales} {c.sales === 1 ? 'sale' : 'sales'}</span>
                <span>{c.lastDate ? `Last sale ${c.lastDate}` : 'No dated sales'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="main">
        <section className={'panel formpanel' + (formOpen ? '' : ' closed')} ref={formRef}>
          <h2>{editing ? `Edit sale in ${monthName(editing.month)}` : 'Add a sale'}</h2>
          <form className="entry" onSubmit={save} noValidate>
            <label>
              Date
              <input id="s-date" type="date" max={today()} value={form.date} onChange={set('date')} />
            </label>
            <label>
              Product
              <input id="s-product" list="products" autoComplete="off" value={form.product} onChange={set('product')} />
            </label>
            <label className="wide">
              Customer or name
              <input id="s-party" list="parties" autoComplete="off" value={form.party} onChange={set('party')} />
            </label>
            <label>
              Kg
              <input id="s-kg" type="number" min="0" step="any" inputMode="decimal" value={form.kg} onChange={set('kg')} />
            </label>
            <label>
              Sell rate (৳/50 kg bag)
              <input id="s-rate" type="number" min="0" step="any" inputMode="decimal" value={form.rate} onChange={set('rate')} />
            </label>
            <label>
              Unit cost (৳/kg)
              <input id="s-cost" type="number" min="0" step="any" inputMode="decimal" value={form.cost} onChange={set('cost')} />
            </label>
            <label>
              Description (optional)
              <input id="s-desc" autoComplete="off" value={form.description} onChange={set('description')} />
            </label>
            <label className="wide">
              Note (optional)
              <input id="s-note" autoComplete="off" value={form.note} onChange={set('note')} />
            </label>
            <div className={'preview wide' + (previewReady && previewGp < 0 ? ' bad' : '')} aria-live="polite">
              {previewReady
                ? `${rate(sell)} per kg. Revenue ${taka(previewRev)}, gross profit ${taka(previewGp)} (${pct(previewGp / previewRev)})${previewGp < 0 ? '. This sale is below cost.' : ''}`
                : 'Enter kg, bag rate and cost to see the profit.'}
            </div>
            <div className="actions wide">
              <button className="primary" type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Add sale'}
              </button>
              {editing ? (
                <button type="button" onClick={() => { clearForm(); say('') }}>
                  Cancel edit
                </button>
              ) : (
                <button type="button" className="phoneonly" onClick={() => setFormOpen(false)}>
                  Close
                </button>
              )}
            </div>
          </form>
          <datalist id="products">{named('product').map((v) => <option key={v} value={v} />)}</datalist>
          <datalist id="parties">{named('party').map((v) => <option key={v} value={v} />)}</datalist>
          <p className={'status' + (status.err ? ' err' : '')} role="status">
            {status.text}
          </p>
        </section>

        <section className="panel">
          <div className="head">
            <h2>Sales lines</h2>
            <label className="check">
              <input id="f-missing" type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Only lines missing details ({needDetails.length})
            </label>
          </div>
          <div className="scroll tall">
            <table className="cards">
              <thead>
                <tr>
                  <th>Date</th><th>Product</th><th>Name</th><th className="n">Kg</th><th className="n">Rate</th><th className="n">Cost</th><th className="n">Revenue</th><th className="n">Gross profit</th><th>Details</th><th><span className="sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
                  const r = roll([s])
                  return (
                    <tr key={s.id}>
                      <td className="nowrap" data-label="Date">{s.date ?? '—'}</td>
                      <td className="title">{s.product}</td>
                      <td data-label="Name">
                        {client === null ? <button type="button" className="link" onClick={() => openClient(s.party)}>{s.party}</button> : s.party}
                      </td>
                      <td className="n" data-label="Kg">{kgs(s.kg)}</td>
                      <td className="n" data-label="Rate">{rate(s.rate)}</td>
                      <td className="n" data-label="Cost">{rate(s.cost)}</td>
                      <td className="n" data-label="Revenue">{taka(r.revenue)}</td>
                      <td className={'n' + (r.gp < 0 ? ' bad' : '')} data-label="Gross profit">{taka(r.gp)}</td>
                      <td className="full">
                        {missingOf(s).map((m) => <span className="chip" key={m}>{m}</span>)}
                        {s.description && <span className="note">{s.description}</span>}
                        {s.note && <span className="note">{s.note}</span>}
                      </td>
                      <td className="nowrap full">
                        {confirming === s.id ? (
                          <>
                            <button type="button" className="small danger" onClick={() => remove(s.id)}>Delete this sale</button>{' '}
                            <button type="button" className="small" onClick={() => setConfirming(null)}>Keep</button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="small" onClick={() => startEdit(s)}>Edit</button>{' '}
                            <button type="button" className="small" onClick={() => setConfirming(s.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {sales && !shown.length && <p className="empty">{onlyMissing ? 'No lines are missing details.' : client === null ? 'Use the form to add the first sale.' : 'No sales for this customer in this month.'}</p>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="head">
          <h2>Month by month</h2>
          {client === null && (
            <form className="ohrow" onSubmit={saveOverhead} noValidate>
              <label>
                Overhead per month (৳)
                <input id="s-overhead" type="number" min="0" step="any" value={overheadInput} onChange={(e) => setOverheadInput(e.target.value)} />
              </label>
              <button type="submit">Save overhead</button>
            </form>
          )}
        </div>
        <p className="hint">
          {client === null ? 'A new month appears when you add its first sale. The overhead amount applies to every month listed.' : 'Gross profit from this customer. Overhead is not split between customers.'}
        </p>
        <div className="scroll">
          <table className="cards">
            <thead>
              <tr>
                <th>Month</th><th className="n">Kg</th><th className="n">Revenue</th><th className="n">COGS</th><th className="n">Gross profit</th>
                {client === null ? <><th className="n">Overhead</th><th className="n">Net profit</th><th className="n">Net margin</th></> : <th className="n">Gross margin</th>}
              </tr>
            </thead>
            <tbody>
              {months.filter((m) => clientLines.some((s) => s.month === m)).map((m) => {
                const r = roll(clientLines.filter((s) => s.month === m))
                const n = r.gp - overhead
                return (
                  <tr key={m}>
                    <td className="nowrap title">{monthName(m)}</td>
                    <td className="n" data-label="Kg">{kgs(r.kg)}</td>
                    <td className="n" data-label="Revenue">{taka(r.revenue)}</td>
                    <td className="n" data-label="COGS">{taka(r.cogs)}</td>
                    <td className="n" data-label="Gross profit">{taka(r.gp)}</td>
                    {client === null ? (
                      <>
                        <td className="n" data-label="Overhead">{taka(overhead)}</td>
                        <td className={'n' + (n < 0 ? ' bad' : '')} data-label="Net profit">{taka(n)}</td>
                        <td className={'n' + (n < 0 ? ' bad' : '')} data-label="Net margin">{pct(n / r.revenue)}</td>
                      </>
                    ) : (
                      <td className={'n' + (r.gp < 0 ? ' bad' : '')} data-label="Gross margin">{pct(r.gp / r.revenue)}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Products</h2>
        <p className="hint">For the months shown above. The dark mark on each bar is the {(target * 100).toFixed(0)}% margin target from your workbook.</p>
        <div className="scroll">
          <table className="cards">
            <thead>
              <tr>
                <th>Product</th><th className="n">Kg</th><th className="n">Avg rate</th><th className="n">Avg cost</th><th className="n">Revenue</th><th className="n">Gross profit</th><th className="n">Margin</th><th>Against target</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const m = p.gp / p.revenue
                return (
                  <tr key={p.name}>
                    <td className="title">{p.name}</td>
                    <td className="n" data-label="Kg">{kgs(p.kg)}</td>
                    <td className="n" data-label="Avg rate">{rate(p.revenue / p.kg)}</td>
                    <td className="n" data-label="Avg cost">{rate(p.cogs / p.kg)}</td>
                    <td className="n" data-label="Revenue">{taka(p.revenue)}</td>
                    <td className={'n' + (p.gp < 0 ? ' bad' : '')} data-label="Gross profit">{taka(p.gp)}</td>
                    <td className={'n' + (m < 0 ? ' bad' : '')} data-label="Margin">{pct(m)}</td>
                    <td className="full">
                      <div className="bar">
                        <i style={{ width: `${Math.max(0, Math.min(1, m / barMax)) * 100}%` }} />
                        <u style={{ left: `${(target / barMax) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!formOpen && status.text && (
        <p className={'status toast phoneonly' + (status.err ? ' err' : '')} role="status">
          {status.text}
        </p>
      )}
      {!formOpen && (
        <div className="addbar phoneonly">
          <button type="button" className="primary" onClick={() => { say(''); setFormOpen(true) }}>
            + Add sale{client !== null && client !== NOT_NAMED ? ` for ${client}` : ''}
          </button>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}
