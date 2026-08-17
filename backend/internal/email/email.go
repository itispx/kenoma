// Package email sends transactional email. Templating (subject/body content)
// is the caller's responsibility — Sender just delivers already-built content,
// so swapping providers never touches call sites.
package email

import (
	"context"
	"log"
)

type Sender interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
}

// NoopSender logs instead of sending — used in local dev when no Resend API
// key is configured, so auth flows still work without a live email account.
type NoopSender struct{}

func (NoopSender) Send(_ context.Context, to, subject, htmlBody string) error {
	log.Printf("email (noop): to=%s subject=%q body=%s", to, subject, htmlBody)
	return nil
}
