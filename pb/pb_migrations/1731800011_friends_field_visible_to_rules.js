/// <reference path="../pb_data/types.d.ts" />

// API rules can't read `hidden` fields for normal users, so `friends` is un-hidden here.
// It's still never returned to clients (stripped in onRecordEnrich) and can't be used in client filters (pb_hooks).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("friends").hidden = false
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.getByName("friends").hidden = true
  app.save(users)
})
