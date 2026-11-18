/// <reference path="../pb_data/types.d.ts" />

// Per-set type (warm-up, failure, drop, cool-down), per-exercise notes and superset groups.
// note: stored on the first set row of each exercise. superset: group number within the workout (0 = none).
migrate((app) => {
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.fields.add(new SelectField({ name: "set_type", values: ["normal", "warmup", "failure", "drop", "cooldown"], maxSelect: 1 }))
  sets.fields.add(new TextField({ name: "note", max: 1000 }))
  sets.fields.add(new NumberField({ name: "superset", onlyInt: true, min: 0, max: 100 }))
  app.save(sets)
}, (app) => {
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.fields.removeByName("set_type")
  sets.fields.removeByName("note")
  sets.fields.removeByName("superset")
  app.save(sets)
})
