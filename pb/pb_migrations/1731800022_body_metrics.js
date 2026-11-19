/// <reference path="../pb_data/types.d.ts" />

// Body composition readings (smart scale CSV imports, e.g. RENPHO). Private to the owner.
migrate((app) => {
  const ME = "@request.auth.id"
  const users = app.findCollectionByNameOrId("users")
  const n = (name) => ({ name, type: "number", min: 0 })
  app.save(new Collection({
    type: "base", name: "body_metrics",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `user = ${ME}`, updateRule: `user = ${ME} && @request.body.user:isset = false`, deleteRule: `user = ${ME}`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "measured_at", type: "date", required: true },
      n("weight_kg"), n("bmi"), n("body_fat_pct"), n("fat_mass_kg"), n("muscle_pct"), n("muscle_kg"),
      n("skeletal_pct"), n("skeletal_kg"), n("bone_kg"), n("protein_pct"), n("water_pct"), n("fat_free_kg"),
      n("subcut_fat_pct"), n("visceral_fat"), n("bmr"), n("metabolic_age"),
      { name: "source", type: "text", max: 40 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_body_user_time ON body_metrics (user, measured_at)"],
  }))
}, (app) => {
  app.delete(app.findCollectionByNameOrId("body_metrics"))
})
