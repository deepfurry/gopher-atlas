.DEFAULT_GOAL := help
.PHONY: help install check generate dev dev-web dev-admin dev-cms build-cms db-status db-up prod-update prod-backup

help:
	@node -e "console.log('make install | check | generate | dev | dev-web | dev-admin | dev-cms | build-cms | db-status | db-up | prod-update | prod-backup')"

install:
	pnpm install --frozen-lockfile
	go mod download

check:
	node scripts/check.mjs

generate:
	node scripts/generate.mjs

dev:
	node scripts/dev.mjs

dev-web:
	pnpm --filter @gopheratlas/web dev

dev-admin:
	pnpm --filter @gopheratlas/admin dev

dev-cms:
	node --env-file-if-exists=.env scripts/dev-cms.mjs

build-cms:
	node scripts/build-cms.mjs

prod-update:
	bash scripts/production.sh update

prod-backup:
	bash scripts/production.sh backup

db-status:
	node scripts/db.mjs status

db-up:
	node scripts/db.mjs up
