package syncjob

import (
	"strings"
	"testing"
)

func TestParseCronScheduleFiveFields(t *testing.T) {
	t.Parallel()

	accepted := []string{
		"0 3 * * *",
		"*/5 * * * *",
		"0 0 1 * *",
		"30 9 * * 1-5",
		"0 0 1 1 *",
		"0,15,30,45 * * * *",
		"0 22 * * 0,6",
		"0 22 * * 7",
		"0 0 */2 * *",
		"  0 3 * * *  ",
		"0\t3\t*\t*\t*",
	}
	for _, expression := range accepted {
		expression := expression
		t.Run("accept "+expression, func(t *testing.T) {
			t.Parallel()
			if _, err := parseCronSchedule(expression, "Asia/Shanghai"); err != nil {
				t.Fatalf("parseCronSchedule(%q) = %v, want nil", expression, err)
			}
		})
	}
}

func TestParseCronScheduleRejectsFieldCount(t *testing.T) {
	t.Parallel()

	rejected := []string{
		"0 0 3 * * *",
		"*/5 * * * * *",
		"0 3 * *",
		"0 3 * * * * *",
	}
	for _, expression := range rejected {
		expression := expression
		t.Run(expression, func(t *testing.T) {
			t.Parallel()
			_, err := parseCronSchedule(expression, "Asia/Shanghai")
			if err == nil {
				t.Fatalf("parseCronSchedule(%q) succeeded, want field-count error", expression)
			}
			if !strings.Contains(err.Error(), "five fields") {
				t.Fatalf("parseCronSchedule(%q) = %v, want five-field diagnostic", expression, err)
			}
		})
	}
}

func TestParseCronScheduleRejectsMalformedFields(t *testing.T) {
	t.Parallel()

	rejected := []string{
		"60 3 * * *",
		"0 24 * * *",
		"0 3 0 * *",
		"0 3 32 * *",
		"0 3 * 13 *",
		"0 3 * * 8",
		"0 3 * * 1-8",
		"0 3 * * 5-1",
		"abc 3 * * *",
		"0 3 * * MON",
		"0 3 */0 * *",
		"0 3 */x * *",
		"0,,3 * * * *",
		"0 3 1-2-3 * *",
		"0 3 -5 * *",
	}
	for _, expression := range rejected {
		expression := expression
		t.Run(expression, func(t *testing.T) {
			t.Parallel()
			if _, err := parseCronSchedule(expression, "UTC"); err == nil {
				t.Fatalf("parseCronSchedule(%q) succeeded, want invalid field", expression)
			}
		})
	}
}
