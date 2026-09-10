// Package fault defines safe business errors. External errors never become messages.
package fault

type Error string

func (e Error) Error() string { return string(e) }

const (
	Authentication Error = "authentication_required"
	Pending        Error = "account_pending"
	Disabled       Error = "account_disabled"
	Permission     Error = "permission_denied"
	CSRF           Error = "csrf_invalid"
	State          Error = "oauth_state_invalid"
	OAuth          Error = "oauth_exchange_failed"
	Validation     Error = "validation_failed"
	NotFound       Error = "not_found"
	LastAdmin      Error = "last_admin_required"
	Unavailable    Error = "dependency_unavailable"
)
