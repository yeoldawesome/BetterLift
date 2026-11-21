import type { SetType } from './setTypes'
import PocketBase, { type RecordModel } from 'pocketbase'
import { useEffect, useState } from 'react'

const url = import.meta.env.VITE_API_URL || `${location.protocol}//${location.hostname}:8090`
export const pb = new PocketBase(url)
pb.autoCancellation(false)

export type Unit = 'kg' | 'lb'
export type Kind = 'weight' | 'bodyweight' | 'assisted' | 'duration' | 'cardio'
export type Lift = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row'
export type Emoji = 'fire' | 'muscle' | 'clap' | 'rocket' | 'trophy' | 'custom'

export type Visibility = 'public' | 'private'
/** all = exercises, sets, reps, weights, notes · weights = only the planned weights · none = keep the routine. */
export type RoutineUpdate = 'all' | 'weights' | 'none'
export const routineUpdate = (u?: Partial<Pick<User, 'routine_update' | 'update_routine'>> | null): RoutineUpdate =>
  u?.routine_update || (u?.update_routine ? 'all' : 'none')
export interface User extends RecordModel {
  username: string; name: string; avatar: string; email?: string; verified?: boolean; bodyweight_kg: number; sex: '' | 'male' | 'female'; unit: '' | Unit; is_moderator: boolean
  default_rest_s: number; post_visibility: '' | Visibility; update_routine: boolean
  /** What finishing a routine workout saves back to it (empty = from update_routine). */
  routine_update?: '' | RoutineUpdate; save_as_routine: boolean; height_cm: number
  theme: { base?: string; accent?: string } | null
  hide_stats: boolean
  /** Friends can see my Physique (body readings) / Insights tabs. Off by default. */
  share_physique: boolean
  share_insights: boolean
  /** Bottom bar layout (tab ids, Profile excluded). Empty = default. */
  tab_bar: string[] | null
  /** Settings → Nutrition tracking (opt-in; off = no Nutrition tab, no calorie estimates). */
  nutrition_on: boolean
  /** Has tapped the Nutrition switch in Settings (clears the "New" dots). */
  nutrition_seen: boolean
  default_rest_after_s: number
  /** Kinds of push notification turned off in Settings (see PUSH_KINDS). */
  push_off: string[] | null
  /** Has seen the "turn on notifications" popup. */
  push_asked: boolean
  /** Weekly plan: { cycle: routine ids and 'rest' }, repeating. */
  plan: { cycle: string[] } | null
}
export type ReviewStatus = '' | 'pending' | 'approved' | 'rejected'
export interface Exercise extends RecordModel {
  name: string; muscle: string; equipment: string; kind: Kind; is_main_lift: boolean; main_lift: '' | Lift; owner: string
  review_status: ReviewStatus; review_note: string; submitted_by: string
  secondary: string[]; instructions: string; log_tip: string
  /** Muscles worked as hard as the primary one (incline bench: chest + front delts); counted as full sets. */
  co_primary?: string[]
  /** The official muscles, kept client-side when a personal edit replaces them. */
  official?: Pick<Exercise, 'muscle' | 'co_primary' | 'secondary'>
  /** Set client-side when the user has a personal edit of this exercise. */
  override?: string
  /** Per-lift rest defaults from the user's override: 0/undefined = use account default, -1 = off. */
  rest_s?: number
  rest_after_s?: number
  expand?: { owner?: User }
}
export interface Routine extends RecordModel { user: string; name: string; notes: string; position: number }
/** One planned set on a routine: weight (kg), reps, time (s), distance (km) and set type (warm-up, failure…). */
export type PlanSet = { w: number; r: number; sec?: number; dist?: number; type?: string }
export interface RoutineExercise extends RecordModel {
  routine: string; user: string; exercise: string; position: number; target_sets: number; reps: number; rest_s: number
  /** Planned weight (kg) and reps per set. */
  sets?: PlanSet[] | null
  note?: string
  expand?: { exercise?: Exercise }
}
export interface Workout extends RecordModel {
  user: string; routine: string; name: string; notes: string; started_at: string; ended_at: string
  duration_s: number; volume_kg: number; pr_count: number; source_id: string; visibility: '' | Visibility; bodyweight_kg: number
  /** Lifter's accent color when they logged it; the workout's body graph keeps this color. */
  accent: string
  expand?: { user?: User }
}
export interface WSet extends RecordModel {
  workout: string; user: string; exercise: string; performed_at: string; position: number; set_index: number
  weight_kg: number; reps: number; seconds: number; distance_km: number; completed: boolean; e1rm_kg: number; is_pr: boolean
  set_type?: '' | SetType; note?: string; superset?: number
  /** Cardio effort: average heart rate, RPE 1–10, active kcal from a watch (0 = not given). */
  avg_hr?: number; rpe?: number; kcal?: number
  expand?: { exercise?: Exercise; workout?: Workout }
}
export interface Friendship extends RecordModel { requester: string; addressee: string; status: 'pending' | 'accepted'; expand?: { requester?: User; addressee?: User } }
export interface Comment extends RecordModel { workout: string; user: string; body: string; parent: string; expand?: { user?: User } }
export interface CustomReaction extends RecordModel { owner: string; name: string; image: string }
export interface Reaction extends RecordModel { workout: string; user: string; emoji: Emoji; custom: string; expand?: { custom?: CustomReaction } }
export interface Override extends RecordModel { user: string; exercise: string; name: string; muscle: string; co_primary: string[]; secondary: string[]; equipment: string; instructions: string; log_tip: string; rest_s: number; rest_after_s: number }
export type FeedbackType = 'general' | 'exercise_request' | 'edit_request'
export interface Feedback extends RecordModel {
  user: string; type: FeedbackType; exercise: string; message: string; proposal: Record<string, unknown> | null; status: '' | 'open' | 'done' | 'declined'; admin_note: string
  expand?: { user?: User; exercise?: Exercise }
}
export type NotificationType = 'comment' | 'reply' | 'reaction' | 'friend_request' | 'friend_accept' | 'nudge' | 'exercise_approved' | 'exercise_rejected' | 'feedback_reply'
export interface Notification extends RecordModel { user: string; actor: string; type: NotificationType; text: string; target: string; read: boolean; expand?: { actor?: User } }
export interface Message extends RecordModel { from: string; to: string; body: string; read: boolean; expand?: { from?: User; to?: User } }
export interface Nudge extends RecordModel { from: string; to: string; message: string; seen: boolean; expand?: { from?: User; to?: User } }

