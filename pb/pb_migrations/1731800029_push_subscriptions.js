/// <reference path="../pb_data/types.d.ts" />

// Web Push subscriptions (one per device that turned on push notifications). The server pushes every new
// notification to the user's devices (pb_hooks → pb/push sidecar). Users manage only their own rows.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base", name: "push_subscriptions",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `${ME} != "" && @request.body.user = ${ME}`,
    updateRule: null,
    deleteRule: `user = ${ME}`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "endpoint", type: "url", required: true },
      { name: "p256dh", type: "text", required: true, max: 200 },
      { name: "auth", type: "text", required: true, max: 100 },
      { name: "ua", type: "text", max: 200 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions (endpoint)",
      "CREATE INDEX idx_push_user ON push_subscriptions (user)",
    ],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("push_subscriptions"))
})
