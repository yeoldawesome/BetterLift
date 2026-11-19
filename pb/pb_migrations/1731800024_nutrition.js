/// <reference path="../pb_data/types.d.ts" />

// Nutrition: food logs, per-user calorie/macro goals, and cardio effort on workout sets.
// All nutrition data is private to its owner (users are visible to every signed-in user, so goals don't live there).
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  const own = {
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `@request.auth.id != '' && @request.body.user = ${ME}`,
    updateRule: `user = ${ME} && @request.body.user:isset = false`,
    deleteRule: `user = ${ME}`,
  }
  const n = (name, max) => ({ name, type: "number", min: 0, max })
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]

  app.save(new Collection({
    type: "base", name: "food_logs", ...own,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      // Local calendar day the food was eaten (YYYY-MM-DD), independent of time zone.
      { name: "day", type: "text", required: true, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      { name: "meal", type: "select", values: ["breakfast", "lunch", "dinner", "snack"], maxSelect: 1, required: true },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "detail", type: "text", max: 160 },
      n("servings", 100),
      // One serving: { label, g?, kcal, p, c, f } — lets the servings count be changed later.
      { name: "base", type: "json", maxSize: 2000 },
      n("kcal", 20000), n("protein_g", 2000), n("carbs_g", 2000), n("fat_g", 2000),
      { name: "source", type: "select", values: ["quick", "text", "estimate", "search", "barcode", "recent"], maxSelect: 1 },
      { name: "barcode", type: "text", max: 32 },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_food_user_day ON food_logs (user, day)"],
  }))

  app.save(new Collection({
    type: "base", name: "nutrition_profiles", ...own,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "settings", type: "json", maxSize: 4000 },
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_nutrition_user ON nutrition_profiles (user)"],
  }))

  // Cardio effort: average heart rate, perceived effort (RPE 1–10) and active calories from a watch (optional override).
  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.fields.add(new NumberField({ name: "avg_hr", min: 0, max: 250 }))
  sets.fields.add(new NumberField({ name: "rpe", min: 0, max: 10 }))
  sets.fields.add(new NumberField({ name: "kcal", min: 0, max: 10000 }))
  app.save(sets)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("food_logs"))
  app.delete(app.findCollectionByNameOrId("nutrition_profiles"))
  const sets = app.findCollectionByNameOrId("workout_sets")
  for (const f of ["avg_hr", "rpe", "kcal"]) sets.fields.removeByName(f)
  app.save(sets)
})
