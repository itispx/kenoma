package middleware

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/kenoma/backend/internal/httpx"
)

func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("panic handling %s %s: %v\n%s", r.Method, r.URL.Path, err, debug.Stack())
				httpx.WriteError(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}
