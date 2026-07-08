package webserver

import (
	"errors"
	"strings"
	"testing"
	"time"
)

func TestHashPasswordAndVerify(t *testing.T) {
	hash, err := hashPassword("strong-password-123")
	if err != nil {
		t.Fatalf("hashPassword failed: %v", err)
	}
	if !verifyPassword(hash, "strong-password-123") {
		t.Fatalf("expected password verification to succeed")
	}
	if verifyPassword(hash, "wrong-password") {
		t.Fatalf("expected password verification to fail for wrong password")
	}
}

func TestTOTPValidationAcceptsCurrentWindow(t *testing.T) {
	secret := "JBSWY3DPEHPK3PXP"
	now := time.Unix(1_720_000_000, 0).UTC()
	code, err := generateTOTPCodeAt(secret, now)
	if err != nil {
		t.Fatalf("generateTOTPCodeAt failed: %v", err)
	}
	if !validateTOTPCode(secret, code, now) {
		t.Fatalf("expected TOTP validation to accept current time window")
	}
	if validateTOTPCode(secret, "000000", now) {
		t.Fatalf("expected TOTP validation to reject invalid code")
	}
}

func TestConsumeRecoveryCodeRemovesUsedCode(t *testing.T) {
	cfg := normalizeWebAuthConfig(webAuthConfig{
		Enabled:            true,
		TOTPEnabled:        true,
		RecoveryCodeHashes: []string{hashRecoveryCode("ABCD-EFGH-IJKL"), hashRecoveryCode("MNOP-QRST-UVWX")},
	})

	next, consumed := consumeRecoveryCode(cfg, "abcd efgh ijkl")
	if !consumed {
		t.Fatalf("expected recovery code to be consumed")
	}
	if len(next.RecoveryCodeHashes) != 1 {
		t.Fatalf("expected one recovery code to remain, got %d", len(next.RecoveryCodeHashes))
	}
	if next.RecoveryCodeHashes[0] != hashRecoveryCode("MNOP-QRST-UVWX") {
		t.Fatalf("unexpected remaining recovery code hash: %q", next.RecoveryCodeHashes[0])
	}
}

func TestWebSessionManagerExpiresIdleAndAbsolute(t *testing.T) {
	manager := newWebSessionManager()
	cfg := normalizeWebAuthConfig(webAuthConfig{
		Enabled:              true,
		PasswordHash:         "hash",
		SessionIdleMinutes:   5,
		SessionAbsoluteHours: 1,
		SessionRememberDays:  1,
	})
	start := time.Unix(1_720_000_000, 0).UTC()
	sessionID, err := manager.Create(cfg, start)
	if err != nil {
		t.Fatalf("create session failed: %v", err)
	}
	if !manager.Authenticate(sessionID, cfg, start.Add(4*time.Minute)) {
		t.Fatalf("expected session to remain valid before idle timeout")
	}
	if manager.Authenticate(sessionID, cfg, start.Add(10*time.Minute)) {
		t.Fatalf("expected session to expire after idle timeout")
	}

	sessionID, err = manager.Create(cfg, start)
	if err != nil {
		t.Fatalf("create session failed: %v", err)
	}
	if manager.Authenticate(sessionID, cfg, start.Add(2*time.Hour)) {
		t.Fatalf("expected session to expire after absolute timeout")
	}
}

func TestGenerateQRCodeDataURL(t *testing.T) {
	dataURL, err := generateQRCodeDataURL("otpauth://totp/GoNavi:admin%40localhost?secret=JBSWY3DPEHPK3PXP&issuer=GoNavi")
	if err != nil {
		t.Fatalf("generateQRCodeDataURL failed: %v", err)
	}
	if !strings.HasPrefix(dataURL, "data:image/png;base64,") {
		t.Fatalf("unexpected QR code data URL prefix: %q", dataURL)
	}
}

