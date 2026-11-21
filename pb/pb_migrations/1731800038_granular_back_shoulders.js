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

  // 2) Official library. name: [muscle, secondary]
  const PRESS = ["triceps", "front_delts"], INCLINE = ["front_delts", "triceps"], FLY = ["front_delts"]
  const OHP = ["side_delts", "triceps"], REAR = ["upper_back"], SHRUG = ["forearms"], HINGE = ["glutes", "lower_back"]
  const MAP = {
    // chest: the front delts help every press and fly
    "Barbell Bench Press": ["chest", PRESS], "Incline Barbell Bench Press": ["chest", INCLINE], "Decline Barbell Bench Press": ["chest", PRESS],
    "Dumbbell Bench Press": ["chest", PRESS], "Incline Dumbbell Bench Press": ["chest", INCLINE], "Dumbbell Fly": ["chest", FLY], "Cable Fly": ["chest", FLY],
    "Machine Chest Press": ["chest", PRESS], "Machine Chest Fly": ["chest", FLY], "Push-Up": ["chest", ["triceps", "front_delts", "core"]], "Dip": ["chest", PRESS],
    "Smith Machine Bench Press": ["chest", PRESS], "Smith Machine Incline Bench Press": ["chest", INCLINE], "Incline Machine Chest Press": ["chest", INCLINE],
    "Iso-Lateral Chest Press": ["chest", PRESS], "Iso-Lateral Incline Chest Press": ["chest", INCLINE], "Supine Bench Press": ["chest", PRESS],
    "Decline Dumbbell Bench Press": ["chest", PRESS], "Incline Dumbbell Fly": ["chest", FLY], "Low-to-High Cable Fly": ["chest", FLY], "High-to-Low Cable Fly": ["chest", FLY],
    "Incline Push-Up": ["chest", PRESS], "Decline Push-Up": ["chest", INCLINE], "Dumbbell Pullover": ["chest", ["lats", "triceps"]],

    // vertical pulls and high rows: lats, with the upper back, rear delts and biceps helping
    "Lat Pulldown": ["lats", ["upper_back", "rear_delts", "biceps"]], "Close-Grip Lat Pulldown": ["lats", ["upper_back", "biceps"]],
    "Reverse-Grip Lat Pulldown": ["lats", ["biceps", "upper_back"]], "Pull-Up": ["lats", ["upper_back", "biceps", "forearms", "core"]],
    "Wide-Grip Pull-Up": ["lats", ["upper_back", "rear_delts", "biceps"]], "Chin-Up": ["lats", ["biceps", "upper_back", "forearms"]],
    "Assisted Pull-Up": ["lats", ["upper_back", "biceps"]], "Machine High Row": ["lats", ["upper_back", "rear_delts", "biceps"]],
    "Iso-Lateral High Row": ["lats", ["upper_back", "rear_delts", "biceps"]], "Straight-Arm Pulldown": ["lats", ["triceps", "core"]],
    "Machine Pullover": ["lats", ["chest", "triceps"]], "Scapular Pull-Up": ["traps", ["lats", "upper_back"]],
    // rows: tucked elbows lean on the lats, wide / chest-supported rows on the upper back; bent-over rows also hold the lower back
    "Barbell Row": ["lats", ["upper_back", "rear_delts", "biceps", "lower_back", "forearms"]], "Pendlay Row": ["upper_back", ["lats", "rear_delts", "biceps", "lower_back"]],
    "Dumbbell Row": ["lats", ["upper_back", "rear_delts", "biceps"]], "Seated Cable Row": ["lats", ["upper_back", "rear_delts", "biceps"]],
    "T-Bar Row": ["upper_back", ["lats", "rear_delts", "biceps", "lower_back"]], "Machine Row": ["upper_back", ["lats", "rear_delts", "biceps"]],
    "Iso-Lateral Row": ["upper_back", ["lats", "rear_delts", "biceps"]], "Iso-Lateral Low Row": ["lats", ["upper_back", "biceps"]],
    "Wide-Grip Seated Cable Row": ["upper_back", ["rear_delts", "lats", "biceps"]], "Chest-Supported T-Bar Row": ["upper_back", ["lats", "rear_delts", "biceps"]],
    "Smith Machine Row": ["lats", ["upper_back", "rear_delts", "biceps", "lower_back"]], "Seal Row": ["upper_back", ["lats", "rear_delts", "biceps"]],
    "Inverted Row": ["upper_back", ["lats", "rear_delts", "biceps"]],
    // hinges and extensions: lower back
    "Barbell Deadlift": ["lower_back", ["glutes", "hamstrings", "adductors", "traps", "forearms", "core"]], "Deficit Deadlift": ["lower_back", ["hamstrings", "glutes", "traps", "forearms"]],
    "Rack Pull": ["lower_back", ["traps", "glutes", "hamstrings", "forearms"]], "Back Extension": ["lower_back", ["glutes", "hamstrings"]],
    "Machine Back Extension": ["lower_back", ["glutes", "hamstrings"]], "Trap Bar Deadlift": ["glutes", ["quads", "hamstrings", "lower_back", "traps", "forearms"]],
    "Romanian Deadlift": ["hamstrings", HINGE], "Good Morning": ["hamstrings", HINGE], "Stiff-Leg Deadlift": ["hamstrings", HINGE], "Dumbbell Romanian Deadlift": ["hamstrings", HINGE],
    "Sumo Deadlift": ["glutes", ["adductors", "quads", "hamstrings", "lower_back"]],
    // shrugs: traps
    "Barbell Shrug": ["traps", SHRUG], "Dumbbell Shrug": ["traps", SHRUG], "Smith Machine Shrug": ["traps", SHRUG], "Machine Shrug": ["traps", SHRUG],
    "Cable Shrug": ["traps", SHRUG], "Chest-Supported Dumbbell Shrug": ["traps", ["upper_back"]],

    // shoulders
    "Barbell Overhead Press": ["front_delts", ["side_delts", "triceps", "traps", "core"]], "Seated Dumbbell Shoulder Press": ["front_delts", OHP],
    "Machine Shoulder Press": ["front_delts", OHP], "Arnold Press": ["front_delts", OHP], "Dumbbell Shoulder Press": ["front_delts", OHP],
    "Seated Barbell Shoulder Press": ["front_delts", OHP], "Seated Smith Machine Shoulder Press": ["front_delts", OHP], "Iso-Lateral Shoulder Press": ["front_delts", OHP],
    "Push Press": ["front_delts", ["side_delts", "triceps", "quads"]], "Landmine Press": ["front_delts", ["chest", "triceps"]],
    "Dumbbell Front Raise": ["front_delts", ["chest"]], "Cable Front Raise": ["front_delts", ["chest"]], "Single-Arm Cable Front Raise": ["front_delts", ["chest"]],
    "Dumbbell Lateral Raise": ["side_delts", []], "Cable Lateral Raise": ["side_delts", []], "Machine Lateral Raise": ["side_delts", []],
    "Seated Dumbbell Lateral Raise": ["side_delts", []], "Incline Side-Lying Lateral Raise": ["side_delts", []],
    "Upright Row": ["side_delts", ["traps", "biceps"]], "Cable Upright Row": ["side_delts", ["traps", "biceps"]],
    "Reverse Pec Deck": ["rear_delts", REAR], "Cable Reverse Fly": ["rear_delts", REAR], "Single-Arm Cable Reverse Fly": ["rear_delts", REAR],
    "Dumbbell Reverse Fly": ["rear_delts", REAR], "Face Pull": ["rear_delts", ["upper_back", "traps"]],

    // others that listed back / shoulders as helpers
    "Close-Grip Bench Press": ["triceps", ["chest", "front_delts"]], "Close-Grip Incline Bench Press": ["triceps", ["chest", "front_delts"]],
    "Bench Dip": ["triceps", ["chest", "front_delts"]], "Machine Seated Dip": ["triceps", ["chest", "front_delts"]], "Diamond Push-Up": ["triceps", ["chest", "front_delts"]],
    "Farmer's Carry": ["forearms", ["traps", "core"]], "Dead Hang": ["forearms", ["lats"]],
    "Plank": ["core", ["front_delts"]], "Side Plank": ["core", ["side_delts"]], "Ab Wheel Rollout": ["core", ["lats", "front_delts"]],
    "Cable Woodchopper": ["core", ["front_delts"]], "Mountain Climber": ["core", ["front_delts", "quads"]],
    "Kettlebell Swing": ["glutes", ["hamstrings", "lower_back", "core", "front_delts"]],
    "Power Clean": ["full_body", ["quads", "glutes", "traps", "lower_back"]], "Hang Clean": ["full_body", ["quads", "glutes", "traps", "lower_back"]],
    "Snatch": ["full_body", ["quads", "glutes", "traps", "lower_back", "front_delts"]], "Clean and Jerk": ["full_body", ["quads", "glutes", "traps", "front_delts", "triceps"]],
    "Thruster": ["full_body", ["quads", "front_delts", "triceps", "glutes"]], "Burpee": ["full_body", ["chest", "quads", "front_delts"]],
    "Turkish Get-Up": ["full_body", ["front_delts", "side_delts", "core", "glutes"]], "Battle Ropes": ["full_body", ["front_delts", "core"]],
    "Rowing Machine": ["cardio", ["lats", "upper_back", "quads", "biceps"]], "Ski Erg": ["cardio", ["lats", "triceps", "core"]],
    "Swimming": ["cardio", ["lats", "front_delts", "side_delts"]], "Air Bike": ["cardio", ["quads", "front_delts"]],
    "Jump Rope": ["cardio", ["calves", "front_delts"]], "Jumping Jack": ["cardio", ["calves", "side_delts"]],
  }
  const official = new Set()
  for (const name of Object.keys(MAP)) {
    let r
    try { r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { continue }
    r.set("muscle", MAP[name][0])
    r.set("secondary", MAP[name][1])
    app.save(r)
    official.add(r.id)
  }

  // 3) Custom exercises and personal overrides: place "back" / "shoulders" by name where it's clear; otherwise keep the whole group.
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
    if (official.has(r.id)) continue
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
