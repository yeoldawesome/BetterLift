/// <reference path="../pb_data/types.d.ts" />

// "Pec Deck" reads better as "Machine Chest Fly" (like other machine lifts); "Pec Deck" stays as an alternative name in the app.
migrate((app) => {
  const rename = (from, to) => {
    try {
      const r = app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: from })
      try { app.findFirstRecordByFilter("exercises", "owner = '' && name = {:n}", { n: to }); return } catch (_) {} // target name already taken
      r.set("name", to)
      app.save(r)
    } catch (_) {}
  }
  rename("Pec Deck", "Machine Chest Fly")
}, (app) => {
  try {
    const r = app.findFirstRecordByFilter("exercises", "owner = '' && name = 'Machine Chest Fly'")
    r.set("name", "Pec Deck")
    app.save(r)
  } catch (_) {}
})
