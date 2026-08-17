// Package auth holds the business logic for registration, login, session
// refresh/logout, and password reset — framework-free (no net/http import)
// so it can be unit tested and called from handlers without dragging in
// request/response concerns.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	db "github.com/kenoma/backend/db/sqlc"
	authpkg "github.com/kenoma/backend/internal/auth"
	"github.com/kenoma/backend/internal/config"
	"github.com/kenoma/backend/internal/email"
)

var (
	ErrEmailTaken          = errors.New("email already registered")
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")
	ErrInvalidResetToken   = errors.New("invalid or expired reset token")
	ErrValidation          = errors.New("validation failed")
)

const minPasswordLength = 8

type Service struct {
	Queries db.Querier
	Sender  email.Sender
	Cfg     *config.Config
}

func New(queries db.Querier, sender email.Sender, cfg *config.Config) *Service {
	return &Service{Queries: queries, Sender: sender, Cfg: cfg}
}

// Session is what a handler needs to build an AuthResponse and set the
// refresh cookie — it never carries the raw refresh token's hash back out.
type Session struct {
	User             db.UserAccount
	AccessToken      string
	AccessExpiresAt  time.Time
	RefreshToken     string
	RefreshExpiresAt time.Time
}

func validateEmail(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("%w: email is required", ErrValidation)
	}
	addr, err := mail.ParseAddress(trimmed)
	if err != nil {
		return "", fmt.Errorf("%w: invalid email format", ErrValidation)
	}
	return addr.Address, nil
}

func validatePassword(pw string) error {
	if len(pw) < minPasswordLength {
		return fmt.Errorf("%w: password must be at least %d characters", ErrValidation, minPasswordLength)
	}
	return nil
}

func (s *Service) issueSession(ctx context.Context, user db.UserAccount) (Session, error) {
	accessToken, accessExpiresAt, err := authpkg.IssueAccessToken(user.ID, user.Email, s.Cfg.JWTAccessSecret, s.Cfg.AccessTokenTTL)
	if err != nil {
		return Session{}, err
	}

	rawRefresh, err := authpkg.GenerateOpaqueToken()
	if err != nil {
		return Session{}, err
	}
	refreshExpiresAt := time.Now().Add(s.Cfg.RefreshTokenTTL)
	if _, err := s.Queries.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		UserID:    user.ID,
		TokenHash: authpkg.HashToken(rawRefresh),
		ExpiresAt: refreshExpiresAt,
	}); err != nil {
		return Session{}, err
	}

	return Session{
		User:             user,
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		RefreshToken:     rawRefresh,
		RefreshExpiresAt: refreshExpiresAt,
	}, nil
}

func (s *Service) Register(ctx context.Context, rawEmail, password, name string) (Session, error) {
	emailAddr, err := validateEmail(rawEmail)
	if err != nil {
		return Session{}, err
	}
	if err := validatePassword(password); err != nil {
		return Session{}, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return Session{}, fmt.Errorf("%w: name is required", ErrValidation)
	}

	hash, err := authpkg.HashPassword(password)
	if err != nil {
		return Session{}, err
	}

	user, err := s.Queries.CreateUser(ctx, db.CreateUserParams{
		Email:        emailAddr,
		PasswordHash: hash,
		Name:         name,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Session{}, ErrEmailTaken
		}
		return Session{}, err
	}

	return s.issueSession(ctx, user)
}

func (s *Service) Login(ctx context.Context, rawEmail, password string) (Session, error) {
	emailAddr, err := validateEmail(rawEmail)
	if err != nil {
		return Session{}, err
	}
	if password == "" {
		return Session{}, fmt.Errorf("%w: password is required", ErrValidation)
	}

	user, err := s.Queries.GetUserByEmail(ctx, emailAddr)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrInvalidCredentials
		}
		return Session{}, err
	}

	if err := authpkg.VerifyPassword(user.PasswordHash, password); err != nil {
		return Session{}, ErrInvalidCredentials
	}

	return s.issueSession(ctx, user)
}

