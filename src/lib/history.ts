import { me, pb, type Workout } from './pb'
import { clearBestCache } from './best'
import { invalidateStats } from './statsData'

const changed = () => { invalidateStats(); clearBestCache() }

// Deleting a workout cascades on the server to its sets, comments, replies and reactions,
// so it disappears from stats, PR counts, the feed and storage in one step.

export const deleteWorkout = (id: string) => pb.collection('workouts').delete(id).then((r) => { changed(); return r })

export async function deleteAllHistory(onProgress?: (done: number, total: number) => void) {
  const all = await pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('user = {:u}', { u: me() }), fields: 'id' })
  for (let i = 0; i < all.length; i += 200) {
    const b = pb.createBatch()
    all.slice(i, i + 200).forEach((w) => b.collection('workouts').delete(w.id))
    await b.send()
    onProgress?.(Math.min(i + 200, all.length), all.length)
  }
  changed()
  return all.length
}
