/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const AUTH = "@request.auth.id != ''"
  const ME = "@request.auth.id"
  // Owner, or an accepted friendship in either direction (aliases keep each direction's joins correlated).
  const friendOf = (owner) =>
    `(${owner} = ${ME} || ` +
    `(@collection.friendships:fa.requester ?= ${ME} && @collection.friendships:fa.addressee ?= ${owner} && @collection.friendships:fa.status ?= 'accepted') || ` +
    `(@collection.friendships:fb.addressee ?= ${ME} && @collection.friendships:fb.requester ?= ${owner} && @collection.friendships:fb.status ?= 'accepted'))`
  // Cross-record ownership (set -> workout, comment -> friend) is enforced in pb_hooks/main.pb.js.
  const ownCreate = `${AUTH} && @request.body.user = ${ME}`
  const ownWrite = `user = ${ME} && @request.body.user:isset = false`
  const stamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]
  const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio"]
  const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"]
  const KINDS = ["weight", "bodyweight", "assisted", "duration", "cardio"]
  const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp", "row"]
  const EMOJI = ["fire", "muscle", "clap", "rocket", "trophy"]

  const settings = app.settings()
  settings.batch.enabled = true
  settings.batch.maxRequests = 1000
  settings.batch.timeout = 30
  app.save(settings)

  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new TextField({ name: "username", required: true, min: 3, max: 24, pattern: "^[a-z0-9_]+$" }))
  users.fields.add(new NumberField({ name: "bodyweight_kg", min: 0, max: 400 }))
  users.fields.add(new SelectField({ name: "sex", values: ["male", "female"], maxSelect: 1 }))
  users.fields.add(new SelectField({ name: "unit", values: ["kg", "lb"], maxSelect: 1 }))
  users.addIndex("idx_users_username", true, "username", "")
  users.listRule = AUTH
  users.viewRule = AUTH
  app.save(users)

  const save = (c) => { app.save(c); return c }
  const rel = (name, coll, extra) => Object.assign({ name, type: "relation", collectionId: coll.id, maxSelect: 1 }, extra || {})

  save(new Collection({
    type: "base", name: "friendships",
    listRule: `requester = ${ME} || addressee = ${ME}`,
    viewRule: `requester = ${ME} || addressee = ${ME}`,
    createRule: `${AUTH} && @request.body.requester = ${ME} && @request.body.addressee != ${ME} && @request.body.status = 'pending'`,
    updateRule: `addressee = ${ME} && status = 'pending' && @request.body.status = 'accepted' && @request.body.requester:isset = false && @request.body.addressee:isset = false`,
    deleteRule: `requester = ${ME} || addressee = ${ME}`,
    fields: [
      rel("requester", users, { required: true, cascadeDelete: true }),
      rel("addressee", users, { required: true, cascadeDelete: true }),
      { name: "status", type: "select", values: ["pending", "accepted"], maxSelect: 1, required: true },
      ...stamps,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_friend_pair ON friendships (requester, addressee)",
      "CREATE INDEX idx_friend_addressee ON friendships (addressee, status)",
    ],
  }))

  const exercises = save(new Collection({
    type: "base", name: "exercises",
    listRule: `${AUTH} && (owner = '' || owner = ${ME})`,
    viewRule: `${AUTH} && (owner = '' || owner = ${ME})`,
    createRule: `${AUTH} && @request.body.owner = ${ME} && @request.body.is_main_lift != true && @request.body.main_lift:isset = false`,
    updateRule: `owner = ${ME} && @request.body.owner:isset = false && @request.body.is_main_lift:isset = false && @request.body.main_lift:isset = false`,
    deleteRule: `owner = ${ME}`,
    fields: [
      { name: "name", type: "text", required: true, max: 80 },
      { name: "muscle", type: "select", values: MUSCLES, maxSelect: 1, required: true },
      { name: "equipment", type: "select", values: EQUIPMENT, maxSelect: 1, required: true },
      { name: "kind", type: "select", values: KINDS, maxSelect: 1, required: true },
      { name: "is_main_lift", type: "bool" },
      { name: "main_lift", type: "select", values: MAIN_LIFTS, maxSelect: 1 },
      rel("owner", users, { cascadeDelete: true }),
      ...stamps,
    ],
    indexes: [
      "CREATE INDEX idx_ex_owner ON exercises (owner)",
      "CREATE UNIQUE INDEX idx_ex_owner_name ON exercises (owner, name COLLATE NOCASE)",
    ],
  }))

  const routines = save(new Collection({
    type: "base", name: "routines",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: ownCreate, updateRule: ownWrite, deleteRule: `user = ${ME}`,
    fields: [
      rel("user", users, { required: true, cascadeDelete: true }),
      { name: "name", type: "text", required: true, max: 80 },
      { name: "notes", type: "text", max: 1000 },
      { name: "position", type: "number", onlyInt: true },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_routines_user ON routines (user, position)"],
  }))

  save(new Collection({
    type: "base", name: "routine_exercises",
    listRule: `user = ${ME}`, viewRule: `user = ${ME}`,
    createRule: ownCreate,
    updateRule: `${ownWrite} && @request.body.routine:isset = false`,
    deleteRule: `user = ${ME}`,
    fields: [
      rel("routine", routines, { required: true, cascadeDelete: true }),
      rel("user", users, { required: true, cascadeDelete: true }),
      rel("exercise", exercises, { required: true, cascadeDelete: true }),
      { name: "position", type: "number", onlyInt: true },
      { name: "target_sets", type: "number", onlyInt: true, min: 1, max: 20 },
      { name: "reps_min", type: "number", onlyInt: true, min: 0, max: 100 },
      { name: "reps_max", type: "number", onlyInt: true, min: 0, max: 100 },
      { name: "rest_s", type: "number", onlyInt: true, min: 0, max: 900 },
      ...stamps,
    ],
    indexes: ["CREATE INDEX idx_rex_routine ON routine_exercises (routine, position)"],
  }))

  const workouts = save(new Collection({
    type: "base", name: "workouts",
    listRule: friendOf("user"), viewRule: friendOf("user"),
    createRule: ownCreate, updateRule: ownWrite, deleteRule: `user = ${ME}`,
    fields: [
      rel("user", users, { required: true, cascadeDelete: true }),
      rel("routine", routines),
      { name: "name", type: "text", required: true, max: 80 },
      { name: "notes", type: "text", max: 2000 },
      { name: "started_at", type: "date", required: true },
      { name: "ended_at", type: "date" },
      { name: "duration_s", type: "number", onlyInt: true, min: 0 },
      { name: "volume_kg", type: "number", min: 0 },
      { name: "pr_count", type: "number", onlyInt: true, min: 0 },
      { name: "source_id", type: "text", max: 120 },
      ...stamps,
    ],
    indexes: [
      "CREATE INDEX idx_workouts_user ON workouts (user, started_at)",
      "CREATE INDEX idx_workouts_started ON workouts (started_at)",
      "CREATE UNIQUE INDEX idx_workouts_source ON workouts (user, source_id) WHERE source_id != ''",
    ],
  }))

  save(new Collection({
    type: "base", name: "workout_sets",
    listRule: friendOf("user"), viewRule: friendOf("user"),
    createRule: ownCreate,
    updateRule: `${ownWrite} && @request.body.workout:isset = false`,
    deleteRule: `user = ${ME}`,
    fields: [
      rel("workout", workouts, { required: true, cascadeDelete: true }),
      rel("user", users, { required: true, cascadeDelete: true }),
      rel("exercise", exercises, { required: true }),
      { name: "performed_at", type: "date", required: true },
      { name: "position", type: "number", onlyInt: true },
      { name: "set_index", type: "number", onlyInt: true, min: 0 },
      { name: "weight_kg", type: "number", min: -500, max: 1500 },
      { name: "reps", type: "number", onlyInt: true, min: 0, max: 1000 },
      { name: "rpe", type: "number", min: 0, max: 10 },
      { name: "seconds", type: "number", onlyInt: true, min: 0 },
      { name: "distance_km", type: "number", min: 0 },
      { name: "completed", type: "bool" },
      { name: "e1rm_kg", type: "number", min: 0 },
      { name: "is_pr", type: "bool" },
      ...stamps,
    ],
    indexes: [
      "CREATE INDEX idx_sets_workout ON workout_sets (workout, position, set_index)",
      "CREATE INDEX idx_sets_user_ex ON workout_sets (user, exercise, performed_at)",
      "CREATE INDEX idx_sets_user_e1rm ON workout_sets (user, exercise, e1rm_kg)",
    ],
  }))

  const social = (name, fields, indexes, updateRule) => save(new Collection({
    type: "base", name,
    listRule: friendOf("workout.user"),
    viewRule: friendOf("workout.user"),
    createRule: ownCreate,
    updateRule,
    deleteRule: `user = ${ME} || workout.user = ${ME}`,
    fields: [
      rel("workout", workouts, { required: true, cascadeDelete: true }),
      rel("user", users, { required: true, cascadeDelete: true }),
      ...fields,
      ...stamps,
    ],
    indexes,
  }))

  social("comments",
    [{ name: "body", type: "text", required: true, max: 500 }],
    ["CREATE INDEX idx_comments_workout ON comments (workout, created)"],
    `user = ${ME} && @request.body.workout:isset = false && @request.body.user:isset = false`)

  social("reactions",
    [{ name: "emoji", type: "select", values: EMOJI, maxSelect: 1, required: true }],
    ["CREATE UNIQUE INDEX idx_reactions_unique ON reactions (workout, user, emoji)"],
    null)

  save(new Collection({
    type: "base", name: "user_ranks",
    listRule: AUTH, viewRule: AUTH,
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      rel("user", users, { required: true, cascadeDelete: true }),
      { name: "lift", type: "select", values: MAIN_LIFTS.concat(["overall"]), maxSelect: 1, required: true },
      { name: "best_e1rm_kg", type: "number", min: 0 },
      { name: "ratio", type: "number", min: 0 },
      { name: "tier", type: "number", onlyInt: true, min: 0, max: 7 },
      ...stamps,
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_ranks_user_lift ON user_ranks (user, lift)",
      "CREATE INDEX idx_ranks_board ON user_ranks (lift, ratio)",
    ],
  }))
}, (app) => {
  for (const n of ["user_ranks", "reactions", "comments", "workout_sets", "workouts", "routine_exercises", "routines", "exercises", "friendships"]) {
    app.delete(app.findCollectionByNameOrId(n))
  }
  const users = app.findCollectionByNameOrId("users")
  for (const f of ["username", "bodyweight_kg", "sex", "unit"]) users.fields.removeByName(f)
  users.removeIndex("idx_users_username")
  users.listRule = "id = @request.auth.id"
  users.viewRule = "id = @request.auth.id"
  app.save(users)
})
