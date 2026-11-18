/// <reference path="../pb_data/types.d.ts" />

// Ranking feature removed for now. Drops the derived user_ranks table (it can be rebuilt from
// workout_sets if ranks come back). Exercise strength standards (rank_std_m/f) are kept, unused.
migrate((app) => {
  try { app.delete(app.findCollectionByNameOrId("user_ranks")) } catch (_) {}
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  const exercises = app.findCollectionByNameOrId("exercises")
  app.save(new Collection({
    type: "base", name: "user_ranks",
    listRule: "@request.auth.id != ''", viewRule: "@request.auth.id != ''",
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "exercise", type: "relation", collectionId: exercises.id, maxSelect: 1, cascadeDelete: true },
      { name: "best_e1rm_kg", type: "number", min: 0 },
      { name: "ratio", type: "number", min: 0 },
      { name: "score", type: "number", min: 0 },
      { name: "tier", type: "number", onlyInt: true, min: 0, max: 7 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_ranks_user_ex ON user_ranks (user, exercise)",
      "CREATE INDEX idx_ranks_board ON user_ranks (exercise, ratio)",
    ],
  }))
})
