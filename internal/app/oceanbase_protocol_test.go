package app

import (
	"strings"
	"testing"
)

func TestStripOceanBaseConnectionParamsForCacheTrimsFragment(t *testing.T) {
	t.Parallel()

	got := stripOceanBaseConnectionParamsForCache("protocol=oracle&PREFETCH_ROWS=5000#dev-note")
	if strings.Contains(got, "dev-note") {
		t.Fatalf("expected fragment removed, got %q", got)
	}
	if !strings.Contains(got, "PREFETCH_ROWS=5000") {
		t.Fatalf("expected business param kept, got %q", got)
	}
	if strings.Contains(got, "protocol=") {
		t.Fatalf("expected protocol param stripped, got %q", got)
	}
}

func TestStripOceanBaseConnectionParamsForCacheTrimsLeadingQuestionMark(t *testing.T) {
	t.Parallel()

	got := stripOceanBaseConnectionParamsForCache("?protocol=oracle&timeout=10")
	if strings.Contains(got, "protocol=") {
		t.Fatalf("expected protocol param stripped, got %q", got)
	}
	if !strings.Contains(got, "timeout=10") {
		t.Fatalf("expected timeout kept, got %q", got)
	}
}
