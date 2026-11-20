/// <reference path="../pb_data/types.d.ts" />

// Saved meals/foods (templates for one-tap logging), the per-day ingredient list on a logged meal,
// and the weekly training plan (routine rotation with rest days).
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")

  app.save(new Collection({
    type: "base", name: "saved_meals",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `@request.auth.id != '' && @request.body.user = ${ME}`,
    updateRule: `user = ${ME} && @request.body.user:isset = false`,
    deleteRule: `user = ${ME}`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "name", type: "text", required: true, max: 120 },
      // meal = several items; food = a single item saved for quick adding.
      { name: "kind", type: "select", values: ["meal", "food"], maxSelect: 1, required: true },
      // [{ name, detail, servings, base, kcal, p, c, f }]
      { name: "items", type: "json", maxSize: 20000 },
      { name: "uses", type: "number", min: 0 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_saved_meals_user ON saved_meals (user)"],
  }))

  // A logged copy of a saved meal keeps its own items, so it can be edited for that day without touching the template.
  const logs = app.findCollectionByNameOrId("food_logs")
  logs.fields.add(new JSONField({ name: "items", maxSize: 20000 }))
  logs.fields.add(new TextField({ name: "saved_meal", max: 15 }))
  const src = logs.fields.getByName("source")
  src.values = [...src.values, "saved"]
  app.save(logs)

  // { cycle: (routineId | "rest")[] } — repeats forever.
  users.fields.add(new JSONField({ name: "plan", maxSize: 2000 }))
  app.save(users)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("saved_meals"))
  const logs = app.findCollectionByNameOrId("food_logs")
  logs.fields.removeByName("items")
  logs.fields.removeByName("saved_meal")
  const src = logs.fields.getByName("source")
  src.values = src.values.filter((v) => v !== "saved")
  app.save(logs)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("plan")
  app.save(users)
})
