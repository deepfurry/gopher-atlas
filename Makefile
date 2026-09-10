.DEFAULT_GOAL := help
.PHONY: help install check generate dev-web dev-admin dev-cms db-status db-up

help:
	@node -e "console.log('make install | check | generate | dev-web | dev-admin | dev-cms | db-status | db-up')"

install:
	pnpm install --frozen-lockfile
	go mod download

check:
	node scripts/check.mjs

generate:
	node scripts/generate.mjs

dev-web:
	pnpm --filter @gopheratlas/web dev

dev-admin:
	pnpm --filter @gopheratlas/admin dev

dev-cms:
	go run ./cmd/gopheratlas-cms

db-status:
	node scripts/db.mjs status

db-up:
	node scripts/db.mjs up