export const DEFAULT_REST = 90
export const userRest = (u?: User | null) => (u && u.default_rest_s > 0 ? u.default_rest_s : DEFAULT_REST)
/** Default rest after finishing an exercise (before the next one); falls back to the between-sets default. */
export const userRestAfter = (u?: User | null) => (u && u.default_rest_after_s > 0 ? u.default_rest_after_s : userRest(u))

/** Rest for a lift: its own setting if the user set one, otherwise the account defaults. */
export function restFor(ex: Pick<Exercise, 'rest_s' | 'rest_after_s'>, u?: User | null) {
  const pick = (v: number | undefined, fallback: number) => (v === -1 ? 0 : v && v > 0 ? v : fallback)
  return { rest: pick(ex.rest_s, userRest(u)), after: pick(ex.rest_after_s, userRestAfter(u)) }
}

/** Whether the user uses nutrition tracking (and so sees calorie estimates). */
export const nutritionOn = (u?: Partial<Pick<User, 'nutrition_on'>> | null) => !!u?.nutrition_on
/** Show the "New: Nutrition" dots until the user has tapped the switch in Settings. */
export const nutritionNew = (u?: Partial<Pick<User, 'nutrition_seen'>> | null) => !!u && !u.nutrition_seen

export const me = () => pb.authStore.record?.id ?? ''

export function useUser() {
  const [u, setU] = useState(pb.authStore.record as User | null)
  useEffect(() => pb.authStore.onChange((_t, r) => setU(r ? ({ ...r } as User) : null)), [])
  return u
}

export const useUnit = (): Unit => (useUser()?.unit || 'kg') as Unit

export const avatarUrl = (u?: User | null) => (u?.avatar ? pb.files.getURL(u, u.avatar) : '')

export const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')

export const anyOf = (field: string, ids: string[]) => ids.map((id) => `${field}="${id}"`).join(' || ') || 'id=""'

type ErrBody = { message?: string; data?: Record<string, unknown> }

/** Human-readable error, digging into batch failures ({ data: { requests: { "3": { response: … } } } }) for the real cause. */
export function errMsg(e: unknown): string {
  const r = e as { response?: ErrBody; message?: string }
  const fromBody = (b?: ErrBody): string | null => {
    if (!b) return null
    const d = b.data as Record<string, unknown> | undefined
    const reqs = d?.requests as Record<string, { response?: ErrBody; message?: string }> | undefined
    if (reqs && typeof reqs === 'object') {
      const first = Object.values(reqs)[0]
      return fromBody(first?.response) ?? first?.message ?? null
    }
    const field = d && Object.entries(d).find(([, v]) => v && typeof v === 'object' && 'message' in (v as object))
    if (field) return `${field[0].replace(/_/g, ' ')}: ${(field[1] as { message: string }).message}`
    return b.message || null
  }
  if ((e as { status?: number }).status === 429) return 'Too many attempts. Wait a minute and try again.'
  const msg = fromBody(r.response) || r.message || 'Something went wrong'
  // PocketBase's reply when a collection doesn't exist yet: the server hasn't applied a newer migration.
  if (/missing (or invalid )?collection context/i.test(msg)) return 'The server needs an update for this feature. Restart PocketBase so it applies the new database changes, then try again.'
  return msg
}

export async function friendIds(): Promise<string[]> {
  const uid = me()
  const fs = await pb.collection('friendships').getFullList<Friendship>({ filter: 'status="accepted"' })
  return fs.map((f) => (f.requester === uid ? f.addressee : f.requester))
}
