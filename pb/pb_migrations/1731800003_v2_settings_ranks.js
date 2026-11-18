/// <reference path="../pb_data/types.d.ts" />

// v2: user settings, post visibility, single-number reps, no RPE, per-exercise strength ranks.
// Irreversible: drops RPE values and rebuilds ranks (they recompute automatically).
migrate((app) => {
  const ME = "@request.auth.id"
  const friendOf = (owner) =>
    `(${owner} = ${ME} || ` +
    `(@collection.friendships:fa.requester ?= ${ME} && @collection.friendships:fa.addressee ?= ${owner} && @collection.friendships:fa.status ?= 'accepted') || ` +
    `(@collection.friendships:fb.addressee ?= ${ME} && @collection.friendships:fb.requester ?= ${owner} && @collection.friendships:fb.status ?= 'accepted'))`

  // ---- user settings (remembered between workouts)
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new NumberField({ name: "default_rest_s", onlyInt: true, min: 0, max: 900 }))
  users.fields.add(new SelectField({ name: "post_visibility", values: ["public", "private"], maxSelect: 1 }))
  users.fields.add(new BoolField({ name: "update_routine" }))
  users.fields.add(new BoolField({ name: "save_as_routine" }))
  app.save(users)

  // ---- post visibility: private workouts are owner-only (sets, comments, reactions follow)
  const workouts = app.findCollectionByNameOrId("workouts")
  workouts.fields.add(new SelectField({ name: "visibility", values: ["public", "private"], maxSelect: 1 }))
  workouts.listRule = workouts.viewRule = `user = ${ME} || (visibility != 'private' && ${friendOf("user")})`
  app.save(workouts)

  const sets = app.findCollectionByNameOrId("workout_sets")
  sets.fields.removeByName("rpe")
  sets.listRule = sets.viewRule = `user = ${ME} || (workout.visibility != 'private' && ${friendOf("user")})`
  app.save(sets)

  for (const n of ["comments", "reactions"]) {
    const c = app.findCollectionByNameOrId(n)
    c.listRule = c.viewRule = `workout.user = ${ME} || (workout.visibility != 'private' && ${friendOf("workout.user")})`
    app.save(c)
  }

  // ---- routines: one target rep number instead of a range
  const rex = app.findCollectionByNameOrId("routine_exercises")
  rex.fields.add(new NumberField({ name: "reps", onlyInt: true, min: 0, max: 100 }))
  app.save(rex)
  app.db().newQuery("UPDATE routine_exercises SET reps = MAX(COALESCE(reps_min, 0), COALESCE(reps_max, 0))").execute()
  rex.fields.removeByName("reps_min")
  rex.fields.removeByName("reps_max")
  app.save(rex)

  // ---- strength standards: e1RM/bodyweight at the middle tier (Cobalt). Dumbbell lifts are per dumbbell.
  const ex = app.findCollectionByNameOrId("exercises")
  ex.fields.add(new NumberField({ name: "rank_std_m", min: 0, max: 10 }))
  ex.fields.add(new NumberField({ name: "rank_std_f", min: 0, max: 10 }))
  const noStd = " && @request.body.rank_std_m:isset = false && @request.body.rank_std_f:isset = false"
  ex.createRule += noStd
  ex.updateRule += noStd
  app.save(ex)

  const FEMALE = { chest: 0.6, shoulders: 0.6, triceps: 0.6, biceps: 0.6, back: 0.65, forearms: 0.65, quads: 0.75, hamstrings: 0.75, glutes: 0.8, calves: 0.75, core: 0.7, full_body: 0.65 }
  const STD = {
    "Barbell Bench Press": [1.25, 0.75], "Incline Barbell Bench Press": 1.05, "Decline Barbell Bench Press": 1.3, "Dumbbell Bench Press": 0.5,
    "Incline Dumbbell Bench Press": 0.42, "Dumbbell Fly": 0.25, "Cable Fly": 0.3, "Machine Chest Press": 1.1, "Pec Deck": 0.9,
    "Barbell Deadlift": [2.0, 1.5], "Barbell Row": [1.1, 0.8], "Pendlay Row": [1.0, 0.75], "Dumbbell Row": 0.55, "Seated Cable Row": 1.0,
    "Lat Pulldown": 1.0, "T-Bar Row": 1.0, "Machine Row": 1.0, "Rack Pull": 2.2, "Straight-Arm Pulldown": 0.5, "Barbell Shrug": 1.8,
    "Dumbbell Shrug": 0.75, "Barbell Overhead Press": [0.8, 0.5], "Seated Dumbbell Shoulder Press": 0.35, "Machine Shoulder Press": 0.8,
    "Arnold Press": 0.3, "Dumbbell Lateral Raise": 0.17, "Cable Lateral Raise": 0.12, "Dumbbell Front Raise": 0.18, "Reverse Pec Deck": 0.6,
    "Face Pull": 0.5, "Upright Row": 0.6, "Barbell Curl": 0.6, "EZ-Bar Curl": 0.6, "Dumbbell Curl": 0.27, "Hammer Curl": 0.3,
    "Preacher Curl": 0.5, "Cable Curl": 0.5, "Incline Dumbbell Curl": 0.22, "Concentration Curl": 0.22, "Close-Grip Bench Press": 1.1,
    "Skull Crusher": 0.6, "Tricep Pushdown": 0.65, "Overhead Tricep Extension": 0.55, "Dumbbell Kickback": 0.15, "Wrist Curl": 0.3,
    "Farmer's Carry": 0.75, "Barbell Squat": [1.55, 1.2], "Front Squat": 1.25, "Leg Press": 3.0, "Hack Squat": 1.9, "Smith Machine Squat": 1.5,
    "Bulgarian Split Squat": 0.4, "Goblet Squat": 0.6, "Leg Extension": 1.0, "Walking Lunge": 0.35, "Step-Up": 0.3, "Romanian Deadlift": 1.5,
    "Lying Leg Curl": 0.7, "Seated Leg Curl": 0.8, "Good Morning": 1.0, "Hip Thrust": 2.0, "Cable Kickback": 0.3, "Sumo Deadlift": 2.0,
    "Hip Abduction": 1.1, "Standing Calf Raise": 1.6, "Seated Calf Raise": 1.2, "Cable Crunch": 0.8, "Kettlebell Swing": 0.4,
    "Power Clean": 1.1, "Thruster": 0.85,
  }
  for (const name of Object.keys(STD)) {
    let r
    try { r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { continue }
    const v = STD[name]
    const m = Array.isArray(v) ? v[0] : v
    const f = Array.isArray(v) ? v[1] : Math.round(m * (FEMALE[r.getString("muscle")] || 0.65) * 100) / 100
    r.set("rank_std_m", m)
    r.set("rank_std_f", f)
    app.save(r)
  }

  // ---- ranks: one row per user per exercise; exercise = '' is the overall rank
  app.db().newQuery("DELETE FROM user_ranks").execute()
  const ranks = app.findCollectionByNameOrId("user_ranks")
  ranks.removeIndex("idx_ranks_user_lift")
  ranks.removeIndex("idx_ranks_board")
  ranks.fields.removeByName("lift")
  ranks.fields.add(new RelationField({ name: "exercise", collectionId: ex.id, maxSelect: 1, cascadeDelete: true }))
  ranks.fields.add(new NumberField({ name: "score", min: 0 }))
  ranks.addIndex("idx_ranks_user_ex", true, "user, exercise", "")
  ranks.addIndex("idx_ranks_board", false, "exercise, ratio", "")
  app.save(ranks)
}, (_app) => {
  throw new Error("1731800003_v2_settings_ranks is not reversible")
})
