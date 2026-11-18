/// <reference path="../pb_data/types.d.ts" />

// Personal exercise edits (only change how an exercise looks for that user) and user feedback/requests.
migrate((app) => {
  const ME = "@request.auth.id"
  const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio"]
  const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"]
  const users = app.findCollectionByNameOrId("users")
  const exercises = app.findCollectionByNameOrId("exercises")
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]

  app.save(new Collection({
    type: "base", name: "exercise_overrides",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `@request.auth.id != '' && @request.body.user = ${ME}`,
    updateRule: `user = ${ME} && @request.body.user:isset = false && @request.body.exercise:isset = false`,
    deleteRule: `user = ${ME}`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "exercise", type: "relation", collectionId: exercises.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "name", type: "text", max: 80 },
      { name: "muscle", type: "select", values: MUSCLES, maxSelect: 1 },
      { name: "secondary", type: "select", values: MUSCLES, maxSelect: MUSCLES.length },
      { name: "equipment", type: "select", values: EQUIPMENT, maxSelect: 1 },
      { name: "instructions", type: "text", max: 2000 },
      { name: "log_tip", type: "text", max: 500 },
      ...stamps,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_override_user_ex ON exercise_overrides (user, exercise)"],
  }))

  app.save(new Collection({
    type: "base", name: "feedback",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: `@request.auth.id != '' && @request.body.user = ${ME} && @request.body.status:isset = false && @request.body.admin_note:isset = false`,
    updateRule: null, deleteRule: `user = ${ME} && status = 'open'`,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "type", type: "select", values: ["general", "exercise_request", "edit_request"], maxSelect: 1, required: true },
      { name: "exercise", type: "relation", collectionId: exercises.id, maxSelect: 1, cascadeDelete: false },
      { name: "message", type: "text", required: true, max: 2000 },
      { name: "proposal", type: "json", maxSize: 5000 },
      { name: "status", type: "select", values: ["open", "done", "declined"], maxSelect: 1 },
      { name: "admin_note", type: "text", max: 500 },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_feedback_status ON feedback (status, created)", "CREATE INDEX idx_feedback_user ON feedback (user, created)"],
  }))
}, (app) => {
  for (const n of ["feedback", "exercise_overrides"]) app.delete(app.findCollectionByNameOrId(n))
})