func TestWebAuthManagerChangePasswordRotatesSession(t *testing.T) {
	manager, err := newWebAuthManager(t.TempDir())
	if err != nil {
		t.Fatalf("newWebAuthManager failed: %v", err)
	}
	now := time.Unix(1_720_000_000, 0).UTC()
	manager.now = func() time.Time { return now }

	setup, err := manager.BeginSetup("127.0.0.1:34115")
	if err != nil {
		t.Fatalf("BeginSetup failed: %v", err)
	}
	code, err := generateTOTPCodeAt(setup.Secret, now)
	if err != nil {
		t.Fatalf("generateTOTPCodeAt failed: %v", err)
	}
	cfg, sessionID, err := manager.CompleteSetup(setup.SetupToken, "strong-password-123", code, true, 30, 24, 7)
	if err != nil {
		t.Fatalf("CompleteSetup failed: %v", err)
	}

	summary, err := manager.Settings()
	if err != nil {
		t.Fatalf("Settings failed: %v", err)
	}
	if !summary.Configured || !summary.TOTPEnabled {
		t.Fatalf("unexpected settings summary: %+v", summary)
	}
	if summary.RecoveryCodesRemaining != 8 {
		t.Fatalf("expected 8 recovery codes, got %d", summary.RecoveryCodesRemaining)
	}

	nextCfg, nextSessionID, usedRecoveryCode, err := manager.ChangePassword("strong-password-123", code, "strong-password-456")
	if err != nil {
		t.Fatalf("ChangePassword failed: %v", err)
	}
	if usedRecoveryCode {
		t.Fatalf("expected TOTP code path instead of recovery code")
	}
	if sessionID == nextSessionID || strings.TrimSpace(nextSessionID) == "" {
		t.Fatalf("expected ChangePassword to rotate the session, old=%q new=%q", sessionID, nextSessionID)
	}
	if manager.sessions.Authenticate(sessionID, cfg, now) {
		t.Fatalf("expected previous session to be invalidated after password change")
	}
	if !manager.sessions.Authenticate(nextSessionID, nextCfg, now) {
		t.Fatalf("expected rotated session to remain valid")
	}
	if !verifyPassword(nextCfg.PasswordHash, "strong-password-456") {
		t.Fatalf("expected new password hash to validate")
	}
	if verifyPassword(nextCfg.PasswordHash, "strong-password-123") {
		t.Fatalf("expected previous password to stop validating")
	}

	if _, _, _, _, err := manager.Login("strong-password-123", code, ""); !errors.Is(err, errWebAuthInvalidCredentials) {
		t.Fatalf("expected old password login to fail with invalid credentials, got %v", err)
	}
	if _, _, _, _, err := manager.Login("strong-password-456", code, ""); err != nil {
		t.Fatalf("expected new password login to succeed, got %v", err)
	}
}

func TestWebAuthManagerChangePasswordConsumesRecoveryCode(t *testing.T) {
	manager, err := newWebAuthManager(t.TempDir())
	if err != nil {
		t.Fatalf("newWebAuthManager failed: %v", err)
	}
	now := time.Unix(1_720_000_123, 0).UTC()
	manager.now = func() time.Time { return now }

	setup, err := manager.BeginSetup("127.0.0.1:34115")
	if err != nil {
		t.Fatalf("BeginSetup failed: %v", err)
	}
	code, err := generateTOTPCodeAt(setup.Secret, now)
	if err != nil {
		t.Fatalf("generateTOTPCodeAt failed: %v", err)
	}
	if _, _, err := manager.CompleteSetup(setup.SetupToken, "strong-password-123", code, true, 30, 24, 7); err != nil {
		t.Fatalf("CompleteSetup failed: %v", err)
	}

	_, _, usedRecoveryCode, err := manager.ChangePassword("strong-password-123", setup.RecoveryCodes[0], "strong-password-456")
	if err != nil {
		t.Fatalf("ChangePassword failed: %v", err)
	}
	if !usedRecoveryCode {
		t.Fatalf("expected recovery code usage to be reported")
	}

	summary, err := manager.Settings()
	if err != nil {
		t.Fatalf("Settings failed: %v", err)
	}
	if summary.RecoveryCodesRemaining != 7 {
		t.Fatalf("expected one recovery code to be consumed, got %d remaining", summary.RecoveryCodesRemaining)
	}
}
