package logging

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/deepfurry/gopher-atlas/internal/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func TestJSONTee(t *testing.T) {
	var console, file bytes.Buffer
	logger := zap.New(Core(zapcore.InfoLevel, zapcore.AddSync(&console), zapcore.AddSync(&file)))
	logger.Info("runtime started", zap.String("component", "cms"))
	if !bytes.Equal(console.Bytes(), file.Bytes()) {
		t.Fatal("tee outputs differ")
	}
	var record map[string]any
	if err := json.Unmarshal(file.Bytes(), &record); err != nil || record["component"] != "cms" || record["timestamp"] == nil {
		t.Fatal("structured core incorrect")
	}
}
func TestRotationWiringAndValidation(t *testing.T) {
	cfg := config.LogConfig{Level: "info", File: filepath.Join(t.TempDir(), "logs", "cms.jsonl"), MaxSizeMB: 100, MaxBackups: 10, MaxAgeDays: 30, Compress: true}
	logger, closeLog, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	logger.Info("runtime test initialized")
	if err := closeLog(); err != nil {
		t.Fatal("logger close failed")
	}
	data, err := os.ReadFile(cfg.File)
	if err != nil || !json.Valid(bytes.TrimSpace(data)) {
		t.Fatal("rotating JSONL sink not wired")
	}
	cfg.Level = "invalid"
	if _, _, err := New(cfg); err == nil {
		t.Fatal("invalid level accepted")
	}
}
