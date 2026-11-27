import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarcodeIcon, BackIcon, BoltIcon, CheckIcon, CloseIcon, PlusIcon, SearchIcon, SparkIcon } from '../icons'
import { Button, ErrorText, Input, Sheet, Spinner, Toggle } from '../ui'
import { estimateMeal, itemFromLookup, lookupPhrase, mealIn, parseMacros, parseWeight } from '../../lib/foodParse'
import { foodFromLog, LOCAL_FOODS, lookupBarcode, lookupFood, macrosFor, searchLocal, searchOff, type Food } from '../../lib/foods'
import { addLogs, dayLabel, kcalFrom, logWeighIn, recentFoods, type Draft, type FoodLog, type Macros, type Meal, type Source } from '../../lib/nutrition'
import { errMsg, useUser } from '../../lib/pb'
import { cachedSaved, createSaved, itemFromDraft, itemsTotal, loadSaved, logSaved, type SavedMeal } from '../../lib/meals'
import { fmtW, fromUnit } from '../../lib/format'
import { RESTAURANTS, type Restaurant } from '../../lib/restaurants'
import { labelMacros, readLabel } from '../../lib/labelOcr'
import { fmtK, MacroLine, MealChips, NumField, Stepper } from './bits'

const Scanner = lazy(() => import('./Scanner'))

export type Tab = 'describe' | 'search' | 'scan' | 'quick'
const TABS: [Tab, string, typeof SparkIcon][] = [['describe', 'Describe', SparkIcon], ['search', 'Search', SearchIcon], ['scan', 'Scan', BarcodeIcon], ['quick', 'Quick', BoltIcon]]
const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
const total = (ms: Macros[]) => ms.reduce((t, m) => ({ kcal: t.kcal + m.kcal, p: t.p + m.p, c: t.c + m.c, f: t.f + m.f }), { kcal: 0, p: 0, c: 0, f: 0 })

type QuickPrefill = { name?: string; macros?: Macros; barcode?: string; source?: Source; note?: string }

