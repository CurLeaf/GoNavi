package app

import "strings"

const (
	maxXLSXRowsPerSheet     = 1048575
	defaultXLSXRowsPerSheet = maxXLSXRowsPerSheet
)

type ExportFileOptions struct {
	Format              string `json:"format"`
	XLSXMaxRowsPerSheet int    `json:"xlsxMaxRowsPerSheet,omitempty"`
	JobID               string `json:"jobId,omitempty"`
	TotalRowsHint       int64  `json:"totalRowsHint,omitempty"`
	TotalRowsKnown      bool   `json:"totalRowsKnown,omitempty"`
}

func normalizeExportFileOptions(format string, options ExportFileOptions) ExportFileOptions {
	resolvedFormat := strings.ToLower(strings.TrimSpace(format))
	if explicitFormat := strings.ToLower(strings.TrimSpace(options.Format)); explicitFormat != "" {
		resolvedFormat = explicitFormat
	}
	return ExportFileOptions{
		Format:              resolvedFormat,
		XLSXMaxRowsPerSheet: normalizeXLSXRowsPerSheet(options.XLSXMaxRowsPerSheet),
		JobID:               strings.TrimSpace(options.JobID),
		TotalRowsHint:       normalizeExportTotalRowsHint(options.TotalRowsHint, options.TotalRowsKnown),
		TotalRowsKnown:      options.TotalRowsKnown,
	}
}

func normalizeXLSXRowsPerSheet(value int) int {
	if value <= 0 {
		return defaultXLSXRowsPerSheet
	}
	if value > maxXLSXRowsPerSheet {
		return maxXLSXRowsPerSheet
	}
	return value
}

func normalizeExportTotalRowsHint(value int64, known bool) int64 {
	if !known {
		return 0
	}
	if value < 0 {
		return 0
	}
	return value
}
