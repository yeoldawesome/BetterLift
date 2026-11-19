/// <reference path="../pb_data/types.d.ts" />

// Nutrition becomes opt-in: new accounts start with it off (nutrition_on = false) and see a "New" hint in Settings
// until they tap the Nutrition switch (nutrition_seen). Replaces the opt-out nutrition_off flag.
// Existing accounts that already used nutrition (food logged or goals set) keep it on with no hint.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "nutrition_on" }))
  users.fields.add(new BoolField({ name: "nutrition_seen" }))
  app.save(users)

  for (const u of app.findAllRecords("users")) {
    const used = app.findRecordsByFilter("food_logs", "user = {:u}", "", 1, 0, { u: u.id }).length > 0
      || app.findRecordsByFilter("nutrition_profiles", "user = {:u}", "", 1, 0, { u: u.id }).length > 0
    if (used && !u.getBool("nutrition_off")) {
      u.set("nutrition_on", true)
      u.set("nutrition_seen", true)
      app.saveNoValidate(u)
    }
  }

  users.fields.removeByName("nutrition_off")
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "nutrition_off" }))
  app.save(users)
  for (const u of app.findAllRecords("users")) {
    u.set("nutrition_off", !u.getBool("nutrition_on"))
    app.saveNoValidate(u)
  }
  users.fields.removeByName("nutrition_on")
  users.fields.removeByName("nutrition_seen")
  app.save(users)
})