/** Full-screen "log food" sheet: describe it, search, scan a barcode, or type macros. */
export function AddFood({ day, meal: meal0, tab: tab0 = 'describe', onClose, onAdded, collect, title = 'Log food' }: {
  day: string; meal: Meal; tab?: Tab; onClose: () => void; onAdded?: (logs: FoodLog[]) => void
  /** Building a saved meal or editing a logged one: hand the picked foods back instead of logging them. */
  collect?: (drafts: Draft[]) => void; title?: string
}) {
  const [tab, setTab] = useState<Tab>(tab0)
  const [meal, setMeal] = useState<Meal>(meal0)
  const [mealTouched, setMealTouched] = useState(false)
  const [picked, setPicked] = useState<{ food: Food; source: Source } | null>(null)
  const [recent, setRecent] = useState<Food[]>([])
  const [q, setQ] = useState('')
  const [rest, setRest] = useState<Restaurant | null>(null)
  const [quick, setQuick] = useState<QuickPrefill>({})
  const [toast, setToast] = useState('')
  const [scanKey, setScanKey] = useState(0)
  const [saved, setSaved] = useState<SavedMeal[]>([])

  useEffect(() => {
    if (collect) return
    cachedSaved().then((l) => setSaved((cur) => (cur.length ? cur : l)))
    loadSaved().then(setSaved).catch(() => {})
  }, [collect])
  useEffect(() => { recentFoods().then((ls) => setRecent(ls.map(foodFromLog))).catch(() => {}) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t) }, [toast])

  /** Saves; Describe/Quick close the sheet, Search/Scan stay open so you can add more. */
  const save = async (drafts: Draft[], close: boolean) => {
    if (collect) collect(drafts)
    else onAdded?.(await addLogs(drafts, day))
    if (close) return onClose()
    setPicked(null)
    if (tab === 'scan') setScanKey((k) => k + 1)
    setToast(`Added ${drafts.length === 1 ? drafts[0].name : `${drafts.length} items`} · ${fmtK(drafts.reduce((t, d) => t + d.macros.kcal, 0))} kcal`)
  }
  const go = (t: Tab) => { setPicked(null); setTab(t) }

  return (
    <Sheet title={title} subtitle={collect ? undefined : dayLabel(day)} onClose={onClose}>
      <div className="space-y-3 pb-6">
        {!collect && <MealChips value={meal} onChange={(m) => { setMeal(m); setMealTouched(true) }} />}
        {!collect && !picked && saved.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">My meals</p>
            <div className="bleed-x flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {saved.map((sm) => (
                <button key={sm.id} onClick={async () => {
                  try { onAdded?.(await logSaved(sm, meal, day)); setToast(`Added ${sm.name} · ${fmtK(itemsTotal(sm.items ?? []).kcal)} kcal`) } catch (e) { setToast(errMsg(e)) }
                }} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-2 pr-3 text-sm font-semibold active:scale-[0.98]">
                  <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-accent"><PlusIcon width={14} height={14} /></span>
                  <span className="max-w-[10rem] truncate">{sm.name}</span>
                  <span className="num text-xs text-muted">{fmtK(itemsTotal(sm.items ?? []).kcal)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {!picked && (
          <div className="grid grid-cols-4 gap-1.5">
            {TABS.map(([t, label, Icon]) => (
              <button key={t} onClick={() => go(t)}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-xs font-bold transition ${tab === t ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted'}`}>
                <Icon width={20} height={20} />{label}
              </button>
            ))}
          </div>
        )}
        {toast && <p className="flex items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-sm font-bold text-accent"><CheckIcon width={16} height={16} className="shrink-0" aria-hidden />{toast}</p>}

        {picked ? (
          <FoodDetail food={picked.food} source={picked.source} meal={meal} onBack={() => setPicked(null)} onAdd={(d) => save([d], false)} />
        ) : tab === 'describe' ? (
          <Describe day={day} meal={meal} recent={recent} collecting={!!collect} onMeal={(m) => !mealTouched && setMeal(m)} onSave={(ds) => save(ds, true)} onWeighed={onClose}
            onSearch={(s) => { setQ(s); go('search') }} onQuick={(p) => { setQuick(p); go('quick') }} />
        ) : tab === 'search' ? (
          <Search q={q} setQ={setQ} rest={rest} setRest={setRest} recent={recent} meal={meal} onPick={(food) => setPicked({ food, source: food.source === 'recent' ? 'recent' : 'search' })}
            onAdd={(d) => save([d], false)} />
        ) : tab === 'scan' ? (
          <Scan key={scanKey} onFound={(food) => setPicked({ food, source: 'barcode' })} onManual={(barcode) => { setQuick({ barcode, source: 'barcode' }); go('quick') }}
            onLabel={(p) => { setQuick(p); go('quick') }} />
        ) : (
          <Quick key={JSON.stringify(quick)} prefill={quick} meal={meal} onSave={(d) => save([d], true)} onLabel={(p) => setQuick((q) => ({ ...p, barcode: q.barcode ?? p.barcode, source: q.source ?? p.source }))} />
        )}
      </div>
    </Sheet>
  )
}

/** Runs an async save with a busy flag and error message. */
function useRun() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return { busy, err, run }
}

// ---------- Describe: exact macros or a meal estimate from plain English ----------

function Describe({ day, meal, recent, collecting, onMeal, onSave, onWeighed, onSearch, onQuick }: {
  day: string; meal: Meal; recent: Food[]; collecting: boolean; onMeal: (m: Meal) => void; onSave: (d: Draft[]) => Promise<void>; onWeighed: () => void; onSearch: (q: string) => void; onQuick: (p: QuickPrefill) => void
}) {
  const unit = useUser()?.unit || 'lb'
  const [text, setText] = useState('')
  const [name, setName] = useState('')
  const [edits, setEdits] = useState<Record<string, number | null>>({})
  const [asOne, setAsOne] = useState<boolean | null>(null)
  const [keep, setKeep] = useState(false)
  const { busy, err, run } = useRun()
  const weigh = useMemo(() => parseWeight(text), [text])
  const macro = useMemo(() => (weigh ? null : parseMacros(text)), [text, weigh])
  const est = useMemo(() => (weigh || macro || !text.trim() ? null : estimateMeal(text, recent)), [text, weigh, macro, recent])
  const weighKg = weigh ? fromUnit(weigh.value, weigh.unit ?? unit) : 0
  useEffect(() => { const m = mealIn(text); if (m) onMeal(m) }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  // Parts the built-in foods/menus can't place are looked up on FatSecret (after a pause in typing).
  // found[phrase]: a food, null = nothing online, missing = still looking.
  const [found, setFound] = useState<Record<string, Food | null>>({})
  const unknownPhrases = (est?.unknown ?? []).map((u) => [u, lookupPhrase(u)] as const)
  const pending = unknownPhrases.filter(([, p]) => p.length >= 3 && !(p in found))
  const pendingKey = pending.map(([, p]) => p).join('|')
  useEffect(() => {
    if (!pendingKey) return
    let live = true
    const t = setTimeout(() => {
      for (const p of pendingKey.split('|')) lookupFood(p).then((f) => { if (live) setFound((o) => ({ ...o, [p]: f })) }, () => { if (live) setFound((o) => ({ ...o, [p]: null })) })
    }, 600)
    return () => { live = false; clearTimeout(t) }
  }, [pendingKey])
  const online = unknownPhrases.filter(([, p]) => found[p]).map(([u, p]) => itemFromLookup(u, found[p]!))
  const looking = new Set(pending.map(([u]) => u))
  const stillUnknown = unknownPhrases.filter(([, p]) => !found[p]).map(([u]) => u)

  // Your tweaks stick to an item while you keep typing elsewhere in the sentence.
  const items = [...(est?.items ?? []), ...online].map((it, i) => {
    const key = `${it.food.key}|${it.said}|${i}`
    const servings = edits[key] === undefined ? it.servings : edits[key]
    return { ...it, key, servings, macros: servings == null ? null : macrosFor(it.food.servings[0], servings) }
  }).filter((it) => it.servings !== null) as (ReturnType<typeof estimateMeal>['items'][number] & { key: string; servings: number; macros: Macros })[]
  const sum = total(items.map((i) => i.macros))
  const drafts: Draft[] = items.map((it) => ({ name: it.food.name, detail: undefined, meal, servings: it.servings, base: it.food.servings[0], macros: it.macros, source: 'estimate' as const }))
  // A restaurant order ("a Chipotle burrito") is one dish: log it as one meal unless you say otherwise.
  const one = items.length > 1 && (asOne ?? !!est?.title)
  const mealName = name.trim() || est?.title || (items.length > 1 ? items.slice(0, 3).map((i) => i.food.name.replace(/,.*$/, '')).join(', ') : items[0]?.food.name ?? '')
  const saveEstimate = async () => {
    const mi = drafts.map(itemFromDraft)
    if (keep) await createSaved(mealName, mi.length > 1 ? 'meal' : 'food', mi)
    await onSave(one ? [{ name: mealName, detail: mi.map((i) => i.name).join(', '), meal, servings: 1, base: null, macros: sum, source: 'estimate', items: mi }] : drafts)
  }
  const fromMacros = macro ? kcalFrom(macro.macros.p, macro.macros.c, macro.macros.f) : 0

  return (
    <div className="space-y-3">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus maxLength={500}
        placeholder={'Describe what you ate…\n“two chicken tacos with cheese and salsa and a diet soda”\n“36g protein, 26g carbs, 48g fat, 680 calories”'}
        className="block w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-base outline-none placeholder:text-faint focus:border-accent" />

      {weigh ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Weigh-in</p>
          <p className="num text-3xl font-black">{fmtW(weighKg, unit)} <span className="text-base font-bold text-muted">{unit}</span></p>
          <ErrorText>{err}</ErrorText>
          <Button disabled={busy || weighKg < 25 || weighKg > 320} onClick={() => run(async () => { await logWeighIn(weighKg, day); onWeighed() })}>{busy ? 'Saving…' : `Log weight · ${dayLabel(day)}`}</Button>
        </div>
      ) : macro ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">Exact numbers — logged as written</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([['kcal', 'kcal', macro.macros.kcal], ['P', 'protein', macro.macros.p], ['C', 'carbs', macro.macros.c], ['F', 'fat', macro.macros.f]] as const).map(([k, l, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 py-2"><p className="num text-xl font-black">{Math.round(v as number)}</p><p className="text-[11px] font-semibold text-muted">{l}</p></div>
            ))}
          </div>
          {!macro.kcalGiven && <p className="text-xs text-muted">Calories calculated from macros (4/4/9 per gram).</p>}
          {macro.kcalGiven && fromMacros > 0 && Math.abs(fromMacros - macro.macros.kcal) > Math.max(30, macro.macros.kcal * 0.15) && (
            <p className="text-xs text-muted">Heads up: those macros add up to {fmtK(fromMacros)} kcal. Logging the {fmtK(macro.macros.kcal)} you wrote.</p>
          )}
          <Input placeholder={macro.name === 'Quick add' ? 'Name (optional)' : macro.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <ErrorText>{err}</ErrorText>
          <Button disabled={busy || macro.macros.kcal <= 0} onClick={() => run(() => onSave([{ name: name.trim() || macro.name, meal, servings: 1, base: null, macros: macro.macros, source: 'text' }]))}>
            {busy ? 'Saving…' : `Log ${fmtK(macro.macros.kcal)} kcal`}
          </Button>
          <button onClick={() => onQuick({ name: name.trim() || (macro.name === 'Quick add' ? '' : macro.name), macros: macro.macros, source: 'text' })} className="w-full text-center text-sm font-semibold text-accent">Edit the numbers first</button>
        </div>
      ) : est && (items.length > 0 || est.unknown.length > 0) ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">
            {est.restaurant ? `${est.restaurant.name} menu — adjust portions to match your order` : 'Estimate — adjust amounts to match what you ate'}
          </p>
          {items.map((it) => (
            <div key={it.key} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{it.food.name}</p>
                <p className="num truncate text-xs text-muted">{fmtK(it.macros.kcal)} kcal · {it.food.servings[0].label}{it.approx ? ' · rough' : ''}</p>
              </div>
              <Stepper value={it.servings} onChange={(v) => setEdits((e) => ({ ...e, [it.key]: v }))} />
              <button onClick={() => setEdits((e) => ({ ...e, [it.key]: null }))} className="grid size-8 shrink-0 place-items-center text-faint" aria-label={`Remove ${it.food.name}`}><CloseIcon width={16} height={16} /></button>
            </div>
          ))}
          {stillUnknown.map((u) => (
            <div key={u} className="flex items-center gap-2 rounded-xl border border-dashed border-line p-2 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate text-muted">{looking.has(u) ? `Looking up “${u}”…` : `Couldn't estimate “${u}”`}</span>
              {looking.has(u)
                ? <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
                : <button onClick={() => onSearch(lookupPhrase(u) || u)} className="h-8 shrink-0 rounded-lg bg-surface-2 px-3 text-xs font-bold text-accent">Search it</button>}
            </div>
          ))}
          {online.length > 0 && (
            // FatSecret's free API requires this attribution wherever its data is shown.
            <p className="text-right text-[11px] text-faint">Some items <a href="https://www.fatsecret.com" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">powered by FatSecret</a></p>
          )}
          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5">
                <MacroLine m={sum} />
                <span className="num text-lg font-black">{fmtK(sum.kcal)} kcal</span>
              </div>
              <p className="text-xs text-muted">{est.restaurant ? `Standard ${est.restaurant.name} portions from its published nutrition info. “Double” counts 2 portions, “extra” 1.5, “light” half.` : 'Estimates use typical portions and recipes, so treat them as a starting point.'}</p>
              {!collecting && (
                <>
                  {(one || keep) && <Input placeholder={mealName} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Meal name" />}
                  {items.length > 1 && <Toggle on={one} onChange={setAsOne} title="Log as one meal" body={one ? 'One entry with these items inside' : 'Each item is logged separately'} />}
                  <Toggle on={keep} onChange={setKeep} title="Save to My meals" body="Log it again later with one tap" />
                </>
              )}
              <ErrorText>{err}</ErrorText>
              <Button disabled={busy} onClick={() => run(saveEstimate)}>
                {busy ? 'Saving…' : one ? `Log ${mealName} · ${fmtK(sum.kcal)} kcal` : `Log ${items.length} item${items.length === 1 ? '' : 's'} · ${fmtK(sum.kcal)} kcal`}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-1.5 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          <p className="font-bold text-ink">Two ways to use this</p>
          <p><span className="font-semibold text-ink">Know your numbers?</span> Type them: “40g protein 55g carbs 12g fat 480 cal”. They're logged exactly.</p>
          <p><span className="font-semibold text-ink">Just know the meal?</span> Describe it with amounts: “3 eggs, 2 slices of toast with butter and a coffee”. You'll get an estimate to review.</p>
          <p><span className="font-semibold text-ink">Ate out?</span> Name the place: “Chipotle burrito with white rice, black beans, double chicken and cheese” , “Panda Express bowl with orange chicken and white rice” or “chicken alfredo and 2 breadsticks at Olive Garden” uses their menu. Browse menus under Search.</p>
          <p><span className="font-semibold text-ink">Weighed in?</span> “I weigh 182” logs your weight.</p>
        </div>
      )}
    </div>
  )
}

