package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kenoma/backend/internal/config"
	authsvc "github.com/kenoma/backend/internal/services/auth"
	"github.com/kenoma/backend/internal/services/crs"
	"github.com/kenoma/backend/internal/services/documents"
	"github.com/kenoma/backend/internal/services/orgs"
	"github.com/kenoma/backend/internal/services/projects"
	"github.com/kenoma/backend/internal/services/workstreams"
)

// Server carries what the HTTP layer needs. Services are built by main.go and
// handed in, since background jobs use them too and should not have to reach
// through the HTTP server to do it.
type Server struct {
	mux           *http.ServeMux
	cfg           *config.Config
	pool          *pgxpool.Pool // health check only; queries go through services
	authSvc       *authsvc.Service
	orgSvc        *orgs.Service
	projectSvc    *projects.Service
	documentSvc   *documents.Service
	crSvc         *crs.Service
	workstreamSvc *workstreams.Service
}

func NewServer(
	cfg *config.Config,
	pool *pgxpool.Pool,
	authSvc *authsvc.Service,
	orgSvc *orgs.Service,
	projectSvc *projects.Service,
	documentSvc *documents.Service,
	crSvc *crs.Service,
	workstreamSvc *workstreams.Service,
) *Server {
	s := &Server{
		mux:           http.NewServeMux(),
		cfg:           cfg,
		pool:          pool,
		authSvc:       authSvc,
		orgSvc:        orgSvc,
		projectSvc:    projectSvc,
		documentSvc:   documentSvc,
		crSvc:         crSvc,
		workstreamSvc: workstreamSvc,
	}
	s.registerRoutes()
	return s
}
