package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/httpx"
	"github.com/kenoma/backend/internal/redline"
	"github.com/kenoma/backend/internal/services/crs"
)

// crSummaryResponse is the list shape: no snapshot body, since a document can
// carry many proposals and each body is up to a megabyte.
type crSummaryResponse struct {
	ID              string  `json:"id"`
	DocumentID      string  `json:"document_id"`
	ProjectID       string  `json:"project_id"`
	BaseRevisionID  string  `json:"base_revision_id"`
	Kind            string  `json:"kind"`
	Title           string  `json:"title"`
	Status          string  `json:"status"`
	OpenedBy        string  `json:"opened_by"`
	MergedBy        *string `json:"merged_by"`
	CloseNote       string  `json:"close_note"`
	HeadMatchesBase bool    `json:"head_matches_base"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
	ClosedAt        *string `json:"closed_at"`
	WorkstreamID    *string `json:"workstream_id"`
}

func toCRSummaryResponse(v crs.View) crSummaryResponse {
	return crResponseFields(v)
}

// crDetailResponse adds the proposal's full snapshot for the detail page,
// where the reviewer reads and resolves it.
type crDetailResponse struct {
	crSummaryResponse
	ContentMarkdown string `json:"content_markdown"`
}

func toCRDetailResponse(v crs.View) crDetailResponse {
	return crDetailResponse{crSummaryResponse: crResponseFields(v), ContentMarkdown: v.CR.ContentMarkdown}
}

func crResponseFields(v crs.View) crSummaryResponse {
	cr := v.CR
	mergedBy := (*string)(nil)
	if cr.MergedBy.Valid {
		s := cr.MergedBy.UUID.String()
		mergedBy = &s
	}
	closedAt := (*string)(nil)
	if cr.ClosedAt.Valid {
		s := cr.ClosedAt.Time.Format(time.RFC3339Nano)
		closedAt = &s
	}
	workstreamID := (*string)(nil)
	if cr.WorkstreamID.Valid {
		s := cr.WorkstreamID.UUID.String()
		workstreamID = &s
	}
	return crSummaryResponse{
		ID:              cr.ID.String(),
		DocumentID:      cr.DocumentID.String(),
		ProjectID:       v.Document.ProjectID.String(),
		BaseRevisionID:  cr.BaseRevisionID.String(),
		Kind:            cr.Kind,
		Title:           cr.Title,
		Status:          cr.Status,
		OpenedBy:        cr.OpenedBy.String(),
		MergedBy:        mergedBy,
		CloseNote:       cr.CloseNote,
		HeadMatchesBase: v.HeadMatchesBase,
		CreatedAt:       cr.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt:       cr.UpdatedAt.Format(time.RFC3339Nano),
		ClosedAt:        closedAt,
		WorkstreamID:    workstreamID,
	}
}

// Edit Change Requests can only be assembled from explicit Change Logs.
// Imports use the dedicated multipart document import route.
type openChangeRequestRequest struct {
	WorkstreamID              string `json:"workstream_id"`
	ExpectedLatestChangeLogID string `json:"expected_latest_change_log_id"`
}

func (s *Server) handleOpenChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	var req openChangeRequestRequest
	if err := httpx.DecodeJSONLimit(r, &req, maxDocumentBody); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	workstreamID, err := uuid.Parse(req.WorkstreamID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "workstream_id is required")
		return
	}
	latestID, err := uuid.Parse(req.ExpectedLatestChangeLogID)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "expected_latest_change_log_id is required")
		return
	}
	view, err := s.crSvc.OpenFromWorkstream(r.Context(), userID, documentID, workstreamID, latestID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toCRDetailResponse(view))
}

func (s *Server) handleListChangeLogsForChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	logs, err := s.crSvc.ListChangeLogs(r.Context(), userID, crID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]changeLogResponse, 0, len(logs))
	for _, log := range logs {
		out = append(out, toChangeLogResponse(log, false))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleDiffChangeLogForChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	logID, err := uuid.Parse(r.PathValue("changeLogId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid change log id")
		return
	}
	spans, err := s.crSvc.ChangeLogSpans(r.Context(), userID, crID, logID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, spansResponse{Spans: spans})
}

func (s *Server) handleListChangeRequestsForDocument(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	views, err := s.crSvc.ListForDocument(r.Context(), userID, documentID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]crSummaryResponse, 0, len(views))
	for _, v := range views {
		out = append(out, toCRSummaryResponse(v))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// crProjectResponse is the project-scoped list shape: the review queue adds
// each document's title so a row reads "open in <document>", which the
// document-scoped list never needs.
type crProjectResponse struct {
	ID            string  `json:"id"`
	DocumentID    string  `json:"document_id"`
	ProjectID     string  `json:"project_id"`
	DocumentTitle string  `json:"document_title"`
	Kind          string  `json:"kind"`
	Title         string  `json:"title"`
	Status        string  `json:"status"`
	OpenedBy      string  `json:"opened_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	WorkstreamID  *string `json:"workstream_id"`
}

