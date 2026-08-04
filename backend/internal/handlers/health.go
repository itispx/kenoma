package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/kenoma/backend/internal/httpx"
)

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.pool.Ping(ctx); err != nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "database unreachable")
		return
	}

	httpx.WriteStatus(w, http.StatusOK)
}
