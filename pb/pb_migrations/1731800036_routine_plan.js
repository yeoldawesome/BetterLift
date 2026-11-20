/// <reference path="../pb_data/types.d.ts" />

// Routine updates on finish can carry more than set counts:
//  - routine_exercises.sets: planned weight (kg) and reps per set, e.g. [{"w":100,"r":5}]. Prefills the workout.
//  - routine_exercises.note: the exercise note, shown again next time the routine is started.
//  - users.routine_update: what "Update routine" saves by default — "all" (exercises, sets, weights, notes),
//    "weights" (weights only) or "none" (keep the routine as it is). Empty = fall back to update_routine.
migrate((app) => {
  const rex = app.findCollectionByNameOrId("routine_exercises")
  rex.fields.add(new JSONField({ name: "sets", maxSize: 4000 }))
  rex.fields.add(new TextField({ name: "note", max: 1000 }))
  app.save(rex)
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({ name: "routine_update", values: ["all", "weights", "none"], maxSelect: 1 }))
  app.save(users)
}, (app) => {
  const rex = app.findCollectionByNameOrId("routine_exercises")
  rex.fields.removeByName("sets")
  rex.fields.removeByName("note")
  app.save(rex)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("routine_update")
  app.save(users)
})