func (s *Server) handleListOpenChangeRequestsForProject(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	rows, err := s.crSvc.ListOpenForProject(r.Context(), userID, projectID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]crProjectResponse, 0, len(rows))
	for _, row := range rows {
		workstreamID := (*string)(nil)
		if row.WorkstreamID.Valid {
			s := row.WorkstreamID.UUID.String()
			workstreamID = &s
		}
		out = append(out, crProjectResponse{
			ID:            row.ID.String(),
			DocumentID:    row.DocumentID.String(),
			ProjectID:     projectID.String(),
			DocumentTitle: row.DocumentTitle,
			Kind:          row.Kind,
			Title:         row.Title,
			Status:        row.Status,
			OpenedBy:      row.OpenedBy.String(),
			CreatedAt:     row.CreatedAt.Format(time.RFC3339Nano),
			UpdatedAt:     row.UpdatedAt.Format(time.RFC3339Nano),
			WorkstreamID:  workstreamID,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	view, err := s.crSvc.Get(r.Context(), userID, crID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toCRDetailResponse(view))
}

// mergeChangeRequestRequest carries an optional conflict resolution. When main
// still sits on the CR's base, both fields may be empty; when it has moved,
// resolved_content_markdown is required and becomes the merged revision.
type mergeChangeRequestRequest struct {
	ResolvedTitle           *string `json:"resolved_title"`
	ResolvedContentMarkdown *string `json:"resolved_content_markdown"`
}

func (s *Server) handleMergeChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	var req mergeChangeRequestRequest
	if err := httpx.DecodeJSONLimit(r, &req, maxDocumentBody); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	outcome, err := s.crSvc.Merge(r.Context(), userID, crID, req.ResolvedTitle, req.ResolvedContentMarkdown)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	resp := struct {
		crDetailResponse
		CreatedRevSeq int64 `json:"created_rev_seq"`
	}{toCRDetailResponse(outcome.View), outcome.CreatedRevSeq}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

type closeChangeRequestRequest struct {
	Note string `json:"note"`
}

func (s *Server) handleCloseChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	var req closeChangeRequestRequest
	if !decodeBody(w, r, &req) {
		return
	}
	view, err := s.crSvc.Close(r.Context(), userID, crID, req.Note)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toCRDetailResponse(view))
}

// handleDiffChangeRequest redlines the proposal against its base ("branch"),
// or live main against that same base ("main"), so a reviewer with a conflict
// sees both drifts side by side.
func (s *Server) handleDiffChangeRequest(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	side := r.URL.Query().Get("side")
	if side == "" {
		side = "branch"
	}
	spans, err := s.crSvc.SpansForSide(r.Context(), userID, crID, side)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, spansResponse{Spans: spans})
}

// --- Discussion ---

type commentResponse struct {
	ID         string          `json:"id"`
	ParentID   *string         `json:"parent_id"`
	CreatedBy  string          `json:"created_by"`
	Body       string          `json:"body"`
	DiffAnchor json.RawMessage `json:"diff_anchor"`
	CreatedAt  string          `json:"created_at"`
}

func toCommentResponse(c db.CrComment) commentResponse {
	parent := (*string)(nil)
	if c.ParentID.Valid {
		s := c.ParentID.UUID.String()
		parent = &s
	}
	anchor := json.RawMessage(c.DiffAnchor)
	if len(anchor) == 0 {
		anchor = json.RawMessage("{}")
	}
	return commentResponse{
		ID:         c.ID.String(),
		ParentID:   parent,
		CreatedBy:  c.CreatedBy.String(),
		Body:       c.Body,
		DiffAnchor: anchor,
		CreatedAt:  c.CreatedAt.Format(time.RFC3339Nano),
	}
}

func (s *Server) handleListCRComments(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	rows, err := s.crSvc.ListComments(r.Context(), userID, crID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]commentResponse, 0, len(rows))
	for _, c := range rows {
		out = append(out, toCommentResponse(c))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// addCommentRequest anchors by span range into the branch-side span list the
// diff endpoint produced. The server recomputes the context hash from its own
// spans, so a client cannot anchor a comment onto text that was never there.
type addCommentRequest struct {
	Body       string `json:"body"`
	ParentID   string `json:"parent_id"`
	OpIndex    *int   `json:"op_index"`
	OpEndIndex *int   `json:"op_end_index"`
}

func (s *Server) handleAddCRComment(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	var req addCommentRequest
	if !decodeBody(w, r, &req) {
		return
	}
	var parentID *uuid.UUID
	if req.ParentID != "" {
		parsed, err := uuid.Parse(req.ParentID)
		if err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid parent_id")
			return
		}
		parentID = &parsed
	}
	anchor := []byte(nil)
	if req.OpIndex != nil {
		spans, err := s.crSvc.SpansForSide(r.Context(), userID, crID, "branch")
		if err != nil {
			writeTenantError(w, err)
			return
		}
		end := *req.OpIndex
		if req.OpEndIndex != nil {
			end = *req.OpEndIndex
		}
		raw, err := redline.AnchorJSON(spans, *req.OpIndex, end)
		if err != nil {
			httpx.WriteError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		anchor = raw
	}
	comment, err := s.crSvc.AddComment(r.Context(), userID, crID, parentID, req.Body, anchor)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toCommentResponse(comment))
}

func (s *Server) handleDeleteCRComment(w http.ResponseWriter, r *http.Request) {
	userID, crID, ok := callerAndPathID(w, r, "changeRequestId")
	if !ok {
		return
	}
	commentID, err := uuid.Parse(r.PathValue("commentId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid comment id")
		return
	}
	if err := s.crSvc.DeleteComment(r.Context(), userID, crID, commentID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}
