/// <reference path="../pb_data/types.d.ts" />

// Exercises can have up to two primary muscles ("muscle" + optional "muscle2"): incline bench works chest and front
// delts, flat bench is chest with front delts as a secondary. Every official exercise is re-checked against the new
// back/shoulder muscles. Personal edits that only repeated the old official muscles are cleared so those users pick up
// the corrected ones.

// "primary(+second primary) / secondary, secondary"
const LIB = {
  // ---- chest. Incline (and feet-up) pressing makes the front delts a primary mover; flat/decline and flys use them as helpers.
  "Barbell Bench Press": "chest / triceps, front_delts",
  "Incline Barbell Bench Press": "chest+front_delts / triceps",
  "Decline Barbell Bench Press": "chest / triceps",
  "Dumbbell Bench Press": "chest / front_delts, triceps",
  "Incline Dumbbell Bench Press": "chest+front_delts / triceps",
  "Decline Dumbbell Bench Press": "chest / triceps",
  "Dumbbell Floor Press": "chest / triceps, front_delts",
  "Smith Machine Bench Press": "chest / triceps, front_delts",
  "Smith Machine Incline Bench Press": "chest+front_delts / triceps",
  "Machine Chest Press": "chest / triceps, front_delts",
  "Incline Machine Chest Press": "chest+front_delts / triceps",
  "Iso-Lateral Chest Press": "chest / triceps, front_delts",
  "Iso-Lateral Incline Chest Press": "chest+front_delts / triceps",
  "Iso-Lateral Decline Chest Press": "chest / triceps",
  "Supine Bench Press": "chest / triceps, front_delts",
  "Dumbbell Fly": "chest / front_delts",
  "Incline Dumbbell Fly": "chest / front_delts",
  "Cable Fly": "chest / front_delts",
  "Low-to-High Cable Fly": "chest / front_delts",
  "High-to-Low Cable Fly": "chest / front_delts",
  "Machine Chest Fly": "chest / front_delts",
  "Push-Up": "chest / triceps, front_delts, core",
  "Incline Push-Up": "chest / triceps, front_delts",
  "Decline Push-Up": "chest+front_delts / triceps, core",
  "Dip": "chest+triceps / front_delts",
  "Dumbbell Pullover": "chest+lats / triceps",

  // ---- vertical pulls and high rows: lats. The lower back does nothing here.
  "Lat Pulldown": "lats / upper_back, biceps, rear_delts",
  "Close-Grip Lat Pulldown": "lats / upper_back, biceps",
  "Reverse-Grip Lat Pulldown": "lats / biceps, upper_back",
  "Pull-Up": "lats / upper_back, biceps, forearms, core",
  "Wide-Grip Pull-Up": "lats / upper_back, rear_delts, biceps",
  "Chin-Up": "lats+biceps / upper_back, forearms",
  "Assisted Pull-Up": "lats / upper_back, biceps",
  "Scapular Pull-Up": "traps / lats, upper_back",
  "Machine High Row": "lats / upper_back, rear_delts, biceps",
  "Iso-Lateral High Row": "lats / upper_back, rear_delts, biceps",
  "Straight-Arm Pulldown": "lats / triceps, core",
  "Machine Pullover": "lats / chest, triceps",

  // ---- rows. Elbows tucked → lats; elbows out / chest-supported → upper back + rear delts. Bent-over rows also hold the lower back.
  "Barbell Row": "lats+upper_back / rear_delts, biceps, lower_back, forearms",
  "Pendlay Row": "upper_back+lats / rear_delts, biceps, lower_back",
  "T-Bar Row": "upper_back+lats / rear_delts, biceps, lower_back",
  "Smith Machine Row": "lats+upper_back / rear_delts, biceps, lower_back",
  "Dumbbell Row": "lats / upper_back, rear_delts, biceps",
  "Seated Cable Row": "lats+upper_back / rear_delts, biceps",
  "Iso-Lateral Low Row": "lats / upper_back, biceps",
  "Iso-Lateral Row": "upper_back+lats / rear_delts, biceps",
  "Machine Row": "upper_back+lats / rear_delts, biceps",
  "Wide-Grip Seated Cable Row": "upper_back / rear_delts, lats, biceps",
  "Chest-Supported T-Bar Row": "upper_back / lats, rear_delts, biceps",
  "Seal Row": "upper_back / lats, rear_delts, biceps",
  "Inverted Row": "upper_back / lats, rear_delts, biceps, core",

  // ---- hinges / erectors
  "Barbell Deadlift": "lower_back+glutes / hamstrings, adductors, quads, traps, lats, forearms, core",
  "Deficit Deadlift": "lower_back+glutes / hamstrings, quads, traps, lats, forearms",
  "Rack Pull": "lower_back+traps / glutes, hamstrings, upper_back, forearms",
  "Back Extension": "lower_back / glutes, hamstrings",
  "Machine Back Extension": "lower_back / glutes, hamstrings",

  // ---- traps
  "Barbell Shrug": "traps / forearms",
  "Dumbbell Shrug": "traps / forearms",
  "Smith Machine Shrug": "traps / forearms",
  "Machine Shrug": "traps / forearms",
  "Cable Shrug": "traps / forearms",
  "Chest-Supported Dumbbell Shrug": "traps / upper_back",

  // ---- shoulders
  "Barbell Overhead Press": "front_delts / side_delts, triceps, traps, core",
  "Dumbbell Shoulder Press": "front_delts / side_delts, triceps, core",
  "Seated Dumbbell Shoulder Press": "front_delts / side_delts, triceps",
  "Seated Barbell Shoulder Press": "front_delts / side_delts, triceps",
  "Seated Smith Machine Shoulder Press": "front_delts / side_delts, triceps",
  "Machine Shoulder Press": "front_delts / side_delts, triceps",
  "Iso-Lateral Shoulder Press": "front_delts / side_delts, triceps",
  "Arnold Press": "front_delts+side_delts / triceps",
  "Push Press": "front_delts / side_delts, triceps, quads, glutes",
  "Landmine Press": "front_delts / chest, triceps, core",
  "Dumbbell Front Raise": "front_delts / chest",
  "Cable Front Raise": "front_delts / chest",
  "Single-Arm Cable Front Raise": "front_delts / chest",
  "Dumbbell Lateral Raise": "side_delts / ",
  "Cable Lateral Raise": "side_delts / ",
  "Machine Lateral Raise": "side_delts / ",
  "Seated Dumbbell Lateral Raise": "side_delts / ",
  "Incline Side-Lying Lateral Raise": "side_delts / ",
  "Upright Row": "side_delts+traps / front_delts, biceps",
  "Cable Upright Row": "side_delts+traps / front_delts, biceps",
  "Reverse Pec Deck": "rear_delts / upper_back",
  "Cable Reverse Fly": "rear_delts / upper_back",
  "Single-Arm Cable Reverse Fly": "rear_delts / upper_back",
  "Dumbbell Reverse Fly": "rear_delts / upper_back",
  "Face Pull": "rear_delts / upper_back, traps",

  // ---- biceps
  "Barbell Curl": "biceps / forearms",
  "EZ-Bar Curl": "biceps / forearms",
  "Dumbbell Curl": "biceps / forearms",
  "Cable Curl": "biceps / forearms",
  "Incline Dumbbell Curl": "biceps / forearms",
  "Machine Bicep Curl": "biceps / forearms",
  "Bayesian Curl": "biceps / forearms",
  "Dumbbell Preacher Curl": "biceps / forearms",
  "EZ-Bar Preacher Curl": "biceps / forearms",
  "Single-Arm Dumbbell Preacher Curl": "biceps / forearms",
  "Concentration Curl": "biceps / ",
  "Spider Curl": "biceps / ",
  // hammer grip shifts load to the brachialis / brachioradialis
  "Hammer Curl": "biceps+forearms / ",
  "Preacher Hammer Curl": "biceps+forearms / ",
  "Incline Hammer Curl": "biceps+forearms / ",
  "Cable Hammer Curl": "biceps+forearms / ",

  // ---- triceps
  "Close-Grip Bench Press": "triceps+chest / front_delts",
  "Close-Grip Incline Bench Press": "triceps+chest / front_delts",
  "JM Press": "triceps / chest",
  "Diamond Push-Up": "triceps+chest / front_delts",
  "Bench Dip": "triceps / chest, front_delts",
  "Machine Seated Dip": "triceps / chest, front_delts",
  "Skull Crusher": "triceps / ",
  "Tricep Pushdown": "triceps / ",
  "Tricep Rope Pushdown": "triceps / ",
  "Single-Arm Tricep Pushdown": "triceps / ",
  "Overhead Tricep Extension": "triceps / ",
  "Dumbbell Overhead Tricep Extension": "triceps / ",
  "Machine Tricep Extension": "triceps / ",
  "Dumbbell Kickback": "triceps / ",
  "Cable Tricep Kickback": "triceps / ",

  // ---- forearms / grip
  "Barbell Wrist Curl": "forearms / ",
  "Dumbbell Wrist Curl": "forearms / ",
  "Cable Wrist Curl": "forearms / ",
  "Single-Arm Cable Wrist Curl": "forearms / ",
  "Kettlebell Wrist Curl": "forearms / ",
  "Barbell Reverse Wrist Curl": "forearms / ",
  "Dumbbell Reverse Wrist Curl": "forearms / ",
  "Cable Reverse Wrist Curl": "forearms / ",
  "Hand Gripper": "forearms / ",
  "Reverse Barbell Curl": "forearms / biceps",
  "Reverse EZ-Bar Curl": "forearms / biceps",
  "Farmer's Carry": "forearms+traps / core, upper_back",
  "Dead Hang": "forearms / lats",

  // ---- quads
  "Barbell Squat": "quads+glutes / adductors, hamstrings, lower_back, core",
  "Pause Squat": "quads+glutes / adductors, lower_back, core",
  "Front Squat": "quads / glutes, adductors, upper_back, core",
  "Smith Machine Squat": "quads / glutes, adductors",
  "Hack Squat": "quads / glutes, adductors",
  "Leg Press": "quads / glutes, adductors",
  "Seated Leg Press": "quads / glutes, adductors",
  "Goblet Squat": "quads / glutes, adductors, core",
  "Bulgarian Split Squat": "quads+glutes / adductors, hamstrings",
  "Walking Lunge": "quads+glutes / adductors, hamstrings",
  "Reverse Lunge": "quads+glutes / adductors, hamstrings",
  "Barbell Lunge": "quads+glutes / adductors, hamstrings, core",
  "Step-Up": "quads+glutes / hamstrings",
  "Leg Extension": "quads / ",
  "Box Jump": "quads / glutes, calves, hamstrings",

  // ---- hamstrings
  "Romanian Deadlift": "hamstrings+glutes / lower_back, adductors, forearms",
  "Dumbbell Romanian Deadlift": "hamstrings+glutes / lower_back, forearms",
  "Stiff-Leg Deadlift": "hamstrings / glutes, lower_back",
  "Good Morning": "hamstrings / glutes, lower_back",
  "Lying Leg Curl": "hamstrings / calves",
  "Seated Leg Curl": "hamstrings / ",
  "Nordic Curl": "hamstrings / calves",
  "Glute-Ham Raise": "hamstrings / glutes, calves",

  // ---- glutes / adductors
  "Hip Thrust": "glutes / hamstrings, adductors",
  "Glute Bridge": "glutes / hamstrings",
  "Cable Kickback": "glutes / hamstrings",
  "Machine Glute Kickback": "glutes / hamstrings",
  "Cable Pull-Through": "glutes / hamstrings",
  "Hip Abduction": "glutes / ",
  "Sumo Deadlift": "glutes+adductors / quads, hamstrings, lower_back, traps, forearms",
  "Trap Bar Deadlift": "glutes+quads / hamstrings, lower_back, traps, forearms",
  "Kettlebell Swing": "glutes+hamstrings / lower_back, core, front_delts, forearms",
  "Hip Adduction": "adductors / ",

  // ---- calves
  "Standing Calf Raise": "calves / ",
  "Seated Calf Raise": "calves / ",
  "Leg Press Calf Raise": "calves / ",
  "Hack Squat Calf Raise": "calves / ",
  "Smith Machine Calf Raise": "calves / ",
  "Barbell Calf Raise": "calves / ",

  // ---- core
  "Plank": "core / front_delts",
  "Side Plank": "core / side_delts, glutes",
  "Hanging Leg Raise": "core / forearms, lats",
  "Hanging Knee Raise": "core / forearms",
  "Captain's Chair Leg Raise": "core / ",
  "Cable Crunch": "core / ",
  "Crunch": "core / ",
  "Decline Crunch": "core / ",
  "Machine Crunch": "core / ",
  "Sit-Up": "core / ",
  "Bicycle Crunch": "core / ",
  "Russian Twist": "core / ",
  "Machine Torso Rotation": "core / ",
  "Pallof Press": "core / ",
  "Dead Bug": "core / ",
  "Hollow Hold": "core / ",
  "Ab Wheel Rollout": "core / lats, front_delts, triceps",
  "Cable Woodchopper": "core / front_delts",
  "Mountain Climber": "core / front_delts, quads",

  // ---- full body (already spreads a little everywhere; these are where it lands hardest)
  "Power Clean": "full_body / quads, glutes, hamstrings, traps, lower_back",
  "Hang Clean": "full_body / quads, glutes, hamstrings, traps, lower_back",
  "Snatch": "full_body / quads, glutes, traps, upper_back, front_delts",
  "Clean and Jerk": "full_body / quads, glutes, traps, front_delts, triceps",
  "Thruster": "full_body / quads, glutes, front_delts, triceps",
  "Burpee": "full_body / chest, quads, front_delts, triceps",
  "Turkish Get-Up": "full_body / front_delts, side_delts, core, glutes",
  "Sled Push": "full_body / quads, glutes, calves",
  "Battle Ropes": "full_body / front_delts, side_delts, core, forearms",

  // ---- cardio
  "Running": "cardio / quads, hamstrings, calves",
  "Treadmill": "cardio / quads, hamstrings, calves",
  "Walking": "cardio / calves",
  "Hiking": "cardio / quads, glutes, calves",
  "Cycling": "cardio / quads, hamstrings, calves",
  "Stair Climber": "cardio / quads, glutes, calves",
  "Elliptical": "cardio / quads, glutes",
  "Rowing Machine": "cardio / lats, upper_back, quads, biceps",
  "Ski Erg": "cardio / lats, triceps, core",
  "Swimming": "cardio / lats, front_delts, side_delts",
  "Air Bike": "cardio / quads, front_delts",
  "Jump Rope": "cardio / calves, front_delts",
  "Jumping Jack": "cardio / calves, side_delts",
  "Basketball": "cardio / quads, calves",
}

