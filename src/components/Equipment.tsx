import type { ReactNode } from 'react'
import type { Exercise } from '../lib/pb'

/**
 * "Equipment used" for an exercise: what you'll walk up to in the gym, each with a small drawing.
 * Worked out from the exercise name + equipment type, so it covers official and custom lifts alike.
 */

type Kit =
  | 'barbell' | 'ezbar' | 'trapbar' | 'plates' | 'dumbbell' | 'kettlebell' | 'bench' | 'incline' | 'decline' | 'rack' | 'smith'
  | 'preacher' | 'cable' | 'rope' | 'vbar' | 'latbar' | 'handle' | 'strap' | 'pecdeck' | 'legpress' | 'hacksquat' | 'legext'
  | 'legcurl' | 'calf' | 'hipmachine' | 'machine' | 'pullupbar' | 'dipbars' | 'captain' | 'roman' | 'mat' | 'box' | 'band'
  | 'gripper' | 'treadmill' | 'bike' | 'rower' | 'stairs' | 'elliptical' | 'rope_jump' | 'battle' | 'sled' | 'landmine' | 'ball'

const LABEL: Record<Kit, string> = {
  barbell: 'Barbell', ezbar: 'EZ curl bar', trapbar: 'Trap / hex bar', plates: 'Weight plates', dumbbell: 'Dumbbells', kettlebell: 'Kettlebell',
  bench: 'Flat bench', incline: 'Incline bench', decline: 'Decline bench', rack: 'Squat rack', smith: 'Smith machine', preacher: 'Preacher bench',
  cable: 'Cable machine', rope: 'Rope attachment', vbar: 'V-bar handle', latbar: 'Lat bar', handle: 'Single handle', strap: 'Ankle strap',
  pecdeck: 'Pec deck / fly machine', legpress: 'Leg press', hacksquat: 'Hack squat machine', legext: 'Leg extension machine', legcurl: 'Leg curl machine',
  calf: 'Calf raise machine', hipmachine: 'Hip abductor / adductor', machine: 'Machine', pullupbar: 'Pull-up bar', dipbars: 'Dip bars',
  captain: "Captain's chair", roman: 'Back extension bench', mat: 'Mat', box: 'Plyo box', band: 'Resistance band', gripper: 'Hand gripper',
  treadmill: 'Treadmill', bike: 'Bike', rower: 'Rowing machine', stairs: 'Stair climber', elliptical: 'Elliptical', rope_jump: 'Jump rope',
  battle: 'Battle ropes', sled: 'Sled', landmine: 'Landmine', ball: 'Ball / court',
}

const has = (n: string, re: RegExp) => re.test(n)

