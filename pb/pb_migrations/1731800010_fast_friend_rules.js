/// <reference path="../pb_data/types.d.ts" />

// Performance: the old friend check used @collection.friendships joins, which SQLite evaluates against every row
// (≈17s to list ~5k sets). Each user now carries a server-maintained, hidden `friends` list (kept in sync by
// pb_hooks on friendship changes), so visibility rules become a cheap lookup.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new RelationField({ name: "friends", collectionId: users.id, maxSelect: 9999, hidden: true }))
  users.createRule = "@request.body.is_moderator:isset = false && @request.body.friends:isset = false"
  users.updateRule = `id = ${ME} && @request.body.is_moderator:isset = false && @request.body.friends:isset = false`
  app.save(users)

  // Backfill from accepted friendships.
  const lists = {}
  for (const f of app.findRecordsByFilter("friendships", "status = 'accepted'", "", 0, 0)) {
    const a = f.getString("requester"), b = f.getString("addressee")
    ;(lists[a] = lists[a] || []).push(b)
    ;(lists[b] = lists[b] || []).push(a)
  }
  for (const id of Object.keys(lists)) {
    const u = app.findRecordById("users", id)
    u.set("friends", lists[id])
    app.saveNoValidate(u)
  }

  const friendOf = (owner) => `(${owner} = ${ME} || ${owner}.friends ?= ${ME})`
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.listRule = workouts.viewRule = `user = ${ME} || (visibility != 'private' && user.friends ?= ${ME})`
  app.save(workouts)
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && user.hide_stats != true && user.friends ?= ${ME})`
  sets.addIndex("idx_sets_user_done", false, "user, completed, performed_at", "")
  app.save(sets)
  for (const n of ["comments", "reactions"]) {
    const c = app.findCollectionByNameOrId(n)
    c.listRule = c.viewRule = `workout.user = ${ME} || (workout.visibility != 'private' && ${friendOf("workout.user")})`
    app.save(c)
  }
}, (app) => {
  const ME = "@request.auth.id"
  const friendOf = (owner) =>
    `(${owner} = ${ME} || ` +
    `(@collection.friendships:fa.requester ?= ${ME} && @collection.friendships:fa.addressee ?= ${owner} && @collection.friendships:fa.status ?= 'accepted') || ` +
    `(@collection.friendships:fb.addressee ?= ${ME} && @collection.friendships:fb.requester ?= ${owner} && @collection.friendships:fb.status ?= 'accepted'))`
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.listRule = workouts.viewRule = `user = ${ME} || (visibility != 'private' && ${friendOf("user")})`
  app.save(workouts)
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.removeIndex("idx_sets_user_done")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && user.hide_stats != true && ${friendOf("user")})`
  app.save(sets)
  for (const n of ["comments", "reactions"]) {
    const c = app.findCollectionByNameOrId(n)
    c.listRule = c.viewRule = `workout.user = ${ME} || (workout.visibility != 'private' && ${friendOf("workout.user")})`
    app.save(c)
  }
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("friends")
  users.createRule = "@request.body.is_moderator:isset = false"
  users.updateRule = `id = ${ME} && @request.body.is_moderator:isset = false`
  app.save(users)
})
