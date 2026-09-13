# Inbox collaboration contract

GET `/api/inbox/collaboration?id=<localRowId>&type=comment|mention|dm|review&socialAccountId=<account>`
returns `{data:{notes:[{id,body,authorId,authorName,createdAt,mentions:[{id,name}]}],activity:[{id,actorName,kind,description,createdAt}],canWrite,pagination:{notes:{nextCursor:string|null},activity:{nextCursor:string|null}}}}`.
Both arrays are independently bounded to 50, ordered by createdAt descending then id descending. Dates are ISO strings. The existing first-page fields are preserved; pagination is **inside data**.

Pass the returned notes cursor as `noteCursor` and/or the activity cursor as `activityCursor` on the same GET. Each omitted cursor returns that stream's newest page; each supplied cursor advances only its stream. Clients appending one stream should ignore the other stream's repeated first page. Null means no further page at the time of that request. Empty histories (including items without a workflow) return both pagination keys with null cursors.

Cursors are opaque, versioned, validated base64url positions bound to organization, social account, canonical entity type/key, and stream. DM cursors work across local messages in the same account/conversation. Invalid, oversized, malformed-date, wrong-stream or wrong-scope cursors return 400 after authentication and item access checks (outer query-schema errors may be rejected before item lookup). Every page rechecks live membership and owned local item/account and remains tenant/workflow scoped; the cursor is not an authorization credential and need not be signed. Keyset predicates compare `(createdAt,id)` strictly below the last delivered row, with at most 51 rows read per stream to detect another page. Deleted anchor rows do not break pagination and newer inserts do not duplicate earlier results. This is a live history traversal, not a cross-request snapshot: backdated inserts/deletions can change later pages. Existing append-only API writes retain server timestamps.

POST the same endpoint with `{id,type,socialAccountId,body,mentionIds:string[],requestId:string}` returns `{success:true,data:<note>}`.
Body is trimmed, nonempty, at most 5000 characters; at most 20 mention IDs (duplicates collapse). requestId is a UUID, case-normalized.
Retries are scoped to author and canonical workflow and return the original note even when the payload changes. Live author membership/write access and local item ownership are still required on retries. Transient conflicts retry twice internally; a 409 can be retried with the same UUID.

All members may read. OWNER/ADMIN/MEMBER may write; VIEWER cannot. CUSTOM requires a same-organization custom role granting the existing `posts.edit` permission (there is no inbox permission in the current permission catalog). These checks also apply to workflow PATCH and legacy assignment/label PATCH.

Mentions select current organization members by user ID. Names are historical snapshots. Notifications are recipient-specific database Notifications, with generic text and no private note body. Links use `/engagement?itemId=<encoded local row ID>&type=<type>&accountId=<encoded account ID>`; the frontend must consume these query parameters and select/load that item. DM notes are shared across local messages with the same conversation and social account.

Notes, recipient notifications, and `note` activity are one serializable transaction. Workflow activity kinds are `assignment`, `labels`, and `status`; unchanged values and label reordering create no activity. Expired snoozes use the effective open state. All bulk workflow writes/history roll back together. Notes/history have no update/delete API; tenant/workflow deletion cascades. Migration depends on the preceding inbox workflow migration.
