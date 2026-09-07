package app

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

const validBrandIconPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9dgAAAABJRU5ErkJggg=="

// Wails v2 packages build/appicon.png. Keep it aligned with the default
// 03-ribbon-graphite-glow brand instead of allowing Wails to restore its W icon.
const defaultBrandAppIconSHA256 = "7665b786544b7dae594f38f998c4e8cc8ff99c35f73d2a225884c12b0dc8d32e"

func TestWailsBuildIconMatchesDefaultBrand(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source path")
	}
	iconPath := filepath.Join(filepath.Dir(filename), "..", "..", "build", "appicon.png")
	data, err := os.ReadFile(iconPath)
	if err != nil {
		t.Fatalf("read Wails build icon: %v", err)
	}

	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode Wails build icon: %v", err)
	}
	if config.Width != 1024 || config.Height != 1024 {
		t.Fatalf("Wails build icon dimensions = %dx%d, want 1024x1024", config.Width, config.Height)
	}

	gotSHA256 := fmt.Sprintf("%x", sha256.Sum256(data))
	if gotSHA256 != defaultBrandAppIconSHA256 {
		t.Fatalf("Wails build icon SHA-256 = %s, want default GoNavi brand icon %s", gotSHA256, defaultBrandAppIconSHA256)
	}
}

func TestDecodeApplicationBrandIconPayloadAcceptsDataURLAndURLSafeBase64(t *testing.T) {
	want, err := base64.StdEncoding.DecodeString(validBrandIconPNGBase64)
	if err != nil {
		t.Fatalf("decode fixture: %v", err)
	}

	for name, payload := range map[string]string{
		"data URL": "data:image/png;base64,\n" + validBrandIconPNGBase64,
		"URL-safe": base64.RawURLEncoding.EncodeToString(want),
	} {
		t.Run(name, func(t *testing.T) {
			got, err := decodeApplicationBrandIconPayload(payload)
			if err != nil {
				t.Fatalf("decode payload: %v", err)
			}
			if string(got) != string(want) {
				t.Fatal("decoded payload did not match fixture")
			}
		})
	}
}

func TestDecodeApplicationBrandIconPayloadRejectsEmptyInvalidAndOversizedInput(t *testing.T) {
	if _, err := decodeApplicationBrandIconPayload("  "); !errors.Is(err, errApplicationBrandIconPayloadEmpty) {
		t.Fatalf("empty payload error = %v, want empty payload error", err)
	}

	invalidPNG := base64.StdEncoding.EncodeToString([]byte("not a PNG"))
	if _, err := decodeApplicationBrandIconPayload(invalidPNG); !errors.Is(err, errApplicationBrandIconPayloadInvalid) {
		t.Fatalf("invalid PNG error = %v, want invalid payload error", err)
	}

	overLimit := make([]byte, base64.StdEncoding.EncodedLen(applicationBrandIconMaxPNGBytes+1)+1)
	for index := range overLimit {
		overLimit[index] = 'A'
	}
	if _, err := decodeApplicationBrandIconPayload(string(overLimit)); !errors.Is(err, errApplicationBrandIconPayloadInvalid) {
		t.Fatalf("oversized payload error = %v, want invalid payload error", err)
	}
}
