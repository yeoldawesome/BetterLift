/// <reference path="../pb_data/types.d.ts" />

// Adds an "adductors" muscle group (inner thigh) and corrects muscle assignments checked against ExRx and EMG write-ups.
migrate((app) => {
  // 1) Allow "adductors" anywhere a muscle can be chosen.
  for (const [col, fields] of [["exercises", ["muscle", "secondary"]], ["exercise_overrides", ["muscle", "secondary"]], ["feedback", ["muscle"]]]) {
    let c
    try { c = app.findCollectionByNameOrId(col) } catch (_) { continue }
    for (const f of fields) {
      const field = c.fields.getByName(f)
      if (!field || field.values.includes("adductors")) continue
      const vals = [...field.values]
      vals.splice(vals.indexOf("glutes") + 1, 0, "adductors")
      field.values = vals
      if (f === "secondary") field.maxSelect = vals.length
    }
    app.save(c)
  }

  // 2) Corrections. [name, muscle, secondary]
  const FIX = [
    ["Hip Adduction", "adductors", ["glutes"]],
    ["Dumbbell Pullover", "chest", ["back", "triceps"]], // ExRx files it under pectoralis major (sternal)
    ["Kettlebell Swing", "glutes", ["hamstrings", "back", "core", "shoulders"]], // glute max is the prime mover
    ["Trap Bar Deadlift", "glutes", ["quads", "hamstrings", "back", "forearms"]], // still hip-dominant, more quad than conventional
    ["Sumo Deadlift", "glutes", ["adductors", "quads", "hamstrings", "back"]],
    ["Barbell Deadlift", "back", ["glutes", "hamstrings", "adductors", "forearms", "core"]],
    ["Barbell Squat", "quads", ["glutes", "adductors", "hamstrings", "core"]],
    ["Front Squat", "quads", ["glutes", "adductors", "core"]],
    ["Straight-Arm Pulldown", "back", ["triceps", "core"]],
    ["Farmer's Carry", "forearms", ["back", "core", "shoulders"]],
  ]
  for (const [name, muscle, sec] of FIX) {
    let r
    try { r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { continue }
    r.set("muscle", muscle)
    r.set("secondary", sec)
    app.save(r)
  }
}, (app) => {
  try {
    const r = app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Hip Adduction'")
    r.set("muscle", "hamstrings"); r.set("secondary", ["glutes"]); app.save(r)
  } catch (_) {}
  app.db().newQuery("UPDATE exercises SET muscle = 'hamstrings' WHERE muscle = 'adductors'").execute()
  for (const [col, fields] of [["exercises", ["muscle", "secondary"]], ["exercise_overrides", ["muscle", "secondary"]], ["feedback", ["muscle"]]]) {
    let c
    try { c = app.findCollectionByNameOrId(col) } catch (_) { continue }
    for (const f of fields) {
      const field = c.fields.getByName(f)
      if (field) field.values = field.values.filter((v) => v !== "adductors")
    }
    app.save(c)
  }
})
