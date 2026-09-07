// Package pandoc shells out to the pandoc binary for docx conversion. The
// conversion runs synchronously in the request, which the product accepts at
// current scale, so the timeout here is the only thing keeping a pathological
// file from holding a worker forever.
package pandoc

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

var (
	// ErrUnavailable means the binary itself could not start: not installed,
	// wrong path, or not executable. The handler turns this into 503.
	ErrUnavailable = errors.New("pandoc is not available")
	// ErrConversion means pandoc ran and refused the input. The handler turns
	// this into 422, since the upload is the thing at fault.
	ErrConversion = errors.New("pandoc could not convert this document")
)

const convertTimeout = 60 * time.Second

// runPandoc pipes input through the pandoc binary with the given arguments
// and returns its stdout. A binary that cannot start maps to ErrUnavailable;
// pandoc refusing the input maps to ErrConversion with the first stderr line.
func runPandoc(pandocPath string, args []string, input []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), convertTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, pandocPath, args...)
	cmd.Stdin = bytes.NewReader(input)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("%w: conversion timed out", ErrConversion)
		}
		// A missing binary fails before any process exists; anything else is
		// pandoc speaking about the file it was handed.
		if _, lookErr := exec.LookPath(pandocPath); lookErr != nil {
			return nil, ErrUnavailable
		}
		return nil, fmt.Errorf("%w: %s", ErrConversion, firstLine(errBuf.String()))
	}
	return out.Bytes(), nil
}

// DocxToMarkdown converts a Word document to GitHub-flavored Markdown.
// --wrap=none keeps paragraphs on single lines, which is what makes later
// text-level diffs line up instead of churning on re-wrapped prose.
func DocxToMarkdown(pandocPath string, docx []byte) (string, error) {
	out, err := runPandoc(pandocPath, []string{"-f", "docx", "-t", "gfm", "--wrap=none"}, docx)
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// MarkdownToDocx converts Markdown back to a Word document, the inverse of
// the import path. --wrap=none keeps the round trip stable so a re-import of
// the exported file diffs cleanly against the source.
func MarkdownToDocx(pandocPath string, markdown []byte) ([]byte, error) {
	return runPandoc(pandocPath, []string{"-f", "gfm", "-t", "docx", "--wrap=none"}, markdown)
}

// MarkdownToPDF renders Markdown to PDF through the configured PDF engine.
// The engine comes from the caller because pandoc's own default (pdflatex) is
// not installed in the environments this project targets; an empty engine
// simply leaves pandoc to its default, which will fail loudly and get mapped
// by the handler rather than silently producing nothing.
func MarkdownToPDF(pandocPath, pdfEngine string, markdown []byte) ([]byte, error) {
	args := []string{"-f", "gfm", "-t", "pdf"}
	if pdfEngine != "" {
		args = append(args, "--pdf-engine="+pdfEngine)
	}
	return runPandoc(pandocPath, args, markdown)
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}
