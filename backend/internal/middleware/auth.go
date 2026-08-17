package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/kenoma/backend/internal/auth"
	"github.com/kenoma/backend/internal/config"
	"github.com/kenoma/backend/internal/httpx"
)

type contextKey string

const (
	contextKeyUserID contextKey = "userID"
	contextKeyEmail  contextKey = "email"
)

// UserID returns the authenticated user's id from a request context
// previously wrapped by RequireAuth. Empty if unset.
func UserID(ctx context.Context) string {
	id, _ := ctx.Value(contextKeyUserID).(string)
	return id
}

// Email returns the authenticated user's email from a request context
// previously wrapped by RequireAuth. Empty if unset.
func Email(ctx context.Context) string {
	email, _ := ctx.Value(contextKeyEmail).(string)
	return email
}

// RequireAuth validates the "Authorization: Bearer <token>" header on every
// request it wraps, rejecting with 401 on any failure.
func RequireAuth(cfg *config.Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := strings.CutPrefix(header, "Bearer ")
		if !ok || token == "" {
			httpx.WriteError(w, http.StatusUnauthorized, "missing or invalid authorization header")
			return
		}

		claims, err := auth.ParseAccessToken(token, cfg.JWTAccessSecret)
		if err != nil {
			httpx.WriteError(w, http.StatusUnauthorized, "invalid or expired access token")
			return
		}

		ctx := context.WithValue(r.Context(), contextKeyUserID, claims.Subject)
		ctx = context.WithValue(ctx, contextKeyEmail, claims.Email)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
