package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/kenoma/backend/internal/httpx"
	authsvc "github.com/kenoma/backend/internal/services/auth"
)

// refreshCookiePath scopes the refresh cookie to the auth endpoints, so it is
// never sent to unrelated routes. It must match the auth route paths in
// routes.go: narrower and refresh stops working, wider and the cookie leaks
// to endpoints that have no use for it. Nothing enforces that, so change both
// together.
const refreshCookiePath = "/api/v1/auth"

const refreshCookieName = "refresh_token"

type authUserResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type authResponse struct {
	AccessToken string           `json:"access_token"`
	ExpiresAt   string           `json:"expires_at"`
	User        authUserResponse `json:"user"`
}

func toAuthResponse(sess authsvc.Session) authResponse {
	return authResponse{
		AccessToken: sess.AccessToken,
		ExpiresAt:   sess.AccessExpiresAt.Format(time.RFC3339),
		User: authUserResponse{
			ID:    sess.User.ID.String(),
			Email: sess.User.Email,
			Name:  sess.User.Name,
		},
	}
}

// refreshCookie builds the refresh cookie. Both setting and clearing go
// through here so the security-relevant attributes are stated exactly once:
// two copies is how HttpOnly or SameSite quietly drifts on one path only.
//
// SameSite=Lax works because the frontend and API are same-site: "site" is the
// registrable domain, so kenoma.com and api.kenoma.com are one site (as are
// localhost:3000 and localhost:8080 in dev, since ports don't affect
// same-site). They are still different *origins*, which is why CORS is
// configured separately. Lax keeps the browser's own CSRF protection: the
// cookie is withheld from cross-site POSTs, so another site can't drive this
// API using the visitor's session.
func (s *Server) refreshCookie(value string) *http.Cookie {
	return &http.Cookie{
		Name:     refreshCookieName,
		Value:    value,
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   s.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

func (s *Server) setRefreshCookie(w http.ResponseWriter, rawToken string, expiresAt time.Time) {
	c := s.refreshCookie(rawToken)
	c.Expires = expiresAt
	http.SetCookie(w, c)
}

func (s *Server) clearRefreshCookie(w http.ResponseWriter) {
	c := s.refreshCookie("")
	c.MaxAge = -1
	http.SetCookie(w, c)
}

func refreshTokenFromRequest(r *http.Request) string {
	c, err := r.Cookie(refreshCookieName)
	if err != nil {
		return ""
	}
	return c.Value
}

// authErrorResponses maps each sentinel the auth service can return to the
// status and client-facing message for it. Service error text is deliberately
// not reused verbatim, so internals never leak, but every message that does
// reach a client is defined here and only here.
//
// The frontend branches on several of these codes: 401 on login, 409 on
// register, 400 on an expired reset link. Changing a status here changes
// frontend behavior.
var authErrorResponses = []struct {
	err     error
	code    int
	message string
}{
	{authsvc.ErrEmailTaken, http.StatusConflict, "email already registered"},
	{authsvc.ErrInvalidCredentials, http.StatusUnauthorized, "invalid email or password"},
	{authsvc.ErrInvalidRefreshToken, http.StatusUnauthorized, "invalid or expired session"},
	{authsvc.ErrInvalidResetToken, http.StatusBadRequest, "invalid or expired reset token"},
}

// writeAuthError maps a service error to its HTTP response. Validation errors
// are the exception: their text is written for the user and is safe to pass
// through, since it names which field is wrong. Anything unrecognized is a
// bug, so it becomes a generic 500 rather than exposing the message.
func writeAuthError(w http.ResponseWriter, err error) {
	if errors.Is(err, authsvc.ErrValidation) {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	for _, m := range authErrorResponses {
		if errors.Is(err, m.err) {
			httpx.WriteError(w, m.code, m.message)
			return
		}
	}
	httpx.WriteError(w, http.StatusInternalServerError, "internal server error")
}

// decodeBody reads the JSON request body, writing a 400 and reporting false if
// it cannot. Handlers return immediately when it reports false.
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := httpx.DecodeJSON(r, dst); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

func decodeBodyLimit(w http.ResponseWriter, r *http.Request, dst any, maxBytes int64) bool {
	if err := httpx.DecodeJSONLimit(r, dst, maxBytes); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

// writeSession issues the refresh cookie and the session body together. These
// two always travel as a pair: a response carrying an access token without a
// matching refresh cookie would leave the client unable to renew it.
func (s *Server) writeSession(w http.ResponseWriter, code int, sess authsvc.Session) {
	s.setRefreshCookie(w, sess.RefreshToken, sess.RefreshExpiresAt)
	httpx.WriteJSON(w, code, toAuthResponse(sess))
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if !decodeBody(w, r, &req) {
		return
	}

	sess, err := s.authSvc.Register(r.Context(), req.Email, req.Password, req.Name)
	if err != nil {
		writeAuthError(w, err)
		return
	}

	s.writeSession(w, http.StatusCreated, sess)
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if !decodeBody(w, r, &req) {
		return
	}

	sess, err := s.authSvc.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeAuthError(w, err)
		return
	}

	s.writeSession(w, http.StatusOK, sess)
}

func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	sess, err := s.authSvc.Refresh(r.Context(), refreshTokenFromRequest(r))
	if err != nil {
		s.clearRefreshCookie(w)
		writeAuthError(w, err)
		return
	}

	s.writeSession(w, http.StatusOK, sess)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// Logout never fails: an already-invalid or missing token leaves the
	// client in the same state it asked for, so the cookie is cleared either
	// way.
	_ = s.authSvc.Logout(r.Context(), refreshTokenFromRequest(r))
	s.clearRefreshCookie(w)
	httpx.WriteStatus(w, http.StatusNoContent)
}

type requestPasswordResetRequest struct {
	Email string `json:"email"`
}

func (s *Server) handleRequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req requestPasswordResetRequest
	if !decodeBody(w, r, &req) {
		return
	}

	// Always 202 regardless of whether the account exists or the send
	// succeeds — never let this endpoint leak account existence.
	if err := s.authSvc.RequestPasswordReset(r.Context(), req.Email); err != nil && errors.Is(err, authsvc.ErrValidation) {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{
		"message": "If an account with that email exists, a reset link has been sent.",
	})
}

type confirmPasswordResetRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

func (s *Server) handleConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var req confirmPasswordResetRequest
	if !decodeBody(w, r, &req) {
		return
	}

	if err := s.authSvc.ConfirmPasswordReset(r.Context(), req.Token, req.Password); err != nil {
		writeAuthError(w, err)
		return
	}

	httpx.WriteStatus(w, http.StatusNoContent)
}
