package httpx

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type Status struct {
	Ok   bool `json:"ok"`
	Code int  `json:"code"`
}

type DataResponse[T any] struct {
	Status Status `json:"status"`
	Data   T      `json:"data"`
}

type StatusResponse struct {
	Status Status `json:"status"`
}

type ErrorBody struct {
	Message string `json:"message"`
}

type ErrorResponse struct {
	Status Status    `json:"status"`
	Error  ErrorBody `json:"error"`
}

func WriteStatus(w http.ResponseWriter, status int) {
	writeEnvelope(w, status, StatusResponse{
		Status: Status{Ok: status < 400, Code: status},
	})
}

func WriteJSON[T any](w http.ResponseWriter, status int, v T) {
	writeEnvelope(w, status, DataResponse[T]{
		Status: Status{Ok: status < 400, Code: status},
		Data:   v,
	})
}

func WriteError(w http.ResponseWriter, status int, msg string) {
	writeEnvelope(w, status, ErrorResponse{
		Status: Status{Ok: false, Code: status},
		Error:  ErrorBody{Message: msg},
	})
}

func writeEnvelope(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("httpx: failed to encode response: %v", err)
	}
}

func DecodeJSON(r *http.Request, dst any) error {
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

// func ServeFileAttachment(w http.ResponseWriter, r *http.Request, path, filename string) {
// 	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
// 	http.ServeFile(w, r, path)
// }
