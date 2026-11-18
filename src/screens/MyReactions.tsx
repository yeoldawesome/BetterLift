import { CustomReactionManager } from '../components/CustomReactions'
import { Card, Screen } from '../components/ui'

/** Your custom reactions: upload new ones and delete old ones. You and your friends can use them on any post. */
export default function MyReactions() {
  return (
    <Screen title="Reactions" back>
      <Card><CustomReactionManager /></Card>
    </Screen>
  )
}
