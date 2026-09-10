// Package policy is the only role-to-capability mapping; UI consumes its projection.
package policy

type Permissions struct {
	ManageUsers          bool `json:"manageUsers"`
	ManageAuthorProfiles bool `json:"manageAuthorProfiles"`
	EditOwnProfile       bool `json:"editOwnProfile"`
	Review               bool `json:"review"`
	Publish              bool `json:"publish"`
	ManageTaxonomy       bool `json:"manageTaxonomy"`
	RetryBuild           bool `json:"retryBuild"`
	ViewAudit            bool `json:"viewAudit"`
	ViewMonitor          bool `json:"viewMonitor"`
	CreateTopic          bool `json:"createTopic"`
}

func For(role, status string) Permissions {
	if status != "active" {
		return Permissions{}
	}
	switch role {
	case "admin":
		return Permissions{true, true, true, true, true, true, true, true, true, true}
	case "reviewer":
		return Permissions{EditOwnProfile: true, Review: true, Publish: true, RetryBuild: true, ViewAudit: true}
	case "editor":
		return Permissions{EditOwnProfile: true}
	default:
		return Permissions{}
	}
}

func ValidRole(role string) bool { return role == "admin" || role == "reviewer" || role == "editor" }
