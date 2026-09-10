package policy

import "testing"

func TestRoleCapabilities(t *testing.T) {
	for _, status := range []string{"pending", "disabled"} {
		for _, role := range []string{"admin", "reviewer", "editor"} {
			if For(role, status) != (Permissions{}) {
				t.Fatal("inactive role has capabilities")
			}
		}
	}
	admin := For("admin", "active")
	if !admin.ManageUsers || !admin.ManageAuthorProfiles || !admin.ViewMonitor || !admin.CreateTopic {
		t.Fatal("admin capabilities missing")
	}
	reviewer := For("reviewer", "active")
	if !reviewer.Review || !reviewer.Publish || !reviewer.ViewAudit || !reviewer.RetryBuild || reviewer.ManageUsers || reviewer.ManageTaxonomy || reviewer.ViewMonitor || reviewer.CreateTopic {
		t.Fatal("reviewer capabilities incorrect")
	}
	if For("editor", "active") != (Permissions{EditOwnProfile: true}) || For("unknown", "active") != (Permissions{}) {
		t.Fatal("unknown/editor capabilities incorrect")
	}
}
