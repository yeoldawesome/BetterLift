/// <reference path="../pb_data/types.d.ts" />

// Notification controls.
//  - push_off: kinds of push notification the user turned off in Settings (e.g. ["reactions"]). Empty = everything on.
//    Only stops the phone notification; the in-app notification list and badge still count them.
//  - push_asked: has seen the "turn on notifications" popup (shown once, after account setup).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new JSONField({ name: "push_off", maxSize: 1000 }))
  users.fields.add(new BoolField({ name: "push_asked" }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("push_off")
  users.fields.removeByName("push_asked")
  app.save(users)
})
