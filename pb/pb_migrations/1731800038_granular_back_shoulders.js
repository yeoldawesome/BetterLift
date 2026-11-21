/// <reference path="../pb_data/types.d.ts" />

// Back and shoulders split into their own muscles: lats, traps, upper back (rhomboids / teres / infraspinatus),
// lower back (erectors), and front / side / rear delts. "back" and "shoulders" stay valid as whole-group values for
// anything we can't place; the app spreads them across the group.
const NEW = ["lats", "traps", "upper_back", "lower_back", "front_delts", "side_delts", "rear_delts"]
/** A multi-select as a plain JS array (Go slices don't have .map / .filter). */
const list = (r, f) => { const out = [], s = r.getStringSlice(f); for (let i = 0; i < s.length; i++) out.push(s[i]); return out }

migrate((app) => {
  // 1) Allow the new muscles anywhere a muscle can be chosen.
  for (const [col, fields] of [["exercises", ["muscle", "secondary"]], ["exercise_overrides", ["muscle", "secondary"]], ["feedback", ["muscle"]]]) {
    let c
    try { c = app.findCollectionByNameOrId(col) } catch (_) { continue }
    for (const f of fields) {
      const field = c.fields.getByName(f)
      if (!field) continue
      const vals = [...field.values]
      for (const m of NEW) if (!vals.includes(m)) vals.splice(vals.indexOf("shoulders") + 1 + NEW.indexOf(m), 0, m)
      field.values = vals
      if (f === "secondary") field.maxSelect = vals.length
    }
    app.save(c)
  }

  // 2) Every exercise and personal override (official ones get a full review in the next migration): place "back" / "shoulders" by name where it's clear; otherwise keep the whole group.
  const has = (n, re) => re.test(n.toLowerCase())
  const primary = (n, m) => {
    if (m === "back") {
      if (has(n, /reverse fly|rear delt|face pull|reverse pec|y.?raise/)) return "rear_delts"
      if (has(n, /shrug/)) return "traps"
      if (has(n, /back extension|hyperextension|superman|deadlift|rack pull|good morning/)) return "lower_back"
      if (has(n, /wide.?grip.*row|chest.?supported|seal row|\bt.?bar|inverted row|pendlay/)) return "upper_back"
      if (has(n, /row|pull|lat\b|pulldown/)) return "lats"
    }
    if (m === "shoulders") {
      if (has(n, /reverse fly|rear delt|face pull|reverse pec|y.?raise/)) return "rear_delts"
      if (has(n, /lateral|side raise|upright row/)) return "side_delts"
      if (has(n, /press|front raise|arnold|military|ohp/)) return "front_delts"
    }
    return m
  }
  const PULL = ["lats", "traps", "upper_back", "rear_delts", "biceps"]
  const secondary = (main, ms) => ms.map((s) => {
    if (s === "shoulders") return ["chest", "triceps", "front_delts", "side_delts"].includes(main) ? "front_delts" : PULL.includes(main) ? "rear_delts" : s
    if (s === "back") return ["hamstrings", "glutes", "quads", "adductors", "lower_back"].includes(main) ? "lower_back" : ["rear_delts", "side_delts", "front_delts"].includes(main) ? "upper_back" : s
    return s
  }).filter((s, i, a) => s !== main && a.indexOf(s) === i)
  const legacy = "(muscle = 'back' || muscle = 'shoulders' || secondary ~ 'back' || secondary ~ 'shoulders')"

  for (const r of app.findRecordsByFilter("exercises", legacy, "", 0, 0)) {
    const m = primary(r.getString("name"), r.getString("muscle"))
    r.set("muscle", m)
    r.set("secondary", secondary(m, list(r, "secondary")))
    app.save(r)
  }
  let overrides = []
  try { overrides = app.findRecordsByFilter("exercise_overrides", legacy, "", 0, 0) } catch (_) {}
  for (const o of overrides) {
    let ex
    try { ex = app.findRecordById("exercises", o.getString("exercise")) } catch (_) { continue }
    const name = o.getString("name") || ex.getString("name")
    const m = o.getString("muscle") ? primary(name, o.getString("muscle")) : ""
    if (m) o.set("muscle", m)
    if (list(o, "secondary").length) o.set("secondary", secondary(m || ex.getString("muscle"), list(o, "secondary")))
    app.save(o)
  }
}, (app) => {
  // Fold everything back into the two old groups.
  const back = { lats: "back", traps: "back", upper_back: "back", lower_back: "back", front_delts: "shoulders", side_delts: "shoulders", rear_delts: "shoulders" }
  const fold = (ms) => ms.map((m) => back[m] || m).filter((m, i, a) => a.indexOf(m) === i)
  for (const col of ["exercises", "exercise_overrides"]) {
    let rows = []
    try { rows = app.findRecordsByFilter(col, NEW.map((m) => `muscle = '${m}' || secondary ~ '${m}'`).join(" || "), "", 0, 0) } catch (_) { continue }
    for (const r of rows) {
      if (back[r.getString("muscle")]) r.set("muscle", back[r.getString("muscle")])
      r.set("secondary", fold(list(r, "secondary")).filter((m) => m !== r.getString("muscle")))
      app.save(r)
    }
  }
  try {
    for (const r of app.findRecordsByFilter("feedback", NEW.map((m) => `muscle = '${m}'`).join(" || "), "", 0, 0)) { r.set("muscle", back[r.getString("muscle")]); app.save(r) }
  } catch (_) {}
  for (const [col, fields] of [["exercises", ["muscle", "secondary"]], ["exercise_overrides", ["muscle", "secondary"]], ["feedback", ["muscle"]]]) {
    let c
    try { c = app.findCollectionByNameOrId(col) } catch (_) { continue }
    for (const f of fields) {
      const field = c.fields.getByName(f)
      if (!field) continue
      field.values = field.values.filter((v) => !NEW.includes(v))
      if (f === "secondary") field.maxSelect = field.values.length
    }
    app.save(c)
  }
})
