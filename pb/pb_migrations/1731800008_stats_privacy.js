/// <reference path="../pb_data/types.d.ts" />

// "Friends can see my lifts & stats" (default on). When a user turns it off (hide_stats = true), friends can still
// see their posts (name, time, volume) but not the individual sets, so no stats, history or lift details leak.
migrate((app) => {
  const ME = "@request.auth.id"
  const friendOf = (owner) =>
    `(${owner} = ${ME} || ` +
    `(@collection.friendships:fa.requester ?= ${ME} && @collection.friendships:fa.addressee ?= ${owner} && @collection.friendships:fa.status ?= 'accepted') || ` +
    `(@collection.friendships:fb.addressee ?= ${ME} && @collection.friendships:fb.requester ?= ${owner} && @collection.friendships:fb.status ?= 'accepted'))`
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "hide_stats" }))
  app.save(users)
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && user.hide_stats != true && ${friendOf("user")})`
  app.save(sets)
}, (app) => {
  const ME = "@request.auth.id"
  const friendOf = (owner) =>
    `(${owner} = ${ME} || ` +
    `(@collection.friendships:fa.requester ?= ${ME} && @collection.friendships:fa.addressee ?= ${owner} && @collection.friendships:fa.status ?= 'accepted') || ` +
    `(@collection.friendships:fb.addressee ?= ${ME} && @collection.friendships:fb.requester ?= ${owner} && @collection.friendships:fb.status ?= 'accepted'))`
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && ${friendOf("user")})`
  app.save(sets)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("hide_stats")
  app.save(users)
})
