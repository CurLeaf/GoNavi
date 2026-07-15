//go:build !darwin

package app

func setApplicationIconPNG(png []byte) error {
	// Dock icon updates are only supported on macOS for now.
	_ = png
	return nil
}
