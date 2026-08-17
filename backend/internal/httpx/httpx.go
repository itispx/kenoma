package httpx

import (
	"encoding/json"
	"fmt"
	"log"
	"mime"
	"net/http"
)

// Every response shares one envelope shape: a status block, plus either a
// data payload or an error. These types are internal to the package; callers
// go through WriteStatus, WriteJSON, and WriteError.
type status struct {
	Ok   bool `json:"ok"`
	Code int  `json:"code"`
}

type dataResponse[T any] struct {
	Status status `json:"status"`
	Data   T      `json:"data"`
}

type statusResponse struct {
	Status status `json:"status"`
}

type errorBody struct {
	Message string `json:"message"`
}

type errorResponse struct {
	Status status    `json:"status"`
	Error  errorBody `json:"error"`
}

func WriteStatus(w http.ResponseWriter, code int) {
	writeEnvelope(w, code, statusResponse{
		Status: status{Ok: code < 400, Code: code},
	})
}

func WriteJSON[T any](w http.ResponseWriter, code int, v T) {
	writeEnvelope(w, code, dataResponse[T]{
		Status: status{Ok: code < 400, Code: code},
		Data:   v,
	})
}

func WriteError(w http.ResponseWriter, code int, msg string) {
	writeEnvelope(w, code, errorResponse{
		Status: status{Ok: false, Code: code},
		Error:  errorBody{Message: msg},
	})
}

func writeEnvelope(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("httpx: failed to encode response: %v", err)
	}
}

// DecodeJSON reads a single JSON object from the request body.
//
// The Content-Type check is a CSRF defense, not just hygiene: a cross-site
// HTML form can only send x-www-form-urlencoded, multipart/form-data, or
// text/plain, and none of those trigger a CORS preflight — so such a request
// reaches the handler and runs. A text/plain form body can be crafted to be
// valid JSON (`<input name='{"a":"b","c":"' value='d"}'>`), which would
// otherwise parse here happily. Requiring application/json forces any
// attacker into a preflighted request, which CORS then blocks.
func DecodeJSON(r *http.Request, dst any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return fmt.Errorf("Content-Type must be application/json")
	}

	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20) // 1MB cap

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if dec.More() {
		return fmt.Errorf("request body must contain a single JSON object")
	}
	return nil
}
