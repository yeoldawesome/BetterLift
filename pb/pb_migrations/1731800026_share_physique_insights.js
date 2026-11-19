/// <reference path="../pb_data/types.d.ts" />

// Friends' stats privacy, per section: Lifting = existing hide_stats (shared by default); Physique and Insights are
// private by default. Body readings become readable by friends only when the owner shares Physique.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "share_physique" }))
  users.fields.add(new BoolField({ name: "share_insights" }))
  app.save(users)
  const body = app.findCollectionByNameOrId("body_metrics")
  body.listRule = body.viewRule = `user = ${ME} || (user.share_physique = true && user.friends.id ?= ${ME})`
  app.save(body)
}, (app) => {
  const ME = "@request.auth.id"
  const body = app.findCollectionByNameOrId("body_metrics")
  body.listRule = body.viewRule = `user = ${ME}`
  app.save(body)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("share_physique")
  users.fields.removeByName("share_insights")
  app.save(users)
})