/** The pieces of equipment an exercise uses, most important first, with a label specific to the lift. */
export function equipmentFor(ex: Pick<Exercise, 'name' | 'equipment' | 'kind'>): { kit: Kit; label: string }[] {
  const n = ex.name.toLowerCase(), eq = ex.equipment
  const out: { kit: Kit; label: string }[] = []
  const add = (kit: Kit, label = LABEL[kit]) => { if (!out.some((o) => o.kit === kit)) out.push({ kit, label }) }

  // Cardio + sport first: one obvious machine.
  if (has(n, /treadmill|running|^run\b|jog|^walking$|^walk$|hiking/)) add(has(n, /hik/) ? 'mat' : 'treadmill', has(n, /hik/) ? 'Trail / outdoors' : has(n, /treadmill/) ? 'Treadmill' : 'Treadmill or outdoors')
  if (has(n, /^cycling|\bbike\b/)) add('bike', has(n, /air/) ? 'Air bike' : 'Bike')
  if (has(n, /rowing machine|ski erg/)) add('rower', has(n, /ski/) ? 'Ski erg' : 'Rowing machine')
  if (has(n, /stair/)) add('stairs')
  if (has(n, /elliptical/)) add('elliptical')
  if (has(n, /jump rope/)) add('rope_jump')
  if (has(n, /battle rope/)) add('battle')
  if (has(n, /sled/)) add('sled')
  if (has(n, /basketball|swim/)) add('ball', has(n, /swim/) ? 'Pool' : 'Court + ball')
  if (out.length) return out

  // Specific machines.
  if (has(n, /smith/)) add('smith')
  if (has(n, /pec deck|chest fly|machine fly/) && eq === 'machine') add('pecdeck', has(n, /reverse/) ? 'Pec deck (facing the pad)' : 'Pec deck / fly machine')
  if (has(n, /leg press/)) add('legpress', has(n, /seated|horizontal/) ? 'Seated leg press' : 'Leg press (sled)')
  if (has(n, /hack squat/)) add('hacksquat')
  if (has(n, /leg extension/)) add('legext')
  if (has(n, /leg curl/)) add('legcurl', has(n, /lying/) ? 'Lying leg curl machine' : 'Seated leg curl machine')
  if (has(n, /calf/) && eq === 'machine' && !has(n, /leg press|hack|smith/)) add('calf', has(n, /seated/) ? 'Seated calf raise machine' : 'Calf raise machine')
  if (has(n, /abduct|adduct/)) add('hipmachine', has(n, /abduct/) ? 'Hip abductor machine' : 'Hip adductor machine')
  if (has(n, /preacher/)) add('preacher', eq === 'machine' ? 'Preacher curl machine' : 'Preacher bench')
  if (has(n, /captain/)) add('captain')
  if (has(n, /back extension|hyperextension/)) add('roman', eq === 'machine' ? 'Back extension machine' : 'Back extension bench')
  if (has(n, /glute-ham/)) add('roman', 'GHD (glute-ham bench)')
  if (has(n, /landmine/)) add('landmine')

  // Free weights.
  if (has(n, /trap bar/)) add('trapbar')
  else if (has(n, /\bez\b|ez-bar/)) add('ezbar')
  else if (eq === 'barbell' && !has(n, /smith/)) add('barbell')
  if (eq === 'dumbbell' || has(n, /dumbbell/)) add('dumbbell')
  if (eq === 'kettlebell' || has(n, /kettlebell/)) add('kettlebell')
  if (['barbell', 'ezbar', 'trapbar', 'smith', 'landmine', 'legpress', 'hacksquat'].some((k) => out.some((o) => o.kit === k)) || has(n, /iso-lateral|t-bar|plate/)) add('plates')

  // Racks and benches.
  if (eq === 'barbell' && has(n, /squat|overhead press|shoulder press|push press|lunge|good morning|rack pull|shrug|bench press|close-grip|jm press/) && !has(n, /smith|hack/)) add('rack', has(n, /bench press|close-grip|jm press/) ? 'Bench press rack' : 'Squat rack')
  const benchy = has(n, /bench press|(?<!reverse )fly|skull|lying|pullover|seal row|jm press|floor press|dumbbell row|tricep extension|spider|concentration|seated.*press|arnold|side-lying|chest-supported|split squat|hip thrust|bench dip|seated dumbbell|incline push|decline push/)
  if (benchy && !out.some((o) => ['pecdeck', 'preacher'].includes(o.kit)) && eq !== 'cable' && eq !== 'machine' || has(n, /smith machine (incline )?bench/)) {
    if (has(n, /incline|spider|chest-supported|side-lying/)) add('incline')
    else if (has(n, /decline/)) add('decline')
    else if (!has(n, /floor press|wrist curl|kickback|standing/)) add('bench')
  }

  // Cables and their attachments.
  if (eq === 'cable' || has(n, /cable|pulldown|pushdown|face pull|crossover/)) {
    add('cable')
    if (has(n, /single-arm|one arm|bayesian/)) add('handle', 'D-handle')
    else if (has(n, /rope|face pull|overhead tricep|hammer curl|crunch|pull-through/)) add('rope')
    else if (has(n, /close-grip|seated cable row|^seated cable/)) add('vbar')
    else if (has(n, /pulldown|pushdown|straight-arm|upright row|curl|shrug|wrist|wide-grip/)) add('latbar', has(n, /pulldown|straight-arm|wide-grip/) ? 'Lat bar' : 'Straight bar')
    else if (has(n, /kickback/) && has(n, /glute|cable kickback/)) add('strap')
    else add('handle', has(n, /single-arm|one arm|lateral|fly|reverse fly|front raise|bayesian|woodchop|pallof|kickback/) ? 'D-handle' : 'Handle')
  }

  // Bodyweight gear.
  if (has(n, /pull-up|chin-up|hanging|dead hang|scapular|muscle-up/) && !has(n, /assisted/)) add('pullupbar')
  if (has(n, /assisted pull-up/)) add('machine', 'Assisted pull-up machine')
  if (n === 'dip' || has(n, /parallel bar/)) add('dipbars')
  if (has(n, /inverted row/)) add('rack', 'Low bar (rack or Smith)')
  if (has(n, /box jump|step-up/)) add('box', has(n, /step/) ? 'Box or bench' : 'Plyo box')
  if (has(n, /plank|crunch|sit-up|dead bug|hollow|russian twist|bicycle|mountain|push-up|glute bridge|nordic|burpee|ab wheel/) && eq !== 'machine' && eq !== 'cable') add('mat')
  if (has(n, /ab wheel/)) add('mat', 'Ab wheel + mat')
  if (eq === 'band') add('band')
  if (has(n, /gripper/)) add('gripper')

  // Any other machine: name it after the lift ("Machine Shoulder Press" → "Shoulder press machine").
  if (eq === 'machine' && !out.some((o) => !['plates'].includes(o.kit))) {
    const base = ex.name.replace(/\b(machine|iso-lateral)\b/gi, '').replace(/\s+/g, ' ').trim()
    add('machine', `${has(n, /iso-lateral/) ? 'Iso-lateral (plate-loaded) ' : ''}${base.charAt(0).toUpperCase()}${base.slice(1).toLowerCase()} machine`)
  }
  if (!out.length && eq === 'bodyweight') add('mat', 'No equipment')
  return out
}

