package handlers

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/httpx"
	"github.com/kenoma/backend/internal/services/workstreams"
)

type changeLogResponse struct {
	ID                string  `json:"id"`
	WorkstreamID      string  `json:"workstream_id"`
	Seq               int64   `json:"seq"`
	ParentChangeLogID *string `json:"parent_change_log_id"`
	Message           string  `json:"message"`
	Title             string  `json:"title"`
	ContentMarkdown   *string `json:"content_markdown,omitempty"`
	CreatedBy         string  `json:"created_by"`
	CreatedAt         string  `json:"created_at"`
}

func toChangeLogResponse(log db.ChangeLog, includeContent bool) changeLogResponse {
	var parent *string
	if log.ParentChangeLogID.Valid {
		value := log.ParentChangeLogID.UUID.String()
		parent = &value
	}
	var content *string
	if includeContent {
		value := log.ContentMarkdown
		content = &value
	}
	return changeLogResponse{
		ID: log.ID.String(), WorkstreamID: log.WorkstreamID.String(), Seq: log.Seq,
		ParentChangeLogID: parent, Message: log.Message, Title: log.Title,
		ContentMarkdown: content, CreatedBy: log.CreatedBy.String(),
		CreatedAt: log.CreatedAt.Format(time.RFC3339Nano),
	}
}

type workstreamResponse struct {
	ID             string              `json:"id"`
	DocumentID     string              `json:"document_id"`
	OwnerID        string              `json:"owner_id"`
	Name           string              `json:"name"`
	BaseRevisionID string              `json:"base_revision_id"`
	Status         string              `json:"status"`
	Logs           []changeLogResponse `json:"change_logs"`
	CreatedAt      string              `json:"created_at"`
	UpdatedAt      string              `json:"updated_at"`
}

// The list carries who owns each branch and how much is on it, but no log
// bodies: choosing a branch should not download every checkpoint in it.
type workstreamSummaryResponse struct {
	ID             string `json:"id"`
	DocumentID     string `json:"document_id"`
	OwnerID        string `json:"owner_id"`
	OwnerName      string `json:"owner_name"`
	Name           string `json:"name"`
	BaseRevisionID string `json:"base_revision_id"`
	Status         string `json:"status"`
	ChangeLogCount int64  `json:"change_log_count"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

func toWorkstreamResponse(detail workstreams.Detail) workstreamResponse {
	logs := make([]changeLogResponse, 0, len(detail.Logs))
	for i, log := range detail.Logs {
		logs = append(logs, toChangeLogResponse(log, i == len(detail.Logs)-1))
	}
	return workstreamResponse{
		ID: detail.Workstream.ID.String(), DocumentID: detail.Workstream.DocumentID.String(),
		OwnerID: detail.Workstream.OwnerID.String(), Name: detail.Workstream.Name,
		BaseRevisionID: detail.Workstream.BaseRevisionID.String(),
		Status:         detail.Workstream.Status, Logs: logs,
		CreatedAt: detail.Workstream.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt: detail.Workstream.UpdatedAt.Format(time.RFC3339Nano),
	}
}

func toWorkstreamSummaryResponse(summary workstreams.Summary) workstreamSummaryResponse {
	w := summary.Workstream
	return workstreamSummaryResponse{
		ID: w.ID.String(), DocumentID: w.DocumentID.String(), OwnerID: w.OwnerID.String(),
		OwnerName: summary.OwnerName, Name: w.Name,
		BaseRevisionID: w.BaseRevisionID.String(), Status: w.Status,
		ChangeLogCount: summary.ChangeLogCount,
		CreatedAt:      w.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt:      w.UpdatedAt.Format(time.RFC3339Nano),
	}
}

type createWorkstreamRequest struct {
	Name           string `json:"name"`
	BaseRevisionID string `json:"base_revision_id"`
}

func (s *Server) handleCreateWorkstream(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	var req createWorkstreamRequest
	if !decodeBody(w, r, &req) {
		return
	}
	var base *uuid.UUID
	if req.BaseRevisionID != "" {
		parsed, err := uuid.Parse(req.BaseRevisionID)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid base_revision_id")
			return
		}
		base = &parsed
	}
	detail, err := s.workstreamSvc.Create(r.Context(), userID, documentID, req.Name, base)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toWorkstreamResponse(detail))
}

func (s *Server) handleListWorkstreams(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	summaries, err := s.workstreamSvc.List(r.Context(), userID, documentID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]workstreamSummaryResponse, 0, len(summaries))
	for _, summary := range summaries {
		out = append(out, toWorkstreamSummaryResponse(summary))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetWorkstream(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	workstreamID, err := uuid.Parse(r.PathValue("workstreamId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid workstream id")
		return
	}
	detail, err := s.workstreamSvc.Get(r.Context(), userID, documentID, workstreamID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toWorkstreamResponse(detail))
}

type appendChangeLogRequest struct {
	ExpectedParentChangeLogID string `json:"expected_parent_change_log_id"`
	Message                   string `json:"message"`
	Title                     string `json:"title"`
	ContentMarkdown           string `json:"content_markdown"`
}

func (s *Server) handleAppendChangeLog(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	workstreamID, err := uuid.Parse(r.PathValue("workstreamId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid workstream id")
		return
	}
	var req appendChangeLogRequest
	if !decodeBodyLimit(w, r, &req, maxDocumentBody) {
		return
	}
	var parent *uuid.UUID
	if req.ExpectedParentChangeLogID != "" {
		parsed, err := uuid.Parse(req.ExpectedParentChangeLogID)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid expected_parent_change_log_id")
			return
		}
		parent = &parsed
	}
	log, err := s.workstreamSvc.Append(r.Context(), userID, documentID, workstreamID, workstreams.AppendParams{
		ExpectedParentID: parent, Message: req.Message, Title: req.Title, ContentMarkdown: req.ContentMarkdown,
	})
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toChangeLogResponse(log, true))
}

func (s *Server) handleAbandonWorkstream(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	workstreamID, err := uuid.Parse(r.PathValue("workstreamId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid workstream id")
		return
	}
	if err := s.workstreamSvc.Abandon(r.Context(), userID, documentID, workstreamID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleWorkstreamDiff(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	workstreamID, err := uuid.Parse(r.PathValue("workstreamId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid workstream id")
		return
	}
	var logID *uuid.UUID
	if raw := r.URL.Query().Get("change_log_id"); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid change_log_id")
			return
		}
		logID = &parsed
	}
	spans, err := s.workstreamSvc.Diff(r.Context(), userID, documentID, workstreamID, logID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, spansResponse{Spans: spans})
}

type reconcileDiffRequest struct {
	ContentMarkdown string `json:"content_markdown"`
}

func (s *Server) handleWorkstreamReconcileDiff(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	workstreamID, err := uuid.Parse(r.PathValue("workstreamId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid workstream id")
		return
	}
	var req reconcileDiffRequest
	if !decodeBodyLimit(w, r, &req, maxDocumentBody) {
		return
	}
	spans, err := s.workstreamSvc.ReconcileDiff(r.Context(), userID, documentID, workstreamID, req.ContentMarkdown)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, spansResponse{Spans: spans})
}