// Refresh rotates the presented refresh token. If the token has already
// been revoked (replay/theft signal), every refresh token for that user is
// revoked as a precaution.
func (s *Service) Refresh(ctx context.Context, rawRefreshToken string) (Session, error) {
	if rawRefreshToken == "" {
		return Session{}, ErrInvalidRefreshToken
	}

	hash := authpkg.HashToken(rawRefreshToken)
	tok, err := s.Queries.GetRefreshTokenByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Session{}, ErrInvalidRefreshToken
		}
		return Session{}, err
	}

	if tok.RevokedAt.Valid {
		// Already-used token presented again: treat as compromised.
		if revokeErr := s.Queries.RevokeAllUserRefreshTokens(ctx, tok.UserID); revokeErr != nil {
			return Session{}, revokeErr
		}
		return Session{}, ErrInvalidRefreshToken
	}
	if time.Now().After(tok.ExpiresAt) {
		return Session{}, ErrInvalidRefreshToken
	}

	user, err := s.Queries.GetUserByID(ctx, tok.UserID)
	if err != nil {
		return Session{}, err
	}

	if err := s.Queries.RevokeRefreshToken(ctx, tok.ID); err != nil {
		return Session{}, err
	}

	return s.issueSession(ctx, user)
}

// Logout revokes the presented refresh token. Always succeeds — an
// already-invalid or missing token is not an error, since the end state
// (no valid session) is the same either way.
func (s *Service) Logout(ctx context.Context, rawRefreshToken string) error {
	if rawRefreshToken == "" {
		return nil
	}
	tok, err := s.Queries.GetRefreshTokenByHash(ctx, authpkg.HashToken(rawRefreshToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	return s.Queries.RevokeRefreshToken(ctx, tok.ID)
}

// RequestPasswordReset always succeeds from the caller's perspective,
// whether or not the account exists — the handler must not branch on this
// method's internal knowledge, to avoid leaking account existence.
func (s *Service) RequestPasswordReset(ctx context.Context, rawEmail string) error {
	emailAddr, err := validateEmail(rawEmail)
	if err != nil {
		return err
	}

	user, err := s.Queries.GetUserByEmail(ctx, emailAddr)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}

	if err := s.Queries.InvalidateUserPasswordResetTokens(ctx, user.ID); err != nil {
		return err
	}

	rawToken, err := authpkg.GenerateOpaqueToken()
	if err != nil {
		return err
	}
	if _, err := s.Queries.CreatePasswordResetToken(ctx, db.CreatePasswordResetTokenParams{
		UserID:    user.ID,
		TokenHash: authpkg.HashToken(rawToken),
		ExpiresAt: time.Now().Add(s.Cfg.PasswordResetTTL),
	}); err != nil {
		return err
	}

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", s.Cfg.FrontendURL, rawToken)
	body := fmt.Sprintf(`<p>Click the link below to reset your Kenoma password. This link expires in %s.</p><p><a href="%s">%s</a></p>`,
		s.Cfg.PasswordResetTTL, resetLink, resetLink)
	return s.Sender.Send(ctx, user.Email, "Reset your Kenoma password", body)
}

// ConfirmPasswordReset validates the reset token, sets the new password, and
// revokes every refresh token for that user so all devices are signed out.
func (s *Service) ConfirmPasswordReset(ctx context.Context, rawToken, newPassword string) error {
	if rawToken == "" {
		return ErrInvalidResetToken
	}
	if err := validatePassword(newPassword); err != nil {
		return err
	}

	resetTok, err := s.Queries.GetValidPasswordResetToken(ctx, authpkg.HashToken(rawToken))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidResetToken
		}
		return err
	}

	hash, err := authpkg.HashPassword(newPassword)
	if err != nil {
		return err
	}

	if err := s.Queries.UpdateUserPassword(ctx, db.UpdateUserPasswordParams{
		ID:           resetTok.UserID,
		PasswordHash: hash,
	}); err != nil {
		return err
	}
	if err := s.Queries.MarkPasswordResetTokenUsed(ctx, resetTok.ID); err != nil {
		return err
	}
	return s.Queries.RevokeAllUserRefreshTokens(ctx, resetTok.UserID)
}

// TokenRetention is how long expired tokens are kept before being deleted.
// They are already unusable the moment they expire, so this grace period costs
// nothing and keeps recent history available for debugging and for reuse
// detection to stay meaningful near the boundary.
const TokenRetention = 30 * 24 * time.Hour

// PurgeExpiredTokens deletes refresh and password reset tokens that expired
// longer ago than TokenRetention, and reports how many rows went. Nothing else
// removes these rows, so without this both tables grow forever: a single
// active user adds a refresh row roughly every access-token lifetime.
//
// The cutoff is passed in rather than computed here so callers control the
// clock.
func (s *Service) PurgeExpiredTokens(ctx context.Context, before time.Time) (int64, error) {
	refreshRows, err := s.Queries.DeleteExpiredRefreshTokens(ctx, before)
	if err != nil {
		return 0, err
	}
	resetRows, err := s.Queries.DeleteExpiredPasswordResetTokens(ctx, before)
	if err != nil {
		return refreshRows, err
	}
	return refreshRows + resetRows, nil
}
