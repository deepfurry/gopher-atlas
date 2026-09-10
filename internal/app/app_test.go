package app

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

func TestHTTPBoundary(t *testing.T) {
	server := New()
	server.Get("/test-error", func(fiber.Ctx) error { return errors.New("private backend detail") })
	server.Get("/test-panic", func(fiber.Ctx) error { panic("private panic detail") })
	for _, tc := range []struct {
		path   string
		status int
		code   string
	}{
		{"/healthz", 200, ""}, {"/api/admin/v1/me", 404, "not_found"},
		{"/ops/monitor", 404, "not_found"}, {"/readyz", 404, "not_found"},
		{"/test-error", 500, "internal_error"}, {"/test-panic", 500, "internal_error"},
	} {
		t.Run(tc.path, func(t *testing.T) {
			resp, err := server.Test(httptest.NewRequest("GET", tc.path, nil))
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.status {
				t.Fatalf("status = %d", resp.StatusCode)
			}
			var body struct {
				Status string                                    `json:"status"`
				Error  struct{ Code, Message, RequestID string } `json:"error"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if tc.code == "" {
				if body.Status != "ok" {
					t.Fatal("health response disagrees with OpenAPI")
				}
			} else if body.Error.Code != tc.code || body.Error.RequestID == "" {
				t.Fatalf("error contract = %+v", body.Error)
			}
			if tc.status == 500 && body.Error.Message != "An internal error occurred." {
				t.Fatal("internal detail leaked")
			}
		})
	}
}
