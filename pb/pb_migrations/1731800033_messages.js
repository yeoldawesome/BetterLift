/// <reference path="../pb_data/types.d.ts" />

// Private messages between friends.
//  - only the two people in a conversation can read it
//  - you can only start/send to someone who is currently your friend (their hidden `friends` list contains you)
//  - only the recipient can change a message, and only to mark it read; nobody can edit or delete message text
//  - sending is rate limited; pb_hooks trims the text and pushes it to the recipient's devices
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base", name: "messages",
    listRule: `from = ${ME} || to = ${ME}`,
    viewRule: `from = ${ME} || to = ${ME}`,
    createRule: `${ME} != '' && from = ${ME} && to != ${ME} && to.friends.id ?= ${ME} && @request.body.read:isset = false`,
    updateRule: `to = ${ME} && @request.body.from:isset = false && @request.body.to:isset = false && @request.body.body:isset = false`,
    deleteRule: null,
    fields: [
      { name: "from", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "to", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "body", type: "text", required: true, max: 2000 },
      { name: "read", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_msg_pair ON messages (`from`, `to`, created)",
      "CREATE INDEX idx_msg_unread ON messages (`to`, read)",
    ],
  }))

  const s = app.settings()
  s.rateLimits.enabled = true
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "POST /api/collections/messages/records")
  s.rateLimits.rules.push({ label: "POST /api/collections/messages/records", audience: "", duration: 60, maxRequests: 40 })
  app.save(s)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("messages"))
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.filter((r) => r.label !== "POST /api/collections/messages/records")
  app.save(s)
})
