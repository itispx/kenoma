package handlers

import (
	"errors"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/httpx"
	"github.com/kenoma/backend/internal/pandoc"
	"github.com/kenoma/backend/internal/redline"
	"github.com/kenoma/backend/internal/services/crs"
)

// maxDocumentBody sits above the service's own 1MB content limit so that an
// oversized save is rejected by the service, with a message saying so, rather
// than by the body reader failing mid-parse as a bare "invalid request body".
// The headroom covers JSON string escaping, which can inflate the payload.
const maxDocumentBody = 2 << 20

// maxUploadBytes caps a docx upload before pandoc ever sees it. A Word file
// of this size is far past any real document; the point is bounding memory,
// not judging anyone's prose.
const maxUploadBytes = 32 << 20

type documentResponse struct {
	ID              string  `json:"id"`
	ProjectID       string  `json:"project_id"`
	Title           string  `json:"title"`
	ContentMarkdown string  `json:"content_markdown"`
	HeadRevisionID  *string `json:"head_revision_id"`
	CreatedBy       string  `json:"created_by"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

func toDocumentResponse(d db.Document) documentResponse {
	var head *string
	if d.HeadRevisionID.Valid {
		value := d.HeadRevisionID.UUID.String()
		head = &value
	}
	return documentResponse{
		ID:              d.ID.String(),
		ProjectID:       d.ProjectID.String(),
		Title:           d.Title,
		ContentMarkdown: d.ContentMarkdown,
		HeadRevisionID:  head,
		CreatedBy:       d.CreatedBy.String(),
		CreatedAt:       d.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt:       d.UpdatedAt.Format(time.RFC3339Nano),
	}
}

// documentSummaryResponse is the list shape: no body, since a project's list
// page renders titles and would otherwise carry every document's full text.
type documentSummaryResponse struct {
	ID             string  `json:"id"`
	ProjectID      string  `json:"project_id"`
	Title          string  `json:"title"`
	HeadRevisionID *string `json:"head_revision_id"`
	CreatedBy      string  `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

func toDocumentSummaryResponse(d db.ListDocumentsForProjectRow) documentSummaryResponse {
	var head *string
	if d.HeadRevisionID.Valid {
		value := d.HeadRevisionID.UUID.String()
		head = &value
	}
	return documentSummaryResponse{
		ID:             d.ID.String(),
		ProjectID:      d.ProjectID.String(),
		Title:          d.Title,
		HeadRevisionID: head,
		CreatedBy:      d.CreatedBy.String(),
		CreatedAt:      d.CreatedAt.Format(time.RFC3339Nano),
		UpdatedAt:      d.UpdatedAt.Format(time.RFC3339Nano),
	}
}

type createDocumentRequest struct {
	Title string `json:"title"`
}

func (s *Server) handleCreateDocument(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	var req createDocumentRequest
	if !decodeBody(w, r, &req) {
		return
	}
	doc, err := s.documentSvc.Create(r.Context(), userID, projectID, req.Title)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toDocumentResponse(doc))
}

type saveInitialVersionRequest struct {
	Title           string `json:"title"`
	ContentMarkdown string `json:"content_markdown"`
}

func (s *Server) handleSaveInitialVersion(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	var req saveInitialVersionRequest
	if !decodeBodyLimit(w, r, &req, maxDocumentBody) {
		return
	}
	doc, err := s.documentSvc.SaveInitialVersion(
		r.Context(), userID, documentID, req.Title, req.ContentMarkdown,
	)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toDocumentResponse(doc))
}

