/// <reference path="../pb_data/types.d.ts" />

// Custom reactions: users upload a small image + name. They show in the reaction picker for the owner and their
// friends, and anyone who can see a workout can see the custom reactions on it.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")

  const custom = new Collection({
    type: "base", name: "custom_reactions",
    // Visible to any signed-in user so reactions render on every post they appear on.
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: `@request.auth.id != '' && @request.body.owner = ${ME}`,
    updateRule: `owner = ${ME} && @request.body.owner:isset = false`,
    deleteRule: `owner = ${ME}`,
    fields: [
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "name", type: "text", min: 1, max: 24, required: true, pattern: "^[^\\n]+$" },
      { name: "image", type: "file", maxSelect: 1, maxSize: 1024 * 1024, required: true, mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"], thumbs: ["96x96f"] },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_custom_reactions_owner ON custom_reactions (owner)",
      "CREATE UNIQUE INDEX idx_custom_reactions_name ON custom_reactions (owner, name COLLATE NOCASE)",
    ],
  })
  app.save(custom)

  const reactions = app.findCollectionByNameOrId("reactions")
  const emoji = reactions.fields.getByName("emoji")
  if (!emoji.values.includes("custom")) emoji.values = [...emoji.values, "custom"]
  // Deleting a custom reaction removes it from every post it was used on.
  reactions.fields.add(new RelationField({ name: "custom", collectionId: custom.id, maxSelect: 1, cascadeDelete: true }))
  // A built-in emoji never carries a custom image; "custom" always does.
  reactions.createRule = `@request.auth.id != '' && @request.body.user = ${ME} && ((@request.body.emoji = 'custom' && @request.body.custom != '') || (@request.body.emoji != 'custom' && @request.body.custom:isset = false))`
  reactions.removeIndex("idx_reactions_unique")
  reactions.addIndex("idx_reactions_unique", true, "workout, user, emoji, custom", "")
  app.save(reactions)
}, (app) => {
  app.db().newQuery("DELETE FROM reactions WHERE emoji = 'custom'").execute()
  const reactions = app.findCollectionByNameOrId("reactions")
  reactions.fields.removeByName("custom")
  const emoji = reactions.fields.getByName("emoji")
  emoji.values = emoji.values.filter((v) => v !== "custom")
  reactions.createRule = "@request.auth.id != '' && @request.body.user = @request.auth.id"
  reactions.removeIndex("idx_reactions_unique")
  reactions.addIndex("idx_reactions_unique", true, "workout, user, emoji", "")
  app.save(reactions)
  app.delete(app.findCollectionByNameOrId("custom_reactions"))
})
