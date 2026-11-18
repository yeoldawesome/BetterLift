/// <reference path="../pb_data/types.d.ts" />

// Height on the user (factored into rank standards) and bodyweight logged with each workout.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new NumberField({ name: "height_cm", min: 0, max: 260 }))
  app.save(users)
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.fields.add(new NumberField({ name: "bodyweight_kg", min: 0, max: 400 }))
  app.save(workouts)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("height_cm")
  app.save(users)
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.fields.removeByName("bodyweight_kg")
  app.save(workouts)
})
