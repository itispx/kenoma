package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/config"
	"github.com/kenoma/backend/internal/email"
	"github.com/kenoma/backend/internal/handlers"
	authsvc "github.com/kenoma/backend/internal/services/auth"
)

// How often expired tokens are purged. Independent of request traffic, so the
// tables are still cleaned when the app is idle, and no request ever pays for
// the deletes.
const purgeInterval = 1 * time.Hour

func main() {
	_ = godotenv.Load("../.env")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}

	var sender email.Sender = email.NoopSender{}
	if cfg.ResendAPIKey != "" {
		sender = email.NewResendSender(cfg.ResendAPIKey, cfg.EmailFromAddress)
	}

	authSvc := authsvc.New(db.New(pool), sender, cfg)
	srv := handlers.NewServer(cfg, pool, authSvc)

	purgeCtx, stopPurge := context.WithCancel(ctx)
	defer stopPurge()
	go runTokenPurge(purgeCtx, authSvc)

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           srv.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Printf("kenoma backend listening on :%s", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("server exited cleanly")
}

// runTokenPurge deletes long-expired tokens on a fixed interval until ctx is
// cancelled. It runs once at startup so a deploy does not wait a full interval
// before the first pass.
func runTokenPurge(ctx context.Context, svc *authsvc.Service) {
	purge := func() {
		rows, err := svc.PurgeExpiredTokens(ctx, time.Now().Add(-authsvc.TokenRetention))
		if err != nil {
			// Non-fatal: the tables grow a little until the next pass.
			log.Printf("token purge failed: %v", err)
			return
		}
		if rows > 0 {
			log.Printf("token purge: deleted %d expired rows", rows)
		}
	}

	purge()

	ticker := time.NewTicker(purgeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			purge()
		case <-ctx.Done():
			return
		}
	}
}
