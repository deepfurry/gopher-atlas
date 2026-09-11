// Package fault defines safe business errors. External errors never become messages.
package fault

type Error string

func (e Error) Error() string { return string(e) }

const (
	Authentication  Error = "authentication_required"
	Pending         Error = "account_pending"
	Disabled        Error = "account_disabled"
	Permission      Error = "permission_denied"
	CSRF            Error = "csrf_invalid"
	State           Error = "oauth_state_invalid"
	OAuth           Error = "oauth_exchange_failed"
	Validation      Error = "validation_failed"
	NotFound        Error = "not_found"
	LastAdmin       Error = "last_admin_required"
	Unavailable     Error = "dependency_unavailable"
	ContentVersion  Error = "content_version_conflict"
	EditorialState  Error = "invalid_editorial_state"
	RouteConflict   Error = "route_conflict"
	ReviewRevision  Error = "review_revision_conflict"
	SelfReview      Error = "self_review_forbidden"
	ContentArchived Error = "content_archived"
	NotPublished    Error = "content_not_published"
	Markdown        Error = "invalid_markdown"
	Payload         Error = "invalid_payload"
	TagConflict     Error = "tag_conflict"
	TopicTarget     Error = "topic_target_unpublished"
)
