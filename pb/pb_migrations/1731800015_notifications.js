/// <reference path="../pb_data/types.d.ts" />

// In-app notifications. Only the server creates them (pb_hooks); users can read, mark read and delete their own.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base", name: "notifications",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: null,
    updateRule: `user = ${ME} && @request.body.user:isset = false && @request.body.type:isset = false && @request.body.actor:isset = false && @request.body.text:isset = false && @request.body.target:isset = false`,
    deleteRule: `user = ${ME}`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "actor", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "type", type: "select", maxSelect: 1, required: true, values: [
        "comment", "reply", "reaction", "friend_request", "friend_accept", "nudge", "exercise_approved", "exercise_rejected", "feedback_reply",
      ] },
      { name: "text", type: "text", max: 300 },
      { name: "target", type: "text", max: 40 },   // id of the workout / exercise / feedback it points at
      { name: "read", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_notif_user ON notifications (user, read, created)"],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("notifications"))
})
