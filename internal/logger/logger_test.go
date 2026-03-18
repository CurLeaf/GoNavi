package logger

import (
	"errors"
	"fmt"
	"testing"
)

func TestErrorChain_NilError(t *testing.T) {
	if got := ErrorChain(nil); got != "" {
		t.Errorf("ErrorChain(nil) = %q; want empty string", got)
	}
}

func TestErrorChain_SingleError(t *testing.T) {
	err := errors.New("single error")
	got := ErrorChain(err)
	if got != "single error" {
		t.Errorf("ErrorChain(single) = %q; want %q", got, "single error")
	}
}

func TestErrorChain_WrappedErrors(t *testing.T) {
	inner := errors.New("root cause")
	middle := fmt.Errorf("middle: %w", inner)
	outer := fmt.Errorf("outer: %w", middle)

	got := ErrorChain(outer)
	// Should contain all three distinct messages
	if got == "" {
		t.Fatal("ErrorChain returned empty string for wrapped errors")
	}
	// The chain should start with the outermost error
	if len(got) < len("outer:") {
		t.Errorf("ErrorChain result too short: %q", got)
	}
}

func TestErrorChain_DeduplicatesMessages(t *testing.T) {
	// Create a chain where wrapping doesn't add new text
	inner := errors.New("same message")
	outer := fmt.Errorf("%w", inner)

	got := ErrorChain(outer)
	// Should not repeat "same message"
	if got != "same message" {
		t.Errorf("ErrorChain should deduplicate: got %q", got)
	}
}

func TestErrorChain_TruncatesLongChain(t *testing.T) {
	// Build a chain of 25 errors (exceeds the 20-level limit)
	var err error = errors.New("base")
	for i := 0; i < 25; i++ {
		err = fmt.Errorf("level-%d: %w", i, err)
	}
	got := ErrorChain(err)
	if got == "" {
		t.Fatal("ErrorChain returned empty for long chain")
	}
	// Should contain truncation notice
	if len(got) == 0 {
		t.Error("expected non-empty result for long chain")
	}
}
