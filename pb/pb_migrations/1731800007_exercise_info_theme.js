/// <reference path="../pb_data/types.d.ts" />

// Exercise info (secondary muscles, how-to, how-to-log) for the body graph + info sheet, and per-user app theme.
migrate((app) => {
  const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "core", "full_body", "cardio"]
  const ex = app.findCollectionByNameOrId("exercises")
  ex.fields.add(new SelectField({ name: "secondary", values: MUSCLES, maxSelect: MUSCLES.length }))
  ex.fields.add(new TextField({ name: "instructions", max: 2000 }))
  ex.fields.add(new TextField({ name: "log_tip", max: 500 }))
  app.save(ex)

  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new JSONField({ name: "theme", maxSize: 2000 }))
  app.save(users)

  // name: [secondary muscles, "step|step|step"]
  const INFO = {
    "Barbell Bench Press": [["triceps", "shoulders"], "Lie on the bench with your eyes under the bar, feet planted and shoulder blades pinched together.|Lower the bar under control to your mid-chest, elbows about 45° from your body.|Press back up until your arms are straight, keeping your glutes on the bench."],
    "Incline Barbell Bench Press": [["shoulders", "triceps"], "Set the bench to roughly 30–45° and grip the bar just wider than shoulder width.|Lower the bar to your upper chest, just below the collarbone.|Press up and slightly back so the bar finishes over your shoulders."],
    "Decline Barbell Bench Press": [["triceps", "shoulders"], "Hook your legs securely and lie back on the decline bench.|Lower the bar to your lower chest.|Press straight up to lockout."],
    "Dumbbell Bench Press": [["triceps", "shoulders"], "Kick the dumbbells up and lie back with them over your chest.|Lower them to the sides of your chest with your elbows slightly tucked.|Press up and slightly together without clanging the weights."],
    "Incline Dumbbell Bench Press": [["shoulders", "triceps"], "Set the bench to 30–45° and start with the dumbbells over your upper chest.|Lower them to the sides of your upper chest.|Press back up until your arms are straight."],
    "Dumbbell Fly": [["shoulders"], "Lie flat holding dumbbells over your chest, palms facing each other.|With a soft bend in your elbows, open your arms in a wide arc until you feel a stretch across your chest.|Squeeze the weights back together over your chest."],
    "Cable Fly": [["shoulders"], "Set the pulleys around shoulder height and step forward into a staggered stance.|Keeping your elbows slightly bent, bring the handles together in front of your chest.|Return slowly until you feel a stretch."],
    "Machine Chest Press": [["triceps", "shoulders"], "Adjust the seat so the handles line up with your mid-chest.|Press the handles forward until your arms are nearly straight.|Return slowly without letting the stack touch down."],
    "Pec Deck": [["shoulders"], "Sit tall with your back against the pad.|Bring the arms together in front of you, squeezing your chest.|Open back up under control."],
    "Push-Up": [["triceps", "shoulders", "core"], "Start in a high plank with your hands just wider than your shoulders.|Lower your chest to just above the floor, keeping your body in one straight line.|Push back up to full arm extension."],
    "Dip": [["triceps", "shoulders"], "Support yourself on parallel bars with your arms straight.|Lean slightly forward and lower until your shoulders are just below your elbows.|Press back up to lockout."],
    "Barbell Deadlift": [["hamstrings", "glutes", "forearms", "core"], "Stand with the bar over your mid-foot and grip it just outside your legs.|Brace your core, flatten your back and pull the slack out of the bar.|Drive through the floor to stand tall, then lower the bar back down along your legs."],
    "Barbell Row": [["biceps", "shoulders", "forearms"], "Hinge forward to about 45° with a flat back, bar hanging at arm's length.|Pull the bar to your lower ribs, driving your elbows back.|Lower under control without standing up."],
    "Pendlay Row": [["biceps", "shoulders"], "Set up with your torso nearly parallel to the floor and the bar on the ground.|Row the bar explosively to your lower chest.|Return the bar to the floor every rep."],
    "Dumbbell Row": [["biceps", "shoulders"], "Place one knee and hand on a bench with your back flat.|Row the dumbbell toward your hip, keeping your elbow close.|Lower until your arm is straight."],
    "Seated Cable Row": [["biceps", "shoulders"], "Sit with your knees slightly bent and chest up.|Pull the handle to your stomach, squeezing your shoulder blades together.|Let your arms extend forward without rounding your back."],
    "Lat Pulldown": [["biceps", "shoulders"], "Grip the bar a little wider than your shoulders and lock your knees under the pad.|Pull the bar to your upper chest, leading with your elbows.|Let it rise slowly until your arms are straight."],
    "Pull-Up": [["biceps", "forearms", "core"], "Hang from the bar with an overhand grip slightly wider than your shoulders.|Pull until your chin clears the bar, keeping your body still.|Lower to a full hang."],
    "Chin-Up": [["biceps", "forearms"], "Hang with an underhand, shoulder-width grip.|Pull your chest toward the bar until your chin is over it.|Lower all the way down."],
    "Assisted Pull-Up": [["biceps"], "Set the counterweight and kneel or stand on the platform.|Pull until your chin is over the bar.|Lower slowly to a full hang."],
    "T-Bar Row": [["biceps", "shoulders"], "Straddle the bar, hinge forward with a flat back and grab the handle.|Row the weight toward your chest.|Lower until your arms are straight."],
    "Machine Row": [["biceps", "shoulders"], "Sit with your chest against the pad.|Pull the handles back, squeezing your shoulder blades together.|Return slowly."],
    "Rack Pull": [["glutes", "hamstrings", "forearms"], "Set the bar on the pins around knee height.|Brace and pull until you're standing tall.|Lower it back to the pins under control."],
    "Straight-Arm Pulldown": [["core"], "Face a high cable holding a bar with straight arms.|Sweep the bar down to your thighs using your lats.|Let it return to eye level slowly."],
    "Back Extension": [["glutes", "hamstrings"], "Set the pad just below your hips and cross your arms.|Lower your torso by hinging at the hips.|Raise back up until your body is in a straight line."],
    "Barbell Shrug": [["forearms"], "Hold the bar at arm's length in front of your thighs.|Shrug your shoulders straight up toward your ears.|Pause, then lower slowly."],
    "Dumbbell Shrug": [["forearms"], "Hold a dumbbell in each hand at your sides.|Shrug your shoulders straight up toward your ears.|Pause, then lower slowly."],
    "Barbell Overhead Press": [["triceps", "core"], "Start with the bar on your front shoulders and grip just outside shoulder width.|Brace and press the bar overhead, moving your head back slightly to clear it.|Lock out with the bar over your mid-foot, then lower it to your shoulders."],
    "Seated Dumbbell Shoulder Press": [["triceps"], "Sit upright with dumbbells at shoulder height, palms forward.|Press overhead until your arms are straight.|Lower back to shoulder height."],
    "Machine Shoulder Press": [["triceps"], "Adjust the seat so the handles start at shoulder height.|Press up until your arms are nearly straight.|Lower slowly."],
    "Arnold Press": [["triceps"], "Start with dumbbells at shoulder height, palms facing you.|Rotate your palms forward as you press overhead.|Reverse the rotation on the way down."],
    "Dumbbell Lateral Raise": [[], "Stand with dumbbells at your sides and a slight bend in your elbows.|Raise them out to the sides until they reach shoulder height.|Lower slowly."],
    "Cable Lateral Raise": [[], "Stand side-on to a low pulley and take the handle in your far hand.|Raise your arm out to the side to shoulder height.|Lower under control."],
    "Dumbbell Front Raise": [["chest"], "Hold dumbbells in front of your thighs.|Raise them straight in front of you to shoulder height.|Lower slowly."],
    "Reverse Pec Deck": [["back"], "Sit facing the pad with the handles at shoulder height.|Open your arms out and back, squeezing the backs of your shoulders.|Return slowly."],
    "Face Pull": [["back"], "Set a rope at upper-chest height or higher.|Pull the rope toward your face, splitting the ends and driving your elbows high.|Return under control."],
    "Upright Row": [["back", "biceps"], "Hold the bar in front of your thighs with a shoulder-width grip.|Pull it up along your body until your elbows reach shoulder height.|Lower slowly."],
    "Barbell Curl": [["forearms"], "Stand holding the bar with an underhand, shoulder-width grip.|Curl it up while keeping your elbows pinned to your sides.|Lower all the way down without swinging."],
    "EZ-Bar Curl": [["forearms"], "Grip the angled parts of the EZ bar.|Curl the bar up with your elbows still.|Lower slowly to full extension."],
    "Dumbbell Curl": [["forearms"], "Hold dumbbells at your sides, palms forward.|Curl them up, keeping your upper arms still.|Lower under control."],
    "Hammer Curl": [["forearms"], "Hold dumbbells with your palms facing each other.|Curl them up without rotating your wrists.|Lower slowly."],
    "Preacher Curl": [["forearms"], "Rest your upper arms on the preacher pad.|Curl the weight up until your forearms are vertical.|Lower until your arms are almost straight."],
    "Cable Curl": [["forearms"], "Face a low pulley holding a straight bar or rope.|Curl the handle up with your elbows at your sides.|Lower slowly."],
    "Incline Dumbbell Curl": [["forearms"], "Lie back on an incline bench with your arms hanging straight down.|Curl the dumbbells up without moving your upper arms.|Lower to a full stretch."],
    "Concentration Curl": [[], "Sit and brace your elbow against your inner thigh.|Curl the dumbbell toward your shoulder.|Lower until your arm is straight."],
    "Close-Grip Bench Press": [["chest", "shoulders"], "Lie on the bench and grip the bar about shoulder-width apart.|Lower it to your lower chest with your elbows close to your body.|Press back up to lockout."],
    "Skull Crusher": [[], "Lie on a bench holding the bar above your chest.|Bend your elbows to lower the bar toward your forehead.|Extend back up without moving your upper arms."],
    "Tricep Pushdown": [[], "Face a high pulley holding a bar or rope.|Push down until your arms are straight, elbows tucked.|Let it rise until your forearms are just above parallel."],
    "Overhead Tricep Extension": [[], "Hold a rope or dumbbell overhead.|Lower it behind your head by bending your elbows.|Extend back up, keeping your elbows pointed forward."],
    "Dumbbell Kickback": [[], "Hinge forward with your upper arm parallel to the floor.|Straighten your elbow until your arm points straight back.|Return slowly."],
    "Bench Dip": [["chest", "shoulders"], "Place your hands on a bench behind you with your legs out in front.|Lower your body by bending your elbows to about 90°.|Press back up."],
    "Wrist Curl": [[], "Rest your forearms on your thighs or a bench, palms up.|Curl the weight up using only your wrists.|Lower slowly."],
    "Farmer's Carry": [["back", "core", "shoulders"], "Pick up heavy dumbbells at your sides.|Walk with tall posture and short, controlled steps.|Set them down under control."],
    "Barbell Squat": [["glutes", "hamstrings", "core"], "Set the bar on your upper back and stand with your feet about shoulder width.|Brace and sit down and back until your hips are at or below knee height.|Drive up through your whole foot to standing."],
    "Front Squat": [["glutes", "core"], "Rest the bar on the front of your shoulders with your elbows high.|Squat down keeping your torso upright.|Stand back up, keeping your elbows high."],
    "Leg Press": [["glutes", "hamstrings"], "Sit with your feet shoulder-width apart on the platform.|Lower the sled until your knees reach about 90°.|Press back up without slamming your knees straight."],
    "Hack Squat": [["glutes"], "Stand on the platform with your back against the pad.|Lower until your thighs are about parallel.|Drive back up."],
    "Smith Machine Squat": [["glutes", "hamstrings"], "Set the bar on your upper back and step your feet slightly forward.|Squat down until your thighs are about parallel.|Drive back up."],
    "Bulgarian Split Squat": [["glutes", "hamstrings"], "Stand in a split stance with your back foot on a bench.|Lower your back knee toward the floor.|Push through your front foot to stand."],
    "Goblet Squat": [["glutes", "core"], "Hold a dumbbell or kettlebell against your chest.|Squat down between your knees with your chest up.|Stand back up."],
    "Leg Extension": [[], "Sit with the pad resting on your lower shins.|Straighten your legs fully.|Lower slowly."],
    "Walking Lunge": [["glutes", "hamstrings"], "Hold dumbbells at your sides.|Step forward and lower until both knees are bent about 90°.|Drive up and step through into the next lunge."],
    "Step-Up": [["glutes"], "Place one foot on a sturdy box or bench.|Drive through that foot to step up.|Lower back down under control."],
    "Romanian Deadlift": [["glutes", "back"], "Hold the bar at hip height with soft knees.|Push your hips back and slide the bar down your thighs until you feel a hamstring stretch.|Drive your hips forward to stand tall."],
    "Lying Leg Curl": [[], "Lie face down with the pad just above your heels.|Curl your heels toward your glutes.|Lower slowly."],
    "Seated Leg Curl": [[], "Sit with the pad behind your lower legs and the thigh pad locked in.|Curl your legs down and back.|Return slowly."],
    "Good Morning": [["glutes", "back"], "Place the bar on your upper back with soft knees.|Hinge forward at the hips with a flat back.|Return to standing."],
    "Nordic Curl": [[], "Kneel with your ankles anchored.|Lower your body forward as slowly as you can.|Catch yourself with your hands, then pull back up."],
    "Hip Thrust": [["hamstrings"], "Sit with your upper back on a bench and the bar over your hips.|Drive your hips up until your body is flat from shoulders to knees.|Lower your hips under control."],
    "Glute Bridge": [["hamstrings"], "Lie on your back with knees bent and feet flat.|Push through your heels to raise your hips.|Squeeze at the top, then lower."],
    "Cable Kickback": [["hamstrings"], "Attach an ankle strap to a low pulley.|Kick your leg straight back, squeezing your glute.|Return slowly."],
    "Sumo Deadlift": [["quads", "hamstrings", "back"], "Take a wide stance with your toes pointed out and grip inside your knees.|Push your knees out, brace and stand up with the bar.|Lower it back down."],
    "Hip Abduction": [[], "Sit in the machine with the pads on the outside of your knees.|Push your legs apart.|Return slowly."],
    "Standing Calf Raise": [[], "Stand with the balls of your feet on the edge of the platform.|Rise up onto your toes as high as you can.|Lower your heels below the platform."],
    "Seated Calf Raise": [[], "Sit with the pad on your thighs and the balls of your feet on the platform.|Push up onto your toes.|Lower your heels for a full stretch."],
    "Plank": [["shoulders"], "Rest on your forearms and toes with your body in a straight line.|Brace your abs and squeeze your glutes.|Hold without letting your hips sag."],
    "Side Plank": [["shoulders"], "Lie on your side and prop yourself up on one forearm.|Lift your hips so your body forms a straight line.|Hold, then switch sides."],
    "Hanging Leg Raise": [["forearms"], "Hang from a bar with straight arms.|Raise your legs until they're at least parallel to the floor.|Lower slowly without swinging."],
    "Cable Crunch": [[], "Kneel facing a high pulley, holding a rope beside your head.|Crunch down, bringing your elbows toward your knees.|Return slowly."],
    "Crunch": [[], "Lie on your back with your knees bent.|Curl your shoulders off the floor toward your hips.|Lower back down."],
    "Ab Wheel Rollout": [["shoulders", "back"], "Kneel holding the wheel under your shoulders.|Roll forward as far as you can while keeping your back flat.|Pull back to the start using your abs."],
    "Russian Twist": [[], "Sit with your knees bent and lean back slightly.|Rotate your torso from side to side.|Keep your chest up throughout."],
    "Kettlebell Swing": [["glutes", "hamstrings", "back", "shoulders"], "Hike the kettlebell back between your legs.|Snap your hips forward to swing it to chest height.|Let it fall back between your legs and repeat."],
    "Power Clean": [["quads", "glutes", "back", "shoulders"], "Start like a deadlift with the bar over your mid-foot.|Pull, then explosively extend your hips and shrug the bar up.|Drop under it and catch it on your front shoulders."],
    "Thruster": [["quads", "shoulders", "triceps", "glutes"], "Hold the bar on your front shoulders.|Front squat down, then drive up hard.|Use that momentum to press the bar overhead."],
    "Running": [["quads", "hamstrings", "calves"], "Run at your chosen pace.|Keep your upper body relaxed and your steps quick and light."],
    "Treadmill": [["quads", "hamstrings", "calves"], "Set your speed and incline.|Walk or run with an upright posture without holding the rails."],
    "Cycling": [["quads", "hamstrings", "calves"], "Set the seat so your knee is slightly bent at the bottom of each pedal stroke.|Pedal at a steady cadence."],
    "Rowing Machine": [["back", "quads", "biceps"], "Push with your legs first, then lean back and pull the handle to your ribs.|Reverse that order on the way forward."],
    "Stair Climber": [["quads", "glutes", "calves"], "Stand tall and step through your whole foot.|Use the rails for balance only."],
    "Elliptical": [["quads", "glutes"], "Stand tall and push through your heels.|Use the handles to bring your arms in."],
    "Jump Rope": [["calves", "shoulders"], "Turn the rope with your wrists, elbows close to your sides.|Jump just high enough to clear the rope, landing softly on the balls of your feet."],
  }
  const TIP = {
    weight: "Log the weight and reps for each set.",
    bodyweight: "Log reps. Only enter a weight if you add extra load like a vest or belt.",
    assisted: "Log the assistance weight and reps. Less assistance over time means progress.",
    duration: "Log how many seconds you held it.",
    cardio: "Log distance and time.",
  }
  for (const name of Object.keys(INFO)) {
    let r
    try { r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: name }) } catch (_) { continue }
    const [sec, steps] = INFO[name]
    r.set("secondary", sec)
    r.set("instructions", steps.split("|").join("\n"))
    let tip = TIP[r.getString("kind")] || TIP.weight
    if (r.getString("equipment") === "dumbbell" && r.getString("kind") === "weight") tip = "Log the weight of one dumbbell and your reps for each set."
    r.set("log_tip", tip)
    app.save(r)
  }
}, (app) => {
  const ex = app.findCollectionByNameOrId("exercises")
  for (const f of ["secondary", "instructions", "log_tip"]) ex.fields.removeByName(f)
  app.save(ex)
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("theme")
  app.save(users)
})