const MUSCLES = ["chest", "back", "shoulders", "lats", "traps", "upper_back", "lower_back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "adductors", "calves", "core", "full_body", "cardio"]
const parse = (spec) => {
  const [p, s] = spec.split("/")
  const [muscle, muscle2] = p.trim().split("+")
  return { muscle, muscle2: muscle2 || "", sec: s.split(",").map((x) => x.trim()).filter(Boolean) }
}
const list = (r, f) => { const out = [], s = r.getStringSlice(f); for (let i = 0; i < s.length; i++) out.push(s[i]); return out }
// Old whole-group names, for telling whether a personal edit just copied the official muscles.
const GROUP = { lats: "back", traps: "back", upper_back: "back", lower_back: "back", front_delts: "shoulders", side_delts: "shoulders", rear_delts: "shoulders" }
const fold = (ms) => ms.map((m) => GROUP[m] || m).filter((m, i, a) => a.indexOf(m) === i).sort().join(",")

migrate((app) => {
  for (const name of ["exercises", "exercise_overrides"]) {
    const c = app.findCollectionByNameOrId(name)
    if (!c.fields.getByName("muscle2")) c.fields.add(new SelectField({ name: "muscle2", values: MUSCLES, maxSelect: 1 }))
    app.save(c)
  }

  const official = new Map()
  for (const name of Object.keys(LIB)) {
    let r
    try { r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { continue }
    official.set(r.id, { before: { muscle: r.getString("muscle"), sec: list(r, "secondary") }, after: parse(LIB[name]) })
    const v = parse(LIB[name])
    r.set("muscle", v.muscle)
    r.set("muscle2", v.muscle2)
    r.set("secondary", v.sec)
    app.save(r)
  }

  // Personal edits store all the muscles; if they match the official ones (old or new), stop overriding them.
  for (const o of app.findRecordsByFilter("exercise_overrides", "muscle != ''", "", 0, 0)) {
    const ex = official.get(o.getString("exercise"))
    if (!ex) continue
    const mine = { muscle: GROUP[o.getString("muscle")] || o.getString("muscle"), sec: fold(list(o, "secondary")) }
    const same = (v) => mine.muscle === (GROUP[v.muscle] || v.muscle) && mine.sec === fold(v.sec)
    if (same(ex.before) || same({ muscle: ex.after.muscle, sec: [ex.after.muscle2, ...ex.after.sec].filter(Boolean) })) {
      o.set("muscle", "")
      o.set("secondary", [])
      app.save(o)
    }
  }
}, (app) => {
  // Second primary muscles become the first secondary muscle, then the field goes. Other muscle changes stay.
  for (const name of ["exercises", "exercise_overrides"]) {
    for (const r of app.findRecordsByFilter(name, "muscle2 != ''", "", 0, 0)) {
      r.set("secondary", [r.getString("muscle2"), ...list(r, "secondary")].filter((m, i, a) => a.indexOf(m) === i))
      app.save(r)
    }
    const c = app.findCollectionByNameOrId(name)
    c.fields.removeByName("muscle2")
    app.save(c)
  }
})
