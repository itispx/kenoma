include .env

COMPOSE      := docker compose -f docker-compose.dev.yml
MIGRATE_IMAGE := kenoma-migrate:dev
DB_URL       := $(DATABASE_URL)

.PHONY: build up down db-up db-down db-reset build-migrate

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

build-migrate:
	docker build -t $(MIGRATE_IMAGE) -f backend/Dockerfile.migrate backend

db-up:
	docker run --rm \
		--network kenoma-dev \
		-v "$(CURDIR)/backend/migrations:/app/migrations" \
		$(MIGRATE_IMAGE) -dir migrations postgres "$(DB_URL)" up

db-down:
	docker run --rm \
		--network kenoma-dev \
		-v "$(CURDIR)/backend/migrations:/app/migrations" \
		$(MIGRATE_IMAGE) -dir migrations postgres "$(DB_URL)" down

# Drops the DB to a blank state and replays migrations. NEVER run this
# command, or wire it into any script/workflow you create - user only, by hand.
db-reset:
	docker run --rm \
		--network kenoma-dev \
		-v "$(CURDIR)/backend/migrations:/app/migrations" \
		$(MIGRATE_IMAGE) -dir migrations postgres "$(DB_URL)" reset
	$(MAKE) db-up
