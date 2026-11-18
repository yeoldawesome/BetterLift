/// <reference path="../pb_data/types.d.ts" />

// Each workout remembers the lifter's accent color at the time, so its body graph keeps that color in everyone's feed
// even after the lifter changes theme. Existing workouts take their owner's current accent.
migrate((app) => {
  const w = app.findCollectionByNameOrId("workouts")
  w.fields.add(new TextField({ name: "accent", max: 7, pattern: "^(#[0-9a-fA-F]{6})?$" }))
  app.save(w)

  const users = app.findAllRecords("users")
  for (const u of users) {
    let accent = "#a3e635"
    try {
      const t = JSON.parse(u.getString("theme") || "{}")
      if (/^#[0-9a-fA-F]{6}$/.test(t.accent || "")) accent = t.accent
    } catch (_) {}
    app.db().newQuery("UPDATE workouts SET accent = {:a} WHERE user = {:u} AND accent = ''").bind({ a: accent, u: u.id }).execute()
  }
}, (app) => {
  const w = app.findCollectionByNameOrId("workouts")
  w.fields.removeByName("accent")
  app.save(w)
})
