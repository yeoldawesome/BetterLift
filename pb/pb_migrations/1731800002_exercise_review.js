/// <reference path="../pb_data/types.d.ts" />

// Custom exercises can be submitted for review; moderators approve them into the official library.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "is_moderator" }))
  // Only superusers (dashboard) can grant moderator.
  users.createRule = "@request.body.is_moderator:isset = false"
  users.updateRule = `id = ${ME} && @request.body.is_moderator:isset = false`
  app.save(users)

  const ex = app.findCollectionByNameOrId("exercises")
  ex.fields.add(new SelectField({ name: "review_status", values: ["pending", "approved", "rejected"], maxSelect: 1 }))
  ex.fields.add(new TextField({ name: "review_note", max: 300 }))
  ex.fields.add(new RelationField({ name: "submitted_by", collectionId: users.id, maxSelect: 1 }))
  const visible = `@request.auth.id != '' && (owner = '' || owner = ${ME} || (review_status = 'pending' && @request.auth.is_moderator = true))`
  ex.listRule = visible
  ex.viewRule = visible
  // Owners may only submit ('pending') or withdraw (''); approval happens in the review route (pb_hooks).
  const ownerStatus = "(@request.body.review_status:isset = false || @request.body.review_status = 'pending' || @request.body.review_status = '')"
  const locked = "@request.body.review_note:isset = false && @request.body.submitted_by:isset = false"
  ex.createRule = `@request.auth.id != '' && @request.body.owner = ${ME} && @request.body.is_main_lift != true && @request.body.main_lift:isset = false && ${ownerStatus} && ${locked}`
  ex.updateRule = `owner = ${ME} && @request.body.owner:isset = false && @request.body.is_main_lift:isset = false && @request.body.main_lift:isset = false && ${ownerStatus} && ${locked}`
  ex.addIndex("idx_ex_review", false, "review_status", "")
  app.save(ex)
}, (app) => {
  const ex = app.findCollectionByNameOrId("exercises")
  for (const f of ["review_status", "review_note", "submitted_by"]) ex.fields.removeByName(f)
  ex.removeIndex("idx_ex_review")
  const ME = "@request.auth.id"
  ex.listRule = `@request.auth.id != '' && (owner = '' || owner = ${ME})`
  ex.viewRule = ex.listRule
  ex.createRule = `@request.auth.id != '' && @request.body.owner = ${ME} && @request.body.is_main_lift != true && @request.body.main_lift:isset = false`
  ex.updateRule = `owner = ${ME} && @request.body.owner:isset = false && @request.body.is_main_lift:isset = false && @request.body.main_lift:isset = false`
  app.save(ex)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("is_moderator")
  users.createRule = ""
  users.updateRule = `id = ${ME}`
  app.save(users)
})
