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

// DocxToMarkdown converts a Word document to GitHub-flavored Markdown.
// --wrap=none keeps paragraphs on single lines, which is what makes later
// text-level diffs line up instead of churning on re-wrapped prose.
func DocxToMarkdown(pandocPath string, docx []byte) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), convertTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, pandocPath, "-f", "docx", "-t", "gfm", "--wrap=none")
	cmd.Stdin = bytes.NewReader(docx)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("%w: conversion timed out", ErrConversion)
		}
		// A missing binary fails before any process exists; anything else is
		// pandoc speaking about the file it was handed.
		if _, lookErr := exec.LookPath(pandocPath); lookErr != nil {
			return "", ErrUnavailable
		}
		return "", fmt.Errorf("%w: %s", ErrConversion, firstLine(errBuf.String()))
	}
	return out.String(), nil
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