// ---- drawings: simple line art on a 48×48 grid, colored by the theme accent.
const I: Record<Kit, ReactNode> = {
  barbell: <><path d="M4 24h40" /><rect x="9" y="15" width="4" height="18" rx="1" /><rect x="35" y="15" width="4" height="18" rx="1" /><rect x="6" y="18" width="3" height="12" rx="1" /><rect x="39" y="18" width="3" height="12" rx="1" /></>,
  ezbar: <><path d="M4 24h9l4-4 4 8 4-8 4 8 4-4h12" /><rect x="7" y="16" width="4" height="16" rx="1" /><rect x="37" y="16" width="4" height="16" rx="1" /></>,
  trapbar: <><path d="M14 16h20l6 8-6 8H14l-6-8z" /><path d="M20 20v8M28 20v8" /><path d="M2 24h6M40 24h6" /><rect x="2" y="18" width="3" height="12" rx="1" /><rect x="43" y="18" width="3" height="12" rx="1" /></>,
  plates: <><circle cx="20" cy="24" r="14" /><circle cx="20" cy="24" r="3" /><circle cx="34" cy="24" r="10" /><circle cx="34" cy="24" r="2" /></>,
  dumbbell: <><path d="M14 24h20" /><rect x="7" y="16" width="7" height="16" rx="2" /><rect x="34" y="16" width="7" height="16" rx="2" /><rect x="4" y="19" width="3" height="10" rx="1" /><rect x="41" y="19" width="3" height="10" rx="1" /></>,
  kettlebell: <><path d="M17 18a7 7 0 0 1 14 0" /><path d="M14 22h20a8 8 0 0 1-2 16H16a8 8 0 0 1-2-16z" /></>,
  bench: <><rect x="6" y="20" width="36" height="6" rx="2" /><path d="M12 26v12M36 26v12M8 38h8M32 38h8" /></>,
  incline: <><path d="M10 34l20-22" strokeWidth={6} /><rect x="26" y="30" width="14" height="5" rx="2" /><path d="M14 34v6M36 35v5M8 40h34" /></>,
  decline: <><path d="M8 18l30 14" strokeWidth={6} /><path d="M14 22v18M34 31v9M8 40h34" /><path d="M6 12l4 6" /></>,
  rack: <><path d="M10 6v36M38 6v36M6 42h10M32 42h10" /><path d="M10 16h5M38 16h-5M10 26h5M38 26h-5" /><path d="M6 13h36" /></>,
  smith: <><path d="M10 4v40M38 4v40M6 44h36" /><path d="M6 20h36" /><rect x="3" y="15" width="3" height="10" rx="1" /><rect x="42" y="15" width="3" height="10" rx="1" /><path d="M10 26h3M38 26h-3" /></>,
  preacher: <><path d="M14 40V24M8 40h18" /><path d="M10 24h14l8-10" strokeWidth={5} /><rect x="30" y="30" width="12" height="4" rx="2" /><path d="M36 34v6" /></>,
  cable: <><rect x="6" y="6" width="12" height="36" rx="2" /><path d="M9 14h6M9 18h6M9 22h6M9 26h6M9 30h6" /><path d="M18 8h20v4" /><circle cx="38" cy="14" r="2" /><path d="M38 16v18" strokeDasharray="2 3" /><path d="M34 36h8" /></>,
  rope: <><path d="M24 6v10" /><circle cx="24" cy="18" r="2.5" /><path d="M22 20c-4 6-6 12-6 20M26 20c4 6 6 12 6 20" /><circle cx="16" cy="41" r="2.5" /><circle cx="32" cy="41" r="2.5" /></>,
  vbar: <><path d="M24 8v8" /><path d="M24 16l-10 18M24 16l10 18" /><path d="M10 34h8M30 34h8" strokeWidth={4} /></>,
  latbar: <><path d="M24 6v12" /><path d="M4 22c6-4 14-4 20-4s14 0 20 4" /><path d="M4 22v4M44 22v4" strokeWidth={4} /></>,
  handle: <><path d="M24 6v10" /><path d="M16 18h16l-3 16H19z" /><path d="M18 34h12" strokeWidth={4} /></>,
  strap: <><path d="M24 6v12" /><rect x="14" y="20" width="20" height="10" rx="5" /><path d="M14 25h20" strokeDasharray="2 2" /></>,
  pecdeck: <><rect x="20" y="10" width="8" height="22" rx="2" /><path d="M16 36h16M24 32v8" /><path d="M20 14c-8 0-12 4-14 10M28 14c8 0 12 4 14 10" /><rect x="3" y="22" width="5" height="10" rx="2" /><rect x="40" y="22" width="5" height="10" rx="2" /></>,
  legpress: <><path d="M6 40h36" /><path d="M10 40l8-14h8" strokeWidth={5} /><path d="M24 30l12-14" /><rect x="32" y="8" width="10" height="12" rx="2" transform="rotate(40 37 14)" /></>,
  hacksquat: <><path d="M8 42h32" /><path d="M14 42l20-34" /><path d="M20 40l14-24" strokeWidth={5} /><path d="M30 14h8" strokeWidth={3} /></>,
  legext: <><path d="M8 40V22h14v8h-8" strokeWidth={4} /><path d="M22 30l14 6" strokeWidth={3} /><circle cx="38" cy="37" r="3" /><path d="M8 42h20" /></>,
  legcurl: <><rect x="4" y="22" width="26" height="6" rx="2" /><path d="M30 25l10-10" strokeWidth={3} /><circle cx="41" cy="14" r="3" /><path d="M10 28v12M24 28v12M6 40h24" /></>,
  calf: <><path d="M10 6v34M6 40h32" /><path d="M10 12h18" strokeWidth={5} /><rect x="22" y="34" width="12" height="4" rx="1" /><path d="M24 34V16" strokeDasharray="2 3" /></>,
  hipmachine: <><rect x="16" y="10" width="16" height="6" rx="2" /><rect x="16" y="18" width="16" height="10" rx="2" /><path d="M14 28l-6 12M34 28l6 12" strokeWidth={4} /><path d="M24 28v12M18 42h12" /></>,
  machine: <><rect x="6" y="6" width="12" height="36" rx="2" /><path d="M9 14h6M9 18h6M9 22h6M9 26h6" /><path d="M18 10h12v18" /><rect x="24" y="30" width="16" height="5" rx="2" /><path d="M32 35v7M26 42h12" /><path d="M30 28h10" strokeWidth={3} /></>,
  pullupbar: <><path d="M4 10h40" strokeWidth={4} /><path d="M8 10v32M40 10v32" /><path d="M20 10v6M28 10v6" /></>,
  dipbars: <><path d="M6 18h14M28 18h14" strokeWidth={4} /><path d="M10 18v24M18 18v24M30 18v24M38 18v24" /></>,
  captain: <><path d="M12 6v36M36 6v36M8 42h32" /><path d="M12 16h10M36 16H26" strokeWidth={4} /><rect x="18" y="8" width="12" height="20" rx="2" /></>,
  roman: <><path d="M8 40l14-18" /><rect x="18" y="14" width="14" height="6" rx="2" transform="rotate(-50 25 17)" /><path d="M6 40h34M30 40l6-10h6" /></>,
  mat: <><rect x="4" y="28" width="40" height="8" rx="3" /><path d="M8 28c0-4 2-6 4-6h4" /></>,
  box: <><path d="M10 18l14-8 14 8v20l-14 8-14-8z" /><path d="M10 18l14 8 14-8M24 26v20" /></>,
  band: <><path d="M10 34c0-16 6-24 14-24s14 8 14 24" strokeWidth={4} /><path d="M6 34h8M34 34h8" /></>,
  gripper: <><path d="M18 8c-6 10-6 22-2 32M30 8c6 10 6 22 2 32" strokeWidth={4} /><path d="M18 8h12" /><circle cx="24" cy="8" r="3" /></>,
  treadmill: <><path d="M4 38l30-4h8" strokeWidth={4} /><path d="M36 34V12h6" /><rect x="34" y="8" width="10" height="5" rx="1" /><circle cx="8" cy="40" r="2" /><circle cx="32" cy="37" r="2" /></>,
  bike: <><circle cx="12" cy="32" r="8" /><circle cx="36" cy="32" r="8" /><path d="M12 32l8-14h12l4 14M20 18l-2-6h-4M30 18l2-6h4" /></>,
  rower: <><path d="M4 38h40" /><rect x="6" y="30" width="10" height="8" rx="2" /><circle cx="36" cy="30" r="7" /><path d="M16 34h14" /><path d="M14 30l8-6" strokeWidth={3} /></>,
  stairs: <><path d="M6 40h8v-8h8v-8h8v-8h8V8" strokeWidth={3} /><path d="M40 8v32" /></>,
  elliptical: <><ellipse cx="22" cy="34" rx="16" ry="6" /><path d="M34 30l6-22M30 10h14" /><path d="M14 34h16" strokeWidth={4} /></>,
  rope_jump: <><path d="M14 12v8M34 12v8" strokeWidth={4} /><path d="M14 20c0 20 20 20 20 0" /></>,
  battle: <><path d="M4 24c6-8 10 8 16 0s10 8 16 0 8 6 8 6" /><path d="M4 32c6-8 10 8 16 0s10 8 16 0 8 6 8 6" /></>,
  sled: <><path d="M6 38h32l6-6" strokeWidth={3} /><rect x="12" y="24" width="20" height="14" rx="2" /><path d="M16 24V10M28 24V10" /></>,
  landmine: <><path d="M6 40h12" /><circle cx="12" cy="38" r="3" /><path d="M12 38l26-26" strokeWidth={3} /><rect x="34" y="6" width="6" height="10" rx="1" transform="rotate(45 37 11)" /></>,
  ball: <><circle cx="24" cy="24" r="16" /><path d="M8 24h32M24 8v32M12 12c8 6 8 18 0 24M36 12c-8 6-8 18 0 24" /></>,
}

function Drawing({ kit }: { kit: Kit }) {
  return (
    <svg viewBox="0 0 48 48" width={40} height={40} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {I[kit]}
    </svg>
  )
}

/** Grid of equipment cards for the exercise info sheet. */
export function EquipmentUsed({ ex }: { ex: Pick<Exercise, 'name' | 'equipment' | 'kind'> }) {
  const list = equipmentFor(ex)
  if (!list.length) return null
  return (
    <div className="grid grid-cols-3 gap-2">
      {list.map(({ kit, label }) => (
        <div key={kit} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 px-2 py-3 text-center">
          <span className="grid size-14 place-items-center rounded-xl bg-accent/15 text-accent"><Drawing kit={kit} /></span>
          <span className="text-xs font-semibold leading-tight">{label}</span>
        </div>
      ))}
    </div>
  )
}