// ---------- Search: built-in foods, your recents, and FatSecret (Open Food Facts as fallback) ----------

function FoodRow({ food, onPick, onAdd }: { food: Food; onPick: () => void; onAdd: () => Promise<void> }) {
  const s = food.servings[0]
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-2 border-b border-line py-2 last:border-0">
      <button onClick={onPick} className="min-w-0 flex-1 text-left">
        <p className="truncate font-bold">{food.name}</p>
        <p className="truncate text-xs text-muted">{[food.detail, s.label].filter(Boolean).join(' · ')}</p>
      </button>
      <span className="num shrink-0 text-sm font-bold">{fmtK(s.kcal)}<span className="text-xs font-semibold text-muted"> kcal</span></span>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await onAdd() } finally { setBusy(false) } }}
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent disabled:opacity-40" aria-label={`Add ${food.name}`}>
        <PlusIcon width={18} height={18} />
      </button>
    </div>
  )
}

function Search({ q, setQ, rest, setRest, recent, meal, onPick, onAdd }: {
  q: string; setQ: (q: string) => void; rest: Restaurant | null; setRest: (r: Restaurant | null) => void; recent: Food[]; meal: Meal; onPick: (f: Food) => void; onAdd: (d: Draft) => Promise<void>
}) {
  const [off, setOff] = useState<Food[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const local = useMemo(() => (q.trim() ? searchLocal(q, [...recent, ...LOCAL_FOODS], 15) : []), [q, recent])
  const [mq, setMq] = useState('')
  const restHits = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/[’']/g, '')
    return t.length < 2 ? [] : RESTAURANTS.filter((r) => [r.name.toLowerCase(), ...r.aliases].some((a) => a.startsWith(t) || t.startsWith(a)))
  }, [q])
  const menuHits = useMemo(() => (q.trim().length >= 3 ? searchLocal(q, RESTAURANTS.flatMap((r) => r.foods), 6) : []), [q])
  const menuList = useMemo(() => (!rest ? [] : mq.trim() ? searchLocal(mq, rest.foods, 100) : rest.foods), [rest, mq])

  useEffect(() => {
    setOff(null); setErr('')
    if (q.trim().length < 3) return
    const ctl = new AbortController()
    setLoading(true)
    const t = setTimeout(() => {
      searchOff(q.trim(), ctl.signal).then(setOff).catch((e) => { if (e?.name !== 'AbortError') setErr(e?.message || 'Search failed') }).finally(() => setLoading(false))
    }, 500)
    return () => { clearTimeout(t); ctl.abort(); setLoading(false) }
  }, [q])

  const quickAdd = (food: Food) => {
    const s = food.servings[0]
    return onAdd({ name: food.name, detail: food.detail ? `${food.detail} · ${s.label}` : undefined, meal, servings: 1, base: s, macros: macrosFor(s, 1), source: food.source === 'recent' ? 'recent' : 'search', barcode: food.barcode })
  }
  const section = (title: string, list: Food[], extra?: ReactNode) => (
    <div>
      <p className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted">{title}{extra}</p>
      <div className="rounded-2xl border border-line bg-surface px-3">{list.map((f) => <FoodRow key={f.key} food={f} onPick={() => onPick(f)} onAdd={() => quickAdd(f)} />)}</div>
    </div>
  )

  const restChips = (list: Restaurant[]) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((r) => (
        <button key={r.id} onClick={() => { setRest(r); setMq('') }} className="h-9 rounded-full border border-line bg-surface px-3 text-sm font-semibold active:scale-[0.98]">
          {r.name} <span className="text-xs text-muted">· {r.foods.length}</span>
        </button>
      ))}
    </div>
  )

  if (rest) return (
    <div className="space-y-3">
      <button onClick={() => setRest(null)} className="-ml-1 flex items-center gap-1 text-sm font-semibold text-accent"><BackIcon width={18} height={18} /> Restaurants</button>
      <div>
        <h3 className="text-xl font-extrabold leading-tight">{rest.name} menu</h3>
        <p className="text-xs text-muted">Standard portions from {rest.name}'s published nutrition info. Tap an item to change the amount.</p>
      </div>
      <div className="relative">
        <SearchIcon width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder={`Search ${rest.name}`} type="search" enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-base outline-none placeholder:text-faint focus:border-accent" />
      </div>
      {menuList.length ? section(`${menuList.length} item${menuList.length === 1 ? '' : 's'}`, menuList) : <p className="px-1 text-sm text-muted">Nothing on the {rest.name} menu matches.</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon width={18} height={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search foods, brands & restaurants" type="search" enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-base outline-none placeholder:text-faint focus:border-accent" />
      </div>
      {!q.trim() ? (
        <>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-muted">Restaurant menus</p>
            {restChips(RESTAURANTS)}
          </div>
          {recent.length ? section('Recent', recent.slice(0, 25)) : <p className="px-1 text-sm text-muted">Search common foods instantly, or any food, brand or restaurant item by name.</p>}
        </>
      ) : (
        <>
          {/* FatSecret results lead; the Open Food Facts fallback (packaged products only) sits below the built-in foods. */}
          {loading && <Spinner />}
          {off && off.length > 0 && off[0].source === 'fatsecret' && section('Foods & brands', off,
            // FatSecret's free API requires this attribution wherever its data is shown.
            <a href="https://www.fatsecret.com" target="_blank" rel="noopener noreferrer" className="normal-case tracking-normal text-faint underline-offset-2 hover:underline">Powered by FatSecret</a>)}
          {restHits.length > 0 && restChips(restHits)}
          {menuHits.length > 0 && section('Restaurant menus', menuHits)}
          {local.length > 0 && section('Common foods', local)}
          {off && off.length > 0 && off[0].source !== 'fatsecret' && section('Packaged foods', off, <span className="normal-case tracking-normal text-faint">Open Food Facts</span>)}
          {err && <p className="px-1 text-sm text-muted">{err}</p>}
          {!loading && off && !off.length && !local.length && !menuHits.length && !restHits.length && <p className="px-1 text-sm text-muted">No matches. Try fewer words, or use Quick to type the numbers from the label.</p>}
          {q.trim().length > 0 && q.trim().length < 3 && !local.length && <p className="px-1 text-sm text-muted">Keep typing…</p>}
        </>
      )}
    </div>
  )
}

// ---------- One food: pick serving + amount ----------

function FoodDetail({ food, source, meal, onBack, onAdd }: { food: Food; source: Source; meal: Meal; onBack: () => void; onAdd: (d: Draft) => Promise<void> }) {
  const gramBase = food.servings.find((s) => s.g && s.g > 0)
  const [si, setSi] = useState(0) // -1 = by grams
  const [n, setN] = useState(1)
  const [grams, setGrams] = useState(`${Math.round(food.servings[0].g ?? 100)}`)
  const { busy, err, run } = useRun()
  const byGrams = si === -1 && gramBase
  const base = byGrams ? gramBase : food.servings[Math.max(0, si)]
  const servings = byGrams ? num(grams) / gramBase.g! : n
  const m = macrosFor(base, servings)
  const detail = [food.detail, byGrams ? `${Math.round(num(grams))} g` : servings === 1 ? base.label : `${Math.round(servings * 100) / 100} × ${base.label}`].filter(Boolean).join(' · ')

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="-ml-1 flex items-center gap-1 text-sm font-semibold text-accent"><BackIcon width={18} height={18} /> Back</button>
      <div>
        <h3 className="text-xl font-extrabold leading-tight">{food.name}</h3>
        {(food.detail || food.barcode) && <p className="text-sm text-muted">{[food.detail, food.barcode && source === 'barcode' ? `#${food.barcode}` : ''].filter(Boolean).join(' · ')}</p>}
      </div>
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">Serving</p>
        <div className="flex flex-wrap gap-1.5">
          {food.servings.map((s, i) => (
            <button key={i} onClick={() => setSi(i)} className={`h-9 rounded-full px-3 text-sm font-semibold ${si === i ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{s.label}</button>
          ))}
          {gramBase && <button onClick={() => setSi(-1)} className={`h-9 rounded-full px-3 text-sm font-semibold ${si === -1 ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>Grams</button>}
        </div>
      </div>
      {byGrams ? (
        <NumField label="Amount" value={grams} onChange={setGrams} suffix="g" />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">Servings</span>
          <Stepper value={n} onChange={setN} step={0.5} />
        </div>
      )}
      <div className="grid grid-cols-4 gap-2 text-center">
        {([['kcal', m.kcal], ['protein', m.p], ['carbs', m.c], ['fat', m.f]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl bg-surface-2 py-2"><p className="num text-xl font-black">{Math.round(v)}</p><p className="text-[11px] font-semibold text-muted">{l === 'kcal' ? 'kcal' : `${l} g`}</p></div>
        ))}
      </div>
      <ErrorText>{err}</ErrorText>
      <Button disabled={busy || servings <= 0} onClick={() => run(() => onAdd({ name: food.name, detail, meal, servings, base, macros: m, source, barcode: food.barcode }))}>
        {busy ? 'Adding…' : `Add · ${fmtK(m.kcal)} kcal`}
      </Button>
    </div>
  )
}

// ---------- Scan ----------

/** Photo of a Nutrition Facts panel → numbers for Quick (read on the phone with Tesseract OCR, nothing uploaded). */
export function LabelScan({ barcode, onRead }: { barcode?: string; onRead: (p: QuickPrefill) => void }) {
  const [pct, setPct] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const pick = async (file: File | undefined) => {
    if (!file) return
    setErr(''); setPct(0)
    try {
      const r = await readLabel(file, setPct)
      const found = [r.kcal, r.p, r.c, r.f].filter((v) => v !== undefined).length
      if (!found) { setErr("Couldn't read the label. Get closer so the Nutrition Facts fill the photo, in good light, and try again."); return }
      onRead({ macros: labelMacros(r), barcode, source: barcode ? 'barcode' : undefined,
        note: `Read from the label${r.serving ? ` (per serving: ${r.serving})` : ''}${found < 4 ? '. Some values were missing' : ''}${r.inferred ? `. ${({ p: 'Protein', c: 'Carbs', f: 'Fat' } as const)[r.inferred]} was hard to read, so it was worked out from the calories` : ''}. Check the numbers before logging.` })
    } catch (e) { setErr(errMsg(e)) } finally { setPct(null) }
  }
  return (
    <div className="space-y-1.5">
      <label className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/60 bg-accent/10 text-sm font-bold text-accent active:scale-[0.98] ${pct !== null ? 'pointer-events-none opacity-70' : ''}`} data-label-scan>
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
        {pct !== null ? `Reading label… ${Math.round(pct * 100)}%` : 'Scan nutrition label'}
      </label>
      <ErrorText>{err}</ErrorText>
    </div>
  )
}

function Scan({ onFound, onManual, onLabel }: { onFound: (f: Food) => void; onManual: (barcode: string) => void; onLabel: (p: QuickPrefill) => void }) {
  const [code, setCode] = useState('')
  const [state, setState] = useState<{ k: 'scan' } | { k: 'looking'; code: string } | { k: 'missing'; code: string } | { k: 'error'; msg: string }>({ k: 'scan' })
  const look = async (c: string) => {
    setState({ k: 'looking', code: c })
    try {
      const f = await lookupBarcode(c)
      if (f) onFound(f)
      else setState({ k: 'missing', code: c })
    } catch (e) { setState({ k: 'error', msg: errMsg(e) }) }
  }
  return (
    <div className="space-y-3">
      {state.k === 'scan' ? (
        <Suspense fallback={<div className="grid aspect-[4/3] place-items-center rounded-2xl border border-line bg-black text-sm text-white/80">Starting camera…</div>}>
          <Scanner onCode={look} />
        </Suspense>
      ) : state.k === 'looking' ? (
        <div className="grid aspect-[4/3] place-items-center rounded-2xl border border-line bg-surface text-center text-sm text-muted"><div><Spinner />Looking up {state.code}…</div></div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 text-center">
          <p className="font-bold">{state.k === 'missing' ? `No nutrition info for ${state.code}` : state.msg}</p>
          {state.k === 'missing' && <p className="text-sm text-muted">This product isn't in Open Food Facts yet. Scan its nutrition label, or type the numbers in.</p>}
          {state.k === 'missing' && <LabelScan barcode={state.code} onRead={onLabel} />}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setState({ k: 'scan' })}>Scan again</Button>
            <Button onClick={() => onManual(state.k === 'missing' ? state.code : '')}>Enter label</Button>
          </div>
        </div>
      )}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.replace(/\D/g, '').length >= 6) look(code.replace(/\D/g, '')) }}>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 14))} inputMode="numeric" placeholder="Or type the barcode number"
          className="num h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-base outline-none placeholder:text-faint focus:border-accent" />
        <Button size="sm" className="h-12 px-4" disabled={code.length < 6}>Look up</Button>
      </form>
      <p className="text-xs text-muted">Product data from Open Food Facts, a free and open food database.</p>
      {state.k !== 'missing' && <div className="space-y-1.5 border-t border-line pt-3"><p className="text-xs font-bold uppercase tracking-wider text-muted">No barcode?</p><LabelScan onRead={onLabel} /></div>}
    </div>
  )
}

// ---------- Quick: type the macros ----------

function Quick({ prefill, meal, onSave, onLabel }: { prefill: QuickPrefill; meal: Meal; onSave: (d: Draft) => Promise<void>; onLabel: (p: QuickPrefill) => void }) {
  const m = prefill.macros
  const s = (v?: number) => (v ? `${Math.round(v * 10) / 10}` : '')
  const [name, setName] = useState(prefill.name ?? '')
  const [p, setP] = useState(s(m?.p))
  const [c, setC] = useState(s(m?.c))
  const [f, setF] = useState(s(m?.f))
  const [kcal, setKcal] = useState(s(m?.kcal))
  const { busy, err, run } = useRun()
  const calc = Math.round(kcalFrom(num(p), num(c), num(f)))
  const eff = kcal.trim() ? Math.round(num(kcal)) : calc
  return (
    <div className="space-y-3">
      {prefill.note ? <p className="rounded-xl bg-accent/15 px-3 py-2 text-sm font-semibold text-accent">{prefill.note}</p> : <LabelScan barcode={prefill.barcode} onRead={onLabel} />}
      <Input label="Name (optional)" placeholder={prefill.barcode ? `Barcode ${prefill.barcode}` : 'Quick add'} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <div className="grid grid-cols-3 gap-2">
        <NumField label="Protein" value={p} onChange={setP} suffix="g" dot="#0ea5e9" placeholder="0" />
        <NumField label="Carbs" value={c} onChange={setC} suffix="g" dot="#f59e0b" placeholder="0" />
        <NumField label="Fat" value={f} onChange={setF} suffix="g" dot="#ec4899" placeholder="0" />
      </div>
      <NumField label="Calories" value={kcal} onChange={setKcal} suffix="kcal" placeholder={calc ? `${calc} (from macros)` : '0'} />
      <p className="text-xs text-muted">
        {kcal.trim() ? (calc > 0 && Math.abs(calc - eff) > Math.max(30, eff * 0.15) ? `Using your ${fmtK(eff)} kcal (macros add up to ${fmtK(calc)}). Clear it to use the macros.` : 'Using the calories you entered.')
          : 'Leave calories blank to calculate them from the macros (4 kcal/g protein & carbs, 9 kcal/g fat).'}
      </p>
      <ErrorText>{err}</ErrorText>
      <Button disabled={busy || eff <= 0} onClick={() => run(() => onSave({
        name: name.trim() || (prefill.barcode ? `Barcode ${prefill.barcode}` : 'Quick add'), meal, servings: 1, base: null,
        macros: { kcal: eff, p: num(p), c: num(c), f: num(f) }, source: prefill.source ?? 'quick', barcode: prefill.barcode,
      }))}>{busy ? 'Saving…' : eff > 0 ? `Log ${fmtK(eff)} kcal` : 'Enter macros or calories'}</Button>
    </div>
  )
}
