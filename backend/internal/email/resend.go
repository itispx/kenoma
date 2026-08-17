package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const resendAPIURL = "https://api.resend.com/emails"

// ResendSender sends email via Resend's HTTP API directly — the API surface
// needed here is one POST endpoint, not enough to justify an SDK dependency.
type ResendSender struct {
	APIKey string
	From   string
}

func NewResendSender(apiKey, from string) *ResendSender {
	return &ResendSender{APIKey: apiKey, From: from}
}

func (s *ResendSender) Send(ctx context.Context, to, subject, htmlBody string) error {
	payload, err := json.Marshal(map[string]any{
		"from":    s.From,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendAPIURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend: unexpected status %d: %s", resp.StatusCode, body)
	}
	return nil
}