func (s *Server) handleListDocuments(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	rows, err := s.documentSvc.ListForProject(r.Context(), userID, projectID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]documentSummaryResponse, 0, len(rows))
	for _, d := range rows {
		out = append(out, toDocumentSummaryResponse(d))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetDocument(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	doc, err := s.documentSvc.Get(r.Context(), userID, documentID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toDocumentResponse(doc))
}

func (s *Server) handleDeleteDocument(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	if err := s.documentSvc.SoftDelete(r.Context(), userID, documentID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

func (s *Server) handleRestoreDocument(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	if err := s.documentSvc.Restore(r.Context(), userID, documentID); err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteStatus(w, http.StatusNoContent)
}

// --- Revisions (main's immutable history) ---

type revisionSummaryResponse struct {
	ID        string `json:"id"`
	Seq       int64  `json:"seq"`
	Title     string `json:"title"`
	CreatedBy string `json:"created_by"`
	CreatedAt string `json:"created_at"`
}

type revisionResponse struct {
	ID              string `json:"id"`
	DocumentID      string `json:"document_id"`
	Seq             int64  `json:"seq"`
	Title           string `json:"title"`
	ContentMarkdown string `json:"content_markdown"`
	CreatedBy       string `json:"created_by"`
	CreatedAt       string `json:"created_at"`
}

func (s *Server) handleListRevisions(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	rows, err := s.documentSvc.ListRevisions(r.Context(), userID, documentID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	out := make([]revisionSummaryResponse, 0, len(rows))
	for _, rev := range rows {
		out = append(out, revisionSummaryResponse{
			ID:        rev.ID.String(),
			Seq:       rev.Seq,
			Title:     rev.Title,
			CreatedBy: rev.CreatedBy.String(),
			CreatedAt: rev.CreatedAt.Format(time.RFC3339Nano),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (s *Server) handleGetRevision(w http.ResponseWriter, r *http.Request) {
	userID, documentID, revisionID, ok := documentScopedIDs(w, r)
	if !ok {
		return
	}
	rev, err := s.documentSvc.GetRevision(r.Context(), userID, documentID, revisionID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, revisionResponse{
		ID:              rev.ID.String(),
		DocumentID:      rev.DocumentID.String(),
		Seq:             rev.Seq,
		Title:           rev.Title,
		ContentMarkdown: rev.ContentMarkdown,
		CreatedBy:       rev.CreatedBy.String(),
		CreatedAt:       rev.CreatedAt.Format(time.RFC3339Nano),
	})
}

// handleDiffRevisions redlines any two snapshots on demand. The pair comes
// from immutable rows, so the answer cannot go stale no matter how much main
// moves afterwards.
func (s *Server) handleDiffRevisions(w http.ResponseWriter, r *http.Request) {
	userID, documentID, _, ok := documentScopedIDs(w, r)
	if !ok {
		return
	}
	from, err := uuid.Parse(r.URL.Query().Get("from"))
	to, toErr := uuid.Parse(r.URL.Query().Get("to"))
	if err != nil || toErr != nil {
		httpx.WriteError(w, http.StatusBadRequest, "from and to must be revision ids")
		return
	}
	spans, err := s.documentSvc.DiffRevisions(r.Context(), userID, documentID, from, to)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, spansResponse{Spans: spans})
}

type spansResponse struct {
	Spans []redline.Span `json:"spans"`
}

// handleExportRevision streams one immutable revision as a docx or PDF file,
// gated on the docs:export permission. The download lands straight on disk:
// there is no envelope to unwrap, the bytes are the point.
func (s *Server) handleExportRevision(w http.ResponseWriter, r *http.Request) {
	userID, documentID, revisionID, ok := documentScopedIDs(w, r)
	if !ok {
		return
	}
	format := r.URL.Query().Get("format")
	if format != "docx" && format != "pdf" {
		httpx.WriteError(w, http.StatusBadRequest, "format must be docx or pdf")
		return
	}
	rev, err := s.documentSvc.ExportRevision(r.Context(), userID, documentID, revisionID)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	var (
		data        []byte
		contentType string
	)
	switch format {
	case "docx":
		data, err = pandoc.MarkdownToDocx(s.cfg.PandocPath, []byte(rev.ContentMarkdown))
		contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case "pdf":
		// An unset engine would silently fall back to pandoc's pdflatex, which
		// no image in this project installs. Say so instead of failing deep in
		// pandoc with a LaTeX-flavored error nobody can act on.
		if s.cfg.PandocPDFEngine == "" {
			httpx.WriteError(w, http.StatusServiceUnavailable,
				"PDF export needs a PDF engine; set PANDOC_PDF_ENGINE")
			return
		}
		data, err = pandoc.MarkdownToPDF(s.cfg.PandocPath, s.cfg.PandocPDFEngine, []byte(rev.ContentMarkdown))
		contentType = "application/pdf"
	}
	if err != nil {
		// Export failures are pandoc problems, but the docx-import wording in
		// writeTenantError would misdescribe a failed PDF render.
		switch {
		case errors.Is(err, pandoc.ErrUnavailable):
			httpx.WriteError(w, http.StatusServiceUnavailable, "document conversion is unavailable right now")
		case errors.Is(err, pandoc.ErrConversion):
			httpx.WriteError(w, http.StatusUnprocessableEntity, "could not export this revision")
		default:
			httpx.WriteError(w, http.StatusInternalServerError, "internal server error")
		}
		return
	}
	httpx.ServeFileAttachment(w, exportFilename(rev.Title, rev.Seq, format), contentType, data)
}

// exportFilename builds a download name the browser will show when saving:
// "<title>-rev<seq>.docx". Characters unsafe in filenames are replaced.
func exportFilename(title string, seq int64, format string) string {
	clean := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		case r == ' ':
			return '-'
		default:
			return -1
		}
	}, strings.TrimSpace(title))
	if clean == "" {
		clean = "document"
	}
	return clean + "-rev" + strconv.FormatInt(seq, 10) + "." + format
}

// documentScopedIDs pulls both path segments of the nested revision routes.
func documentScopedIDs(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, uuid.UUID, bool) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}
	revisionID, err := uuid.Parse(r.PathValue("revisionId"))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid revision id")
		return uuid.Nil, uuid.Nil, uuid.Nil, false
	}
	return userID, documentID, revisionID, true
}

// --- Imports (docx upload) ---

// readUpload reads one multipart file field under a hard size cap. The cap is
// enforced twice over: MaxBytesReader bounds the whole body, and LimitReader
// stops reading after max so one giant field cannot buffer fully.
func readUpload(w http.ResponseWriter, r *http.Request, field string, maxBytes int64) ([]byte, string, bool) {
	r.Body = http.MaxBytesReader(nil, r.Body, maxBytes+(1<<20))
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "expected a multipart form")
		return nil, "", false
	}
	file, header, err := r.FormFile(field)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "missing file field "+field)
		return nil, "", false
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "could not read the uploaded file")
		return nil, "", false
	}
	if int64(len(data)) > maxBytes {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "the uploaded file is too large")
		return nil, "", false
	}
	return data, header.Filename, true
}

