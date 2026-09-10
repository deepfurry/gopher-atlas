.DEFAULT_GOAL := help
.PHONY: help install check generate dev-web dev-admin dev-cms build-cms db-status db-up

help:
	@node -e "console.log('make install | check | generate | dev-web | dev-admin | dev-cms | build-cms | db-status | db-up')"

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
	node --env-file-if-exists=.env scripts/dev-cms.mjs

build-cms:
	node scripts/build-cms.mjs

db-status:
	node scripts/db.mjs status

db-up:
	node scripts/db.mjs up
