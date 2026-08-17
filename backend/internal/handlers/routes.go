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

	s.mux.HandleFunc("POST "+authPathPrefix+"/register", s.handleRegister)
	s.mux.HandleFunc("POST "+authPathPrefix+"/login", s.handleLogin)
	s.mux.HandleFunc("POST "+authPathPrefix+"/refresh", s.handleRefresh)
	s.mux.HandleFunc("POST "+authPathPrefix+"/logout", s.handleLogout)
	s.mux.HandleFunc("POST "+authPathPrefix+"/password-reset/request", s.handleRequestPasswordReset)
	s.mux.HandleFunc("POST "+authPathPrefix+"/password-reset/confirm", s.handleConfirmPasswordReset)
}