// titleFromFilename derives a document title from an uploaded file name:
// "Q3 Policy v2.docx" becomes "Q3 Policy v2". Anything unusable falls back to
// a plain label the user can rename later through a Change Request.
func titleFromFilename(name string) string {
	base := path.Base(name)
	title := strings.TrimSpace(strings.TrimSuffix(base, path.Ext(base)))
	if title == "" || title == "." || title == "/" {
		return "Imported document"
	}
	return title
}

// handleImportDocument turns an uploaded docx into a brand new document whose
// first revision is its converted Markdown. There is nothing to diff against
// yet, so main starts here directly rather than through a Change Request.
func (s *Server) handleImportDocument(w http.ResponseWriter, r *http.Request) {
	userID, projectID, ok := callerAndPathID(w, r, "projectId")
	if !ok {
		return
	}
	data, filename, ok := readUpload(w, r, "file", maxUploadBytes)
	if !ok {
		return
	}
	markdown, err := pandoc.DocxToMarkdown(s.cfg.PandocPath, data)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	doc, err := s.documentSvc.CreateFromImport(r.Context(), userID, projectID, titleFromFilename(filename), markdown)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toDocumentResponse(doc))
}

// handleImportRevision uploads a docx as a proposed new version of an
// existing document: it converts, then opens an import Change Request against
// current head, exactly like a browser branch would.
func (s *Server) handleImportRevision(w http.ResponseWriter, r *http.Request) {
	userID, documentID, ok := callerAndPathID(w, r, "documentId")
	if !ok {
		return
	}
	data, filename, ok := readUpload(w, r, "file", maxUploadBytes)
	if !ok {
		return
	}
	markdown, err := pandoc.DocxToMarkdown(s.cfg.PandocPath, data)
	if err != nil {
		writeTenantError(w, err)
		return
	}
	view, err := s.crSvc.Open(r.Context(), userID, documentID, crs.OpenParams{
		Title:           titleFromFilename(filename),
		ContentMarkdown: markdown,
		Kind:            crs.KindImport,
	})
	if err != nil {
		writeTenantError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, toCRDetailResponse(view))
}
