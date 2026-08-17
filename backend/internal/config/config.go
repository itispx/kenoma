package config

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	Port             string
	DatabaseURL      string
	JWTAccessSecret  string // signs access tokens; refresh tokens are opaque random bytes, so they need no secret
	AccessTokenTTL   time.Duration
	RefreshTokenTTL  time.Duration
	InvitationTTL    time.Duration
	PasswordResetTTL time.Duration
	FrontendURL      string // used for CORS allow-origin and invitation/reset links
	PandocPath       string
	PandocPDFEngine  string // passed as pandoc --pdf-engine; pandoc's default (pdflatex) isn't installed by default anywhere, so this normally must be set (e.g. "tectonic", "wkhtmltopdf", "typst")
	CookieSecure     bool   // false only for local http dev; refresh cookie needs Secure in production (SameSite=None requires it)
	ResendAPIKey     string // empty means no Resend account configured yet; falls back to a no-op sender that logs instead of sending
	EmailFromAddress string // Resend's sandbox sender until a domain is verified; swapping to a real domain is config-only
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		JWTAccessSecret:  os.Getenv("JWT_ACCESS_SECRET"),
		FrontendURL:      getEnv("FRONTEND_URL", "http://localhost:3000"),
		PandocPath:       getEnv("PANDOC_PATH", "pandoc"),
		PandocPDFEngine:  os.Getenv("PANDOC_PDF_ENGINE"),
		CookieSecure:     getEnv("COOKIE_SECURE", "true") == "true",
		ResendAPIKey:     os.Getenv("RESEND_API_KEY"),
		EmailFromAddress: getEnv("EMAIL_FROM_ADDRESS", "onboarding@resend.dev"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.JWTAccessSecret == "" {
		return nil, fmt.Errorf("JWT_ACCESS_SECRET is required")
	}

	accessTTL, err := parseDurationEnv("ACCESS_TOKEN_TTL", 15*time.Minute)
	if err != nil {
		return nil, err
	}
	refreshTTL, err := parseDurationEnv("REFRESH_TOKEN_TTL", 7*24*time.Hour)
	if err != nil {
		return nil, err
	}
	invitationTTL, err := parseDurationEnv("INVITATION_TTL", 7*24*time.Hour)
	if err != nil {
		return nil, err
	}
	passwordResetTTL, err := parseDurationEnv("PASSWORD_RESET_TTL", 1*time.Hour)
	if err != nil {
		return nil, err
	}
	cfg.AccessTokenTTL = accessTTL
	cfg.RefreshTokenTTL = refreshTTL
	cfg.InvitationTTL = invitationTTL
	cfg.PasswordResetTTL = passwordResetTTL

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseDurationEnv(key string, fallback time.Duration) (time.Duration, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return 0, fmt.Errorf("invalid duration for %s: %w", key, err)
	}
	return d, nil
}
