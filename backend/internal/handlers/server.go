package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenoma/backend/internal/config"
	authsvc "github.com/kenoma/backend/internal/services/auth"
)

// Server carries what the HTTP layer needs. Services are built by main.go and
// handed in, since background jobs use them too and should not have to reach
// through the HTTP server to do it.
type Server struct {
	mux     *http.ServeMux
	cfg     *config.Config
	pool    *pgxpool.Pool // health check only; queries go through services
	authSvc *authsvc.Service
}

func NewServer(cfg *config.Config, pool *pgxpool.Pool, authSvc *authsvc.Service) *Server {
	s := &Server{
		mux:     http.NewServeMux(),
		cfg:     cfg,
		pool:    pool,
		authSvc: authSvc,
	}
	s.registerRoutes()
	return s
}
