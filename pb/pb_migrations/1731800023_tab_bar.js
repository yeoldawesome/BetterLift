/// <reference path="../pb_data/types.d.ts" />

// Customisable bottom bar: ordered list of tab ids (Profile is always shown last). Empty = default layout.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new JSONField({ name: "tab_bar", maxSize: 500 }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("tab_bar")
  app.save(users)
})
