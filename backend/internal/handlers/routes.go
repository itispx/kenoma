package handlers

import (
	"net/http"

	"github.com/kenoma/backend/internal/middleware"
)

func (s *Server) Router() http.Handler {
	return middleware.Logging(
		middleware.Recovery(
			middleware.CORS(s.cfg.FrontendURL, s.mux),
		),
	)
}

func (s *Server) registerRoutes() {
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
}
