import { useClearOnVisit } from '../lib/notifications'
import { ExerciseList } from '../components/ExerciseList'
import { Screen } from '../components/ui'
import { useSearchParams } from 'react-router-dom'

export default function Exercises() {
  useClearOnVisit('exercises')
  const [params] = useSearchParams()
  return <Screen title="Exercises" back><ExerciseList openId={params.get('open') ?? undefined} /></Screen>
}
