/// <reference path="../pb_data/types.d.ts" />

// Bigger official library: everything common gyms log (machines, cables, Smith, iso-lateral, grip work) plus the
// classic barbell/dumbbell lifts that were missing. Upserts by name; never overwrites details an existing row already has.
migrate((app) => {
  // [name, muscle, equipment, kind, secondary, "step|step|step"]
  const LIB = [
    // ---- chest
    ["Smith Machine Bench Press", "chest", "machine", "weight", ["triceps", "shoulders"], "Lie with the bar over your mid-chest and unrack it with a twist of the wrists.|Lower to your mid-chest with elbows about 45° from your body.|Press to lockout and rack by twisting the bar back onto the hooks."],
    ["Smith Machine Incline Bench Press", "chest", "machine", "weight", ["shoulders", "triceps"], "Set an incline bench under the bar so it lines up with your upper chest.|Unrack and lower the bar to just below your collarbone.|Press to lockout without letting your shoulders roll forward."],
    ["Incline Machine Chest Press", "chest", "machine", "weight", ["shoulders", "triceps"], "Set the seat so the handles start level with your upper chest.|Press up and forward until your arms are nearly straight.|Return slowly until you feel a stretch across your chest."],
    ["Iso-Lateral Chest Press", "chest", "machine", "weight", ["triceps", "shoulders"], "Set the seat so the handles line up with your mid-chest.|Press both handles (or one at a time) forward to near lockout.|Lower under control until your hands are beside your chest."],
    ["Iso-Lateral Incline Chest Press", "chest", "machine", "weight", ["shoulders", "triceps"], "Sit with your back flat on the pad and the handles at upper-chest height.|Press up and forward to near lockout.|Lower slowly to a deep stretch."],
    ["Iso-Lateral Decline Chest Press", "chest", "machine", "weight", ["triceps"], "Sit with the handles level with your lower chest.|Press down and forward until your arms are nearly straight.|Return slowly with your shoulders kept back."],
    ["Supine Bench Press", "chest", "machine", "weight", ["triceps", "shoulders"], "Lie on the machine with the handles over your mid-chest.|Lower the handles to your chest, keeping your shoulder blades pinched.|Press back up to lockout."],
    ["Decline Dumbbell Bench Press", "chest", "dumbbell", "weight", ["triceps", "shoulders"], "Hook your legs on the decline bench and hold the dumbbells over your lower chest.|Lower them to the sides of your chest.|Press back up and slightly together."],
    ["Incline Dumbbell Fly", "chest", "dumbbell", "weight", ["shoulders"], "Lie on a 30° incline with dumbbells over your upper chest, palms facing.|Open your arms in a wide arc with soft elbows until you feel a stretch.|Squeeze them back together over your chest."],
    ["Low-to-High Cable Fly", "chest", "cable", "weight", ["shoulders"], "Set both pulleys low and step forward into a split stance.|Sweep the handles up and together to upper-chest height.|Lower back down under control."],
    ["High-to-Low Cable Fly", "chest", "cable", "weight", ["shoulders"], "Set both pulleys high and step forward.|Sweep the handles down and together in front of your hips.|Return slowly to a stretch."],
    ["Incline Push-Up", "chest", "bodyweight", "bodyweight", ["triceps", "shoulders"], "Put your hands on a bench or box, body in a straight line.|Lower your chest to the edge.|Push back up to straight arms."],
    ["Decline Push-Up", "chest", "bodyweight", "bodyweight", ["shoulders", "triceps"], "Put your feet on a bench and hands on the floor.|Lower your chest toward the floor, body straight.|Push back up."],
    ["Dumbbell Floor Press", "chest", "dumbbell", "weight", ["triceps"], "Lie on the floor with dumbbells over your chest, knees bent.|Lower until your upper arms touch the floor.|Press back up."],

    // ---- back
    ["Iso-Lateral Row", "back", "machine", "weight", ["biceps", "shoulders"], "Sit with your chest against the pad and grab the handles.|Row the handles back, driving your elbows past your torso.|Let them return until your arms are straight and shoulders stretch forward."],
    ["Iso-Lateral High Row", "back", "machine", "weight", ["biceps", "shoulders"], "Sit with your thighs locked under the pad and reach up to the handles.|Pull down and back toward your upper chest.|Return slowly to a full stretch overhead."],
    ["Iso-Lateral Low Row", "back", "machine", "weight", ["biceps", "shoulders"], "Sit with your chest on the pad and grab the low handles.|Row toward your hips, keeping your chest up.|Let your arms straighten fully."],
    ["Machine High Row", "back", "machine", "weight", ["biceps", "shoulders"], "Sit facing the machine and grab the handles above you.|Pull down and back toward your chest, squeezing your lats.|Return slowly."],
    ["Close-Grip Lat Pulldown", "back", "cable", "weight", ["biceps"], "Attach a V-handle and lock your knees under the pad.|Pull the handle to your upper chest, leaning back slightly.|Let it rise until your arms are straight."],
    ["Reverse-Grip Lat Pulldown", "back", "cable", "weight", ["biceps"], "Grip the bar underhand about shoulder width.|Pull it to your upper chest, elbows driving down.|Return slowly to full extension."],
    ["Wide-Grip Seated Cable Row", "back", "cable", "weight", ["shoulders", "biceps"], "Use a wide bar and sit tall with knees slightly bent.|Row the bar to your lower chest, elbows flared.|Extend forward without rounding your back."],
    ["Chest-Supported T-Bar Row", "back", "machine", "weight", ["biceps", "shoulders"], "Lie chest-down on the pad and grab the handles.|Row the weight up until your elbows pass your torso.|Lower until your arms are straight."],
    ["Smith Machine Row", "back", "machine", "weight", ["biceps", "shoulders"], "Hinge forward with a flat back under the Smith bar.|Row the bar to your lower ribs.|Lower under control without standing up."],
    ["Seal Row", "back", "barbell", "weight", ["biceps", "shoulders"], "Lie face down on a raised bench with the bar hanging below.|Row the bar up to the bench.|Lower to a dead hang."],
    ["Machine Pullover", "back", "machine", "weight", ["chest", "triceps"], "Sit with your elbows on the pads and hands on the bar overhead.|Sweep your arms down and forward to your stomach.|Return slowly to a stretch overhead."],
    ["Dumbbell Pullover", "back", "dumbbell", "weight", ["chest", "triceps"], "Lie across a bench holding one dumbbell over your chest.|Lower it behind your head with slightly bent elbows.|Pull it back over your chest."],
    ["Wide-Grip Pull-Up", "back", "bodyweight", "bodyweight", ["biceps", "shoulders"], "Hang with an overhand grip well outside your shoulders.|Pull your chest toward the bar.|Lower to a full hang."],
    ["Scapular Pull-Up", "back", "bodyweight", "bodyweight", ["shoulders"], "Hang from the bar with straight arms.|Pull your shoulder blades down and together to lift your body slightly.|Relax back to a full hang."],
    ["Inverted Row", "back", "bodyweight", "bodyweight", ["biceps", "shoulders"], "Hang under a bar or rings with your body straight and heels on the floor.|Pull your chest to the bar.|Lower until your arms are straight."],
    ["Machine Back Extension", "back", "machine", "weight", ["glutes", "hamstrings"], "Sit with the pad across your upper back.|Extend backward until your torso is upright or slightly past.|Return slowly."],
    ["Smith Machine Shrug", "back", "machine", "weight", ["forearms"], "Hold the Smith bar in front of your thighs.|Shrug your shoulders straight up toward your ears.|Pause, then lower slowly."],
    ["Machine Shrug", "back", "machine", "weight", ["forearms"], "Stand or sit in the machine with the handles at your sides.|Shrug straight up and hold briefly.|Lower to a full stretch."],
    ["Cable Shrug", "back", "cable", "weight", ["forearms"], "Hold a bar attached to a low pulley in front of your thighs.|Shrug straight up.|Lower slowly."],
    ["Chest-Supported Dumbbell Shrug", "back", "dumbbell", "weight", ["shoulders"], "Lie chest-down on an incline bench with dumbbells hanging.|Pull your shoulder blades up and back.|Lower slowly."],
    ["Trap Bar Deadlift", "quads", "barbell", "weight", ["glutes", "hamstrings", "back", "forearms"], "Stand inside the trap bar and grip the handles.|Brace and push the floor away until you stand tall.|Lower the bar back down under control."],
    ["Deficit Deadlift", "back", "barbell", "weight", ["hamstrings", "glutes", "forearms"], "Stand on a plate or low platform with the bar over your mid-foot.|Pull from the deeper start with a flat back.|Lower back to the floor."],

    // ---- shoulders
    ["Dumbbell Shoulder Press", "shoulders", "dumbbell", "weight", ["triceps"], "Stand with dumbbells at shoulder height, palms forward.|Press overhead until your arms are straight.|Lower back to your shoulders."],
    ["Seated Barbell Shoulder Press", "shoulders", "barbell", "weight", ["triceps"], "Sit upright in a rack with the bar at shoulder height.|Press it overhead to lockout.|Lower to your upper chest under control."],
    ["Seated Smith Machine Shoulder Press", "shoulders", "machine", "weight", ["triceps"], "Sit under the Smith bar with it at chin height.|Press to near lockout.|Lower to your upper chest."],
    ["Iso-Lateral Shoulder Press", "shoulders", "machine", "weight", ["triceps"], "Set the seat so the handles start at shoulder height.|Press up to near lockout.|Lower slowly."],
    ["Push Press", "shoulders", "barbell", "weight", ["triceps", "quads"], "Start with the bar on your front shoulders.|Dip your knees slightly, then drive up and press the bar overhead.|Lower it back to your shoulders."],
    ["Landmine Press", "shoulders", "barbell", "weight", ["chest", "triceps"], "Hold the end of a landmine bar at your shoulder.|Press it up and forward until your arm is straight.|Lower back to your shoulder."],
    ["Machine Lateral Raise", "shoulders", "machine", "weight", [], "Sit with the pads on the outside of your arms.|Raise your arms out to the sides to shoulder height.|Lower slowly."],
    ["Seated Dumbbell Lateral Raise", "shoulders", "dumbbell", "weight", [], "Sit at the end of a bench holding dumbbells at your sides.|Raise them out to shoulder height.|Lower under control."],
    ["Incline Side-Lying Lateral Raise", "shoulders", "dumbbell", "weight", [], "Lie on your side against an incline bench holding a dumbbell.|Raise it up and out to just above shoulder height.|Lower slowly."],
    ["Cable Front Raise", "shoulders", "cable", "weight", ["chest"], "Stand facing away from a low pulley holding the handle.|Raise it in front of you to shoulder height.|Lower slowly."],
    ["Single-Arm Cable Front Raise", "shoulders", "cable", "weight", ["chest"], "Stand facing away from a low pulley holding one handle.|Raise it straight in front to shoulder height.|Lower slowly, then switch arms."],
    ["Cable Reverse Fly", "shoulders", "cable", "weight", ["back"], "Cross the cables at shoulder height, holding the opposite handles.|Pull your arms out and back with soft elbows.|Return slowly."],
    ["Single-Arm Cable Reverse Fly", "shoulders", "cable", "weight", ["back"], "Stand side-on to a pulley at shoulder height and take the handle across your body.|Sweep your arm out and back.|Return under control, then switch sides."],
    ["Dumbbell Reverse Fly", "shoulders", "dumbbell", "weight", ["back"], "Hinge forward with dumbbells hanging below your chest.|Raise them out to the sides, leading with your elbows.|Lower slowly."],
    ["Cable Upright Row", "shoulders", "cable", "weight", ["back", "biceps"], "Hold a bar on a low pulley in front of your thighs.|Pull it up along your body until your elbows reach shoulder height.|Lower slowly."],

    // ---- biceps
    ["Machine Bicep Curl", "biceps", "machine", "weight", ["forearms"], "Sit with your upper arms on the pad and grip the handles.|Curl up until your forearms are vertical.|Lower to almost straight."],
    ["Bayesian Curl", "biceps", "cable", "weight", ["forearms"], "Face away from a low pulley with your arm behind your body.|Curl the handle forward and up without moving your elbow.|Lower to a full stretch behind you."],
    ["EZ-Bar Preacher Curl", "biceps", "barbell", "weight", ["forearms"], "Rest your upper arms on the preacher pad holding an EZ bar.|Curl the bar up.|Lower slowly until your arms are nearly straight."],
    ["Single-Arm Dumbbell Preacher Curl", "biceps", "dumbbell", "weight", ["forearms"], "Rest one upper arm on the preacher pad.|Curl the dumbbell up.|Lower slowly to almost straight, then switch arms."],
    ["Preacher Hammer Curl", "biceps", "dumbbell", "weight", ["forearms"], "Rest your upper arm on the preacher pad, palm facing in.|Curl up without rotating your wrist.|Lower slowly."],
    ["Incline Hammer Curl", "biceps", "dumbbell", "weight", ["forearms"], "Lie back on an incline bench, arms hanging, palms facing in.|Curl up without moving your elbows forward.|Lower to a full stretch."],
    ["Cable Hammer Curl", "biceps", "cable", "weight", ["forearms"], "Hold a rope on a low pulley with palms facing in.|Curl it up with your elbows at your sides.|Lower slowly."],
    ["Spider Curl", "biceps", "dumbbell", "weight", [], "Lie chest-down on an incline bench with arms hanging straight.|Curl the dumbbells up.|Lower slowly."],
    ["Reverse Barbell Curl", "forearms", "barbell", "weight", ["biceps"], "Hold the bar overhand at shoulder width.|Curl it up keeping your wrists straight.|Lower slowly."],
    ["Reverse EZ-Bar Curl", "forearms", "barbell", "weight", ["biceps"], "Hold the EZ bar overhand.|Curl it up with your elbows pinned.|Lower slowly."],

    // ---- triceps
    ["Tricep Rope Pushdown", "triceps", "cable", "weight", [], "Hold a rope on a high pulley with elbows at your sides.|Push down and split the rope at the bottom.|Let it rise until your forearms pass parallel."],
    ["Single-Arm Tricep Pushdown", "triceps", "cable", "weight", [], "Hold one handle on a high pulley.|Push down until your arm is straight.|Return slowly, then switch arms."],
    ["Dumbbell Overhead Tricep Extension", "triceps", "dumbbell", "weight", [], "Hold one dumbbell overhead with both hands.|Lower it behind your head by bending your elbows.|Extend back up."],
    ["Machine Tricep Extension", "triceps", "machine", "weight", [], "Sit with your elbows on the pad and hands on the handles.|Extend your arms until straight.|Return slowly."],
    ["Cable Tricep Kickback", "triceps", "cable", "weight", [], "Hinge forward holding a low cable with your upper arm by your side.|Straighten your elbow behind you.|Return slowly."],
    ["JM Press", "triceps", "barbell", "weight", ["chest"], "Lie on a bench with a close grip on the bar.|Lower the bar toward your chin by bending your elbows forward.|Press back up to lockout."],
    ["Close-Grip Incline Bench Press", "triceps", "barbell", "weight", ["chest", "shoulders"], "Lie on an incline bench and grip the bar shoulder-width.|Lower to your upper chest with elbows tucked.|Press back to lockout."],
    ["Machine Seated Dip", "triceps", "machine", "weight", ["chest", "shoulders"], "Sit with the handles at your sides.|Press down until your arms are straight.|Return slowly until your elbows bend about 90°."],
    ["Diamond Push-Up", "triceps", "bodyweight", "bodyweight", ["chest", "shoulders"], "Start in a push-up with your hands together under your chest.|Lower your chest to your hands.|Push back up."],

    // ---- forearms / grip
    ["Dumbbell Wrist Curl", "forearms", "dumbbell", "weight", [], "Rest your forearms on a bench, palms up, holding dumbbells.|Curl them up with your wrists only.|Lower slowly."],
    ["Barbell Reverse Wrist Curl", "forearms", "barbell", "weight", [], "Rest your forearms on your thighs, palms down, holding a bar.|Raise the bar with your wrists only.|Lower slowly."],
    ["Dumbbell Reverse Wrist Curl", "forearms", "dumbbell", "weight", [], "Rest your forearms on a bench, palms down, holding dumbbells.|Raise your knuckles toward the ceiling.|Lower slowly."],
    ["Cable Wrist Curl", "forearms", "cable", "weight", [], "Kneel or sit facing a low pulley with a bar, palms up.|Curl the bar with your wrists only.|Lower slowly."],
    ["Cable Reverse Wrist Curl", "forearms", "cable", "weight", [], "Face a low pulley holding a bar palms down.|Raise it with your wrists only.|Lower slowly."],
    ["Single-Arm Cable Wrist Curl", "forearms", "cable", "weight", [], "Hold one handle on a low pulley, palm up, forearm supported.|Curl with your wrist only.|Lower slowly, then switch arms."],
    ["Kettlebell Wrist Curl", "forearms", "kettlebell", "weight", [], "Rest your forearm on a bench holding a kettlebell, palm up.|Curl it with your wrist only.|Lower slowly."],
    ["Hand Gripper", "forearms", "other", "weight", [], "Hold the gripper in one hand.|Squeeze until the handles touch.|Release slowly."],
    ["Dead Hang", "forearms", "bodyweight", "duration", ["back", "shoulders"], "Grip a pull-up bar overhand.|Hang with straight arms and relaxed shoulders.|Hold for time."],

    // ---- legs
    ["Seated Leg Press", "quads", "machine", "weight", ["glutes", "hamstrings"], "Sit in the horizontal press with feet shoulder-width on the platform.|Bend your knees until they reach about 90°.|Press back out without locking your knees."],
    ["Reverse Lunge", "quads", "dumbbell", "weight", ["glutes", "hamstrings"], "Stand holding dumbbells at your sides.|Step back and lower until both knees are bent about 90°.|Drive through your front foot to stand back up."],
    ["Barbell Lunge", "quads", "barbell", "weight", ["glutes", "hamstrings"], "Set the bar on your upper back.|Step forward and lower until both knees bend about 90°.|Push back to standing."],
    ["Pause Squat", "quads", "barbell", "weight", ["glutes", "core"], "Squat as normal to depth.|Hold the bottom for two seconds without relaxing.|Drive back up."],
    ["Box Jump", "quads", "bodyweight", "bodyweight", ["glutes", "calves"], "Stand facing a sturdy box.|Swing your arms and jump onto it, landing softly.|Step back down."],
    ["Stiff-Leg Deadlift", "hamstrings", "barbell", "weight", ["glutes", "back"], "Stand with the bar at your thighs and knees nearly straight.|Hinge forward, lowering the bar along your legs.|Return to standing by squeezing your glutes."],
    ["Dumbbell Romanian Deadlift", "hamstrings", "dumbbell", "weight", ["glutes", "back"], "Hold dumbbells in front of your thighs with soft knees.|Push your hips back and lower them down your legs.|Stand back up."],
    ["Glute-Ham Raise", "hamstrings", "bodyweight", "bodyweight", ["glutes", "calves"], "Lock your feet in the GHD with knees on the pad.|Lower your body forward under control.|Curl back up using your hamstrings."],
    ["Hip Adduction", "hamstrings", "machine", "weight", ["glutes"], "Sit with the pads on the inside of your knees.|Squeeze your legs together.|Open slowly."],
    ["Machine Glute Kickback", "glutes", "machine", "weight", ["hamstrings"], "Set up in the machine with one foot on the plate.|Kick back and up, squeezing your glute.|Return slowly, then switch legs."],
    ["Cable Pull-Through", "glutes", "cable", "weight", ["hamstrings"], "Face away from a low pulley holding a rope between your legs.|Hinge back, then drive your hips forward to stand tall.|Repeat without rounding your back."],
    ["Leg Press Calf Raise", "calves", "machine", "weight", [], "Sit in the leg press with the balls of your feet on the platform edge.|Push through your toes as far as you can.|Lower to a deep stretch."],
    ["Hack Squat Calf Raise", "calves", "machine", "weight", [], "Stand on the hack squat with the balls of your feet on the edge.|Rise onto your toes.|Lower to a full stretch."],
    ["Smith Machine Calf Raise", "calves", "machine", "weight", [], "Stand on a plate under the Smith bar.|Rise up onto your toes.|Lower your heels below the plate."],
    ["Barbell Calf Raise", "calves", "barbell", "weight", [], "Hold the bar on your upper back.|Rise onto your toes.|Lower slowly."],

    // ---- core
    ["Decline Crunch", "core", "bodyweight", "bodyweight", [], "Hook your feet on a decline bench.|Curl your torso up toward your knees.|Lower back down slowly."],
    ["Machine Crunch", "core", "machine", "weight", [], "Sit in the machine holding the handles.|Crunch forward, bringing your ribs toward your hips.|Return slowly."],
    ["Captain's Chair Leg Raise", "core", "bodyweight", "bodyweight", [], "Support yourself on the forearm pads with your back against the pad.|Raise your knees or legs toward your chest.|Lower slowly."],
    ["Hanging Knee Raise", "core", "bodyweight", "bodyweight", ["forearms"], "Hang from a bar.|Bring your knees up toward your chest.|Lower slowly without swinging."],
    ["Machine Torso Rotation", "core", "machine", "weight", [], "Sit with your chest against the pad and lock your legs.|Rotate your torso to one side against the resistance.|Return slowly; train both sides."],
    ["Cable Woodchopper", "core", "cable", "weight", ["shoulders"], "Stand side-on to a pulley holding the handle with both hands.|Rotate and pull diagonally across your body.|Return slowly; train both sides."],
    ["Pallof Press", "core", "cable", "weight", [], "Stand side-on to a chest-height cable holding the handle at your chest.|Press it straight out and resist the twist.|Bring it back in."],
    ["Sit-Up", "core", "bodyweight", "bodyweight", [], "Lie with knees bent and feet anchored.|Sit all the way up.|Lower back down slowly."],
    ["Bicycle Crunch", "core", "bodyweight", "bodyweight", [], "Lie on your back with hands by your head.|Bring one elbow toward the opposite knee as you extend the other leg.|Alternate sides."],
    ["Dead Bug", "core", "bodyweight", "bodyweight", [], "Lie on your back with arms up and knees bent at 90°.|Lower one arm and the opposite leg toward the floor.|Return and switch sides."],
    ["Hollow Hold", "core", "bodyweight", "duration", [], "Lie on your back and press your lower back into the floor.|Lift your shoulders and legs off the floor.|Hold for time."],
    ["Mountain Climber", "core", "bodyweight", "bodyweight", ["shoulders", "quads"], "Start in a high plank.|Drive one knee toward your chest, then switch quickly.|Keep your hips level."],

    // ---- full body
    ["Hang Clean", "full_body", "barbell", "weight", ["quads", "glutes", "back", "shoulders"], "Hold the bar at your thighs.|Dip, then explode up and pull yourself under into a front squat catch.|Stand up tall."],
    ["Clean and Jerk", "full_body", "barbell", "weight", ["quads", "glutes", "back", "shoulders", "triceps"], "Clean the bar to your shoulders.|Dip and drive it overhead, splitting your feet.|Recover to standing with the bar locked out."],
    ["Snatch", "full_body", "barbell", "weight", ["quads", "glutes", "back", "shoulders"], "Take a wide grip with the bar over your mid-foot.|Pull explosively and drop under the bar, catching it overhead.|Stand up with the bar locked out."],
    ["Burpee", "full_body", "bodyweight", "bodyweight", ["chest", "quads", "shoulders"], "Squat down and put your hands on the floor.|Jump your feet back, do a push-up and jump them in.|Jump up with your arms overhead."],
    ["Turkish Get-Up", "full_body", "kettlebell", "weight", ["shoulders", "core", "glutes"], "Lie down holding a kettlebell straight up.|Stand up in stages while keeping the bell overhead.|Reverse the steps back to the floor."],
    ["Sled Push", "full_body", "other", "weight", ["quads", "glutes", "calves"], "Grip the sled poles with arms extended.|Drive with short, powerful steps.|Log the sled weight and your distance as reps or notes."],
    ["Battle Ropes", "full_body", "other", "duration", ["shoulders", "core"], "Hold a rope end in each hand in an athletic stance.|Make fast waves by moving your arms up and down.|Keep going for the set time."],

    // ---- cardio / sport
    ["Walking", "cardio", "other", "cardio", ["calves"], "Walk at a brisk, steady pace.|Log your distance and time."],
    ["Hiking", "cardio", "other", "cardio", ["quads", "glutes", "calves"], "Hike at a steady pace.|Log your distance and time."],
    ["Swimming", "cardio", "other", "cardio", ["back", "shoulders"], "Swim your chosen stroke at a steady pace.|Log your distance and time."],
    ["Air Bike", "cardio", "machine", "cardio", ["quads", "shoulders"], "Push and pull the handles while you pedal.|Log distance (or calories in notes) and time."],
    ["Ski Erg", "cardio", "machine", "cardio", ["back", "triceps", "core"], "Pull the handles down while hinging at the hips.|Log distance and time."],
    ["Jumping Jack", "cardio", "bodyweight", "bodyweight", ["calves", "shoulders"], "Jump your feet out while raising your arms overhead.|Jump back together.|Keep a steady rhythm."],
    ["Basketball", "cardio", "other", "duration", ["quads", "calves"], "Play.|Log how long you played."],
  ]

  const TIP = {
    weight: "Log the weight and reps for each set.",
    bodyweight: "Log reps. Only enter a weight if you add extra load like a vest or belt.",
    assisted: "Log the assistance weight and reps. Less assistance over time means progress.",
    duration: "Log how many seconds you held it.",
    cardio: "Log distance and time.",
  }
  const tipFor = (kind, eq) => kind === "weight" && eq === "dumbbell" ? "Log the weight of one dumbbell and your reps for each set." : (TIP[kind] || TIP.weight)
  const find = (name) => { try { return app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { return null } }

  // "Wrist Curl" was a dumbbell lift; make it the barbell version so dumbbell and barbell wrist curls keep separate PRs.
  const wrist = find("Wrist Curl")
  if (wrist && !find("Barbell Wrist Curl")) {
    wrist.set("name", "Barbell Wrist Curl")
    wrist.set("equipment", "barbell")
    wrist.set("log_tip", TIP.weight)
    app.save(wrist)
  }
  // Hip abduction works the outer glutes; give it secondary detail it was missing.
  const abd = find("Hip Abduction")
  if (abd && !abd.get("secondary")?.length) { abd.set("secondary", ["quads"]); app.save(abd) }

  const col = app.findCollectionByNameOrId("exercises")
  for (const [name, muscle, equipment, kind, secondary, steps] of LIB) {
    let r = find(name)
    if (!r) {
      r = new Record(col)
      r.set("name", name)
      r.set("muscle", muscle)
      r.set("equipment", equipment)
      r.set("kind", kind)
      r.set("is_main_lift", false)
      r.set("main_lift", "")
    }
    if (!r.get("secondary")?.length) r.set("secondary", secondary)
    if (!r.getString("instructions")) r.set("instructions", steps.split("|").join("\n"))
    if (!r.getString("log_tip")) r.set("log_tip", tipFor(r.getString("kind"), r.getString("equipment")))
    app.save(r)
  }
}, (app) => {
  // Remove only the rows this migration added that nothing references yet; keep anything with logged sets.
  const NAMES = ["Smith Machine Bench Press", "Smith Machine Incline Bench Press", "Incline Machine Chest Press", "Iso-Lateral Chest Press", "Iso-Lateral Incline Chest Press", "Iso-Lateral Decline Chest Press", "Supine Bench Press", "Decline Dumbbell Bench Press", "Incline Dumbbell Fly", "Low-to-High Cable Fly", "High-to-Low Cable Fly", "Incline Push-Up", "Decline Push-Up", "Dumbbell Floor Press", "Iso-Lateral Row", "Iso-Lateral High Row", "Iso-Lateral Low Row", "Machine High Row", "Close-Grip Lat Pulldown", "Reverse-Grip Lat Pulldown", "Wide-Grip Seated Cable Row", "Chest-Supported T-Bar Row", "Smith Machine Row", "Seal Row", "Machine Pullover", "Dumbbell Pullover", "Wide-Grip Pull-Up", "Scapular Pull-Up", "Inverted Row", "Machine Back Extension", "Smith Machine Shrug", "Machine Shrug", "Cable Shrug", "Chest-Supported Dumbbell Shrug", "Trap Bar Deadlift", "Deficit Deadlift", "Dumbbell Shoulder Press", "Seated Barbell Shoulder Press", "Seated Smith Machine Shoulder Press", "Iso-Lateral Shoulder Press", "Push Press", "Landmine Press", "Machine Lateral Raise", "Seated Dumbbell Lateral Raise", "Incline Side-Lying Lateral Raise", "Cable Front Raise", "Single-Arm Cable Front Raise", "Cable Reverse Fly", "Single-Arm Cable Reverse Fly", "Dumbbell Reverse Fly", "Cable Upright Row", "Machine Bicep Curl", "Bayesian Curl", "EZ-Bar Preacher Curl", "Single-Arm Dumbbell Preacher Curl", "Preacher Hammer Curl", "Incline Hammer Curl", "Cable Hammer Curl", "Spider Curl", "Reverse Barbell Curl", "Reverse EZ-Bar Curl", "Tricep Rope Pushdown", "Single-Arm Tricep Pushdown", "Dumbbell Overhead Tricep Extension", "Machine Tricep Extension", "Cable Tricep Kickback", "JM Press", "Close-Grip Incline Bench Press", "Machine Seated Dip", "Diamond Push-Up", "Dumbbell Wrist Curl", "Barbell Reverse Wrist Curl", "Dumbbell Reverse Wrist Curl", "Cable Wrist Curl", "Cable Reverse Wrist Curl", "Single-Arm Cable Wrist Curl", "Kettlebell Wrist Curl", "Hand Gripper", "Dead Hang", "Seated Leg Press", "Reverse Lunge", "Barbell Lunge", "Pause Squat", "Box Jump", "Stiff-Leg Deadlift", "Dumbbell Romanian Deadlift", "Glute-Ham Raise", "Hip Adduction", "Machine Glute Kickback", "Cable Pull-Through", "Leg Press Calf Raise", "Hack Squat Calf Raise", "Smith Machine Calf Raise", "Barbell Calf Raise", "Decline Crunch", "Machine Crunch", "Captain's Chair Leg Raise", "Hanging Knee Raise", "Machine Torso Rotation", "Cable Woodchopper", "Pallof Press", "Sit-Up", "Bicycle Crunch", "Dead Bug", "Hollow Hold", "Mountain Climber", "Hang Clean", "Clean and Jerk", "Snatch", "Burpee", "Turkish Get-Up", "Sled Push", "Battle Ropes", "Walking", "Hiking", "Swimming", "Air Bike", "Ski Erg", "Jumping Jack", "Basketball"]
  for (const n of NAMES) {
    try { app.delete(app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n })) } catch (_) {}
  }
  try {
    const w = app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Barbell Wrist Curl'")
    w.set("name", "Wrist Curl"); w.set("equipment", "dumbbell"); app.save(w)
  } catch (_) {}
})
