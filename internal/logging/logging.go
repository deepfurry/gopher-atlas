// Package logging constructs the one application logger and owns its rotating sink.
package logging

import (
	"errors"
	"os"
	"path/filepath"

	"github.com/deepfurry/gopher-atlas/internal/config"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

func New(cfg config.LogConfig) (*zap.Logger, func() error, error) {
	var level zapcore.Level
	if err := level.UnmarshalText([]byte(cfg.Level)); err != nil || cfg.MaxSizeMB <= 0 || cfg.MaxBackups < 0 || cfg.MaxAgeDays < 0 || cfg.File == "" {
		return nil, nil, errors.New("invalid logging configuration")
	}
	if err := os.MkdirAll(filepath.Dir(cfg.File), 0700); err != nil {
		return nil, nil, errors.New("cannot initialize log directory")
	}
	// Detect permission/path failures at startup; Lumberjack otherwise opens lazily.
	file, err := os.OpenFile(cfg.File, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, nil, errors.New("cannot initialize log file")
	}
	if err := file.Close(); err != nil {
		return nil, nil, errors.New("cannot initialize log file")
	}
	rotation := &lumberjack.Logger{Filename: cfg.File, MaxSize: cfg.MaxSizeMB, MaxBackups: cfg.MaxBackups, MaxAge: cfg.MaxAgeDays, Compress: cfg.Compress}
	logger := zap.New(Core(level, zapcore.Lock(zapcore.AddSync(os.Stdout)), zapcore.AddSync(rotation)))
	return logger, func() error { _ = logger.Sync(); return rotation.Close() }, nil
}

// Core tests our structured tee independently of Lumberjack rotation internals.
func Core(level zapcore.Level, outputs ...zapcore.WriteSyncer) zapcore.Core {
	cfg := zap.NewProductionEncoderConfig()
	cfg.TimeKey = "timestamp"
	cfg.EncodeTime = zapcore.ISO8601TimeEncoder
	cores := make([]zapcore.Core, 0, len(outputs))
	for _, output := range outputs {
		cores = append(cores, zapcore.NewCore(zapcore.NewJSONEncoder(cfg), output, level))
	}
	return zapcore.NewTee(cores...)
}
