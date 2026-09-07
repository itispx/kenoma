// Package redline computes text-level differences between two Markdown
// strings as a flat list of inline spans. The product deliberately diffs raw
// Markdown text rather than rendered HTML: splitting rich syntax mid-token at
// a diff boundary corrupts content, while a plainer redline never can.
package redline

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"regexp"

	"github.com/pmezard/go-difflib/difflib"
)

const (
	OpPlain = "plain"
	OpIns   = "ins"
	OpDel   = "del"
)

// Span is one run of text in reading order. ins spans exist only in the
// target string, del spans only in the base, plain in both.
type Span struct {
	Op   string `json:"op"`
	Text string `json:"text"`
}

// Anchor is where a discussion comment sits on a redline. It covers the span
// range [op_index, op_end_index] of the computed span list, since a reviewer
// highlights a passage with the mouse and a passage rarely stops at a span
// boundary. context_hash fingerprints the covered text so the client can tell
// when the diff has shifted underneath an old comment. Anchors written before
// ranges existed decode with op_end_index 0, which reads as the single span
// at op_index.
type Anchor struct {
	OpIndex     int    `json:"op_index"`
	OpEndIndex  int    `json:"op_end_index"`
	ContextHash string `json:"context_hash"`
}

// End is the last span this anchor covers, tolerating both legacy anchors and
// a reversed range.
func (a Anchor) End() int {
	if a.OpEndIndex < a.OpIndex {
		return a.OpIndex
	}
	return a.OpEndIndex
}

var tokenRe = regexp.MustCompile(`\s+|\w+|[^\s\w]`)

// Spans diffs base into target. Tokens are words, whitespace runs, and single
// punctuation marks, which is coarse enough to stay stable across re-wrapped
// paragraphs yet fine enough for a readable inline redline.
func Spans(base, target string) []Span {
	baseIdx := tokenRe.FindAllStringIndex(base, -1)
	targetIdx := tokenRe.FindAllStringIndex(target, -1)
	sub := func(idx [][]int, s string) []string {
		out := make([]string, len(idx))
		for i, pair := range idx {
			out[i] = s[pair[0]:pair[1]]
		}
		return out
	}

	m := difflib.NewMatcher(sub(baseIdx, base), sub(targetIdx, target))
	spans := make([]Span, 0, len(m.GetOpCodes()))
	slice := func(idx [][]int, s string, lo, hi int) string {
		if lo >= hi {
			return ""
		}
		return s[idx[lo][0]:idx[hi-1][1]]
	}
	for _, oc := range m.GetOpCodes() {
		switch oc.Tag {
		case 'e':
			spans = append(spans, Span{OpPlain, slice(baseIdx, base, oc.I1, oc.I2)})
		case 'r':
			spans = append(spans, Span{OpDel, slice(baseIdx, base, oc.I1, oc.I2)})
			spans = append(spans, Span{OpIns, slice(targetIdx, target, oc.J1, oc.J2)})
		case 'd':
			spans = append(spans, Span{OpDel, slice(baseIdx, base, oc.I1, oc.I2)})
		case 'i':
			spans = append(spans, Span{OpIns, slice(targetIdx, target, oc.J1, oc.J2)})
		}
	}
	return merge(spans)
}

// merge collapses adjacent runs of the same op so a rewritten paragraph shows
// as one del plus one ins rather than dozens of fragments.
func merge(spans []Span) []Span {
	out := make([]Span, 0, len(spans))
	for _, sp := range spans {
		if sp.Text == "" {
			continue
		}
		if n := len(out); n > 0 && out[n-1].Op == sp.Op {
			out[n-1].Text += sp.Text
			continue
		}
		out = append(out, sp)
	}
	return out
}

// ContextHash is the fingerprint stored alongside an anchor's index.
func ContextHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// AnchorJSON builds the value stored in cr_comment.diff_anchor. An index
// outside the span list anchors nothing, which callers treat as a general
// comment rather than an error.
func AnchorJSON(spans []Span, opIndex, opEndIndex int) ([]byte, error) {
	if opEndIndex < opIndex {
		opEndIndex = opIndex
	}
	if opEndIndex >= len(spans) {
		opEndIndex = len(spans) - 1
	}
	// Hashed over the whole covered passage, not just its first span: the
	// reviewer highlighted all of it, and any part of it changing is what
	// makes the comment's target stale.
	hash := ""
	if opIndex >= 0 && opIndex < len(spans) {
		covered := ""
		for i := opIndex; i <= opEndIndex; i++ {
			covered += spans[i].Text
		}
		hash = ContextHash(covered)
	}
	return json.Marshal(Anchor{OpIndex: opIndex, OpEndIndex: opEndIndex, ContextHash: hash})
}

// ParseAnchor decodes a stored anchor. Anything unreadable or nonsensical
// becomes a nil anchor, rendering as a comment with no inline position.
func ParseAnchor(raw []byte) *Anchor {
	var a Anchor
	if json.Unmarshal(raw, &a) != nil || a.OpIndex < 0 {
		return nil
	}
	return &a
}
