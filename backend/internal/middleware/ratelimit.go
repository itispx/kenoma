package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/kenoma/backend/internal/httpx"
)

// RateLimiter is a fixed-window in-memory limiter keyed by the caller's
// address. A window starts on the first request seen, so a burst on minute
// boundaries can pass two windows back to back; that is fine for slowing a
// password guesser, which is the threat this exists for. In-memory is
// deliberate: the API is a single process today, and a shared counter would
// need Redis rather than a goroutine-local map.
type RateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	// key -> window start + count in that window. Pruned when the map grows
	// past the threshold so an attacker spraying many source IPs cannot grow
	// it without bound.
	byKey map[string]*windowEntry
}

type windowEntry struct {
	start time.Time
	count int
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{
		limit:  limit,
		window: window,
		byKey:  make(map[string]*windowEntry),
	}
}

// Allow reports whether the key may proceed now. A true return consumes one
// request from the current window; false means the limit is exhausted.
func (rl *RateLimiter) Allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	w, ok := rl.byKey[key]
	if !ok || now.Sub(w.start) >= rl.window {
		rl.byKey[key] = &windowEntry{start: now, count: 1}
		if !ok && len(rl.byKey) > 4096 {
			rl.prune(now)
		}
		return true
	}
	if w.count >= rl.limit {
		return false
	}
	w.count++
	return true
}

// prune drops every bucket whose window has fully elapsed. Called only when
// the map is large, so normal traffic never pays for it.
func (rl *RateLimiter) prune(now time.Time) {
	for key, w := range rl.byKey {
		if now.Sub(w.start) >= rl.window {
			delete(rl.byKey, key)
		}
	}
}

// RateLimit wraps a handler so each distinct caller address is allowed at most
// `limit` requests per `window`. trustProxy controls whether the client's
// address is read from X-Forwarded-For (true when a reverse proxy sits in
// front and sets it) or from the socket's RemoteAddr.
func RateLimit(rl *RateLimiter, trustProxy bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.Allow(clientAddr(r, trustProxy)) {
			httpx.WriteError(w, http.StatusTooManyRequests, "too many requests, try again shortly")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientAddr picks the address the limiter keys on. When a proxy is trusted,
// the leftmost X-Forwarded-For entry is the original client; otherwise the
// socket peer (RemoteAddr) is the only thing the server can see.
func clientAddr(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			if first, _, ok := strings.Cut(fwd, ","); ok {
				first = strings.TrimSpace(first)
				if first != "" {
					return first
				}
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
