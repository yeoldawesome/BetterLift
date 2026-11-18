/// <reference path="../pb_data/types.d.ts" />

// Threaded comments: a comment may reply to another comment on the same workout (any depth).
// Deleting a comment deletes its replies.
migrate((app) => {
  const comments = app.findCollectionByNameOrId("comments")
  comments.fields.add(new RelationField({ name: "parent", collectionId: comments.id, maxSelect: 1, cascadeDelete: true }))
  comments.updateRule = "user = @request.auth.id && @request.body.workout:isset = false && @request.body.user:isset = false && @request.body.parent:isset = false"
  comments.addIndex("idx_comments_parent", false, "parent", "")
  app.save(comments)
}, (app) => {
  const comments = app.findCollectionByNameOrId("comments")
  comments.removeIndex("idx_comments_parent")
  comments.fields.removeByName("parent")
  comments.updateRule = "user = @request.auth.id && @request.body.workout:isset = false && @request.body.user:isset = false"
  app.save(comments)
})
