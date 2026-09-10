// Package http translates HTTP requests and responses; it owns no business policy.
package http

import (
	"errors"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
)

func Register(server *fiber.App) {
	server.Get("/healthz", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})
}

// ErrorHandler never exposes internal errors or reflects paths/query strings.
func ErrorHandler(c fiber.Ctx, err error) error {
	status, code, message := fiber.StatusInternalServerError, "internal_error", "An internal error occurred."
	var fiberErr *fiber.Error
	if errors.As(err, &fiberErr) && fiberErr.Code == fiber.StatusNotFound {
		status, code, message = fiber.StatusNotFound, "not_found", "The resource was not found."
	}
	return c.Status(status).JSON(fiber.Map{
		"error": fiber.Map{"code": code, "message": message, "requestId": requestid.FromContext(c)},
	})
}
