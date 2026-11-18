/// <reference path="../pb_data/types.d.ts" />

// `x.friends ?= id` doesn't match through a nested relation on PocketBase 0.40; `x.friends.id ?= id` does.
migrate((app) => {
  const ME = "@request.auth.id"
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.listRule = workouts.viewRule = `user = ${ME} || (visibility != 'private' && user.friends.id ?= ${ME})`
  app.save(workouts)
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && user.hide_stats != true && user.friends.id ?= ${ME})`
  app.save(sets)
  for (const n of ["comments", "reactions"]) {
    const c = app.findCollectionByNameOrId(n)
    c.listRule = c.viewRule = `workout.user = ${ME} || (workout.visibility != 'private' && workout.user.friends.id ?= ${ME})`
    app.save(c)
  }
}, (app) => {
  const ME = "@request.auth.id"
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.listRule = workouts.viewRule = `user = ${ME} || (visibility != 'private' && user.friends ?= ${ME})`
  app.save(workouts)
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && user.hide_stats != true && user.friends ?= ${ME})`
  app.save(sets)
  for (const n of ["comments", "reactions"]) {
    const c = app.findCollectionByNameOrId(n)
    c.listRule = c.viewRule = `workout.user = ${ME} || (workout.visibility != 'private' && (workout.user = ${ME} || workout.user.friends ?= ${ME}))`
    app.save(c)
  }
})
