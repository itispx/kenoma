package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenoma/backend/internal/config"
)

type Server struct {
	mux  *http.ServeMux
	cfg  *config.Config
	pool *pgxpool.Pool
}

func NewServer(cfg *config.Config, pool *pgxpool.Pool) *Server {
	s := &Server{
		mux:  http.NewServeMux(),
		cfg:  cfg,
		pool: pool,
	}
	s.registerRoutes()
	return s
}
