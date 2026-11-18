/// <reference path="../pb_data/types.d.ts" />

// Per-lift rest defaults (stored on the user's personal exercise override) and a default rest between exercises.
// Override values: 0 = use the user's default, -1 = rest timer off, otherwise seconds.
migrate((app) => {
  const ov = app.findCollectionByNameOrId("exercise_overrides")
  ov.fields.add(new NumberField({ name: "rest_s", onlyInt: true, min: -1, max: 900 }))
  ov.fields.add(new NumberField({ name: "rest_after_s", onlyInt: true, min: -1, max: 900 }))
  app.save(ov)
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new NumberField({ name: "default_rest_after_s", onlyInt: true, min: 0, max: 900 }))
  app.save(users)
}, (app) => {
  const ov = app.findCollectionByNameOrId("exercise_overrides")
  ov.fields.removeByName("rest_s")
  ov.fields.removeByName("rest_after_s")
  app.save(ov)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("default_rest_after_s")
  app.save(users)
})
