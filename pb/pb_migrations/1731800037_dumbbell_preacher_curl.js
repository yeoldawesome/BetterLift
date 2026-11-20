/// <reference path="../pb_data/types.d.ts" />

// The plain "Preacher Curl" is the dumbbell version (there's now a separate "Machine Preacher Curl").
migrate((app) => {
  try {
    const r = app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Preacher Curl'")
    try { app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Dumbbell Preacher Curl'"); return } catch (_) {} // target name already taken
    r.set("name", "Dumbbell Preacher Curl")
    r.set("equipment", "dumbbell")
    r.set("log_tip", "Log the weight of one dumbbell and your reps for each set.")
    app.save(r)
  } catch (_) {}
}, (app) => {
  try {
    const r = app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Dumbbell Preacher Curl'")
    r.set("name", "Preacher Curl")
    r.set("equipment", "machine")
    r.set("log_tip", "Log the weight and reps for each set.")
    app.save(r)
  } catch (_) {}
})
