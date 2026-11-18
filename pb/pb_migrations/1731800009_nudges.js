/// <reference path="../pb_data/types.d.ts" />

// Friend reminders ("nudges") to get back in the gym. Friend-only and one per sender→recipient per day (pb_hooks).
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  app.save(new Collection({
    type: "base", name: "nudges",
    listRule: `to = ${ME} || from = ${ME}`,
    viewRule: `to = ${ME} || from = ${ME}`,
    createRule: `@request.auth.id != '' && @request.body.from = ${ME} && @request.body.to != ${ME} && @request.body.seen:isset = false`,
    updateRule: `to = ${ME} && @request.body.from:isset = false && @request.body.to:isset = false && @request.body.message:isset = false`,
    deleteRule: `to = ${ME} || from = ${ME}`,
    fields: [
      { name: "from", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "to", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "message", type: "text", max: 140 },
      { name: "seen", type: "bool" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_nudges_to ON nudges (`to`, seen, created)", "CREATE INDEX idx_nudges_pair ON nudges (`from`, `to`, created)"],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("nudges"))
})
