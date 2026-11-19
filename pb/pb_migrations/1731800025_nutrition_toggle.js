/// <reference path="../pb_data/types.d.ts" />

// Settings → Nutrition on/off. Off hides the Nutrition tab and every calorie estimate (cardio keeps effort + heart rate).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "nutrition_off" }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("nutrition_off")
  app.save(users)
})
