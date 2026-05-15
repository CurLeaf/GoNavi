package tlsconfig

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildClientConfigLoadsCAAndClientCertificate(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath, _ := writeSelfSignedCertificate(t, dir)

	cfg, err := BuildClientConfig(ClientConfigOptions{
		Enabled:  true,
		CAPath:   certPath,
		CertPath: certPath,
		KeyPath:  keyPath,
	})
	if err != nil {
		t.Fatalf("BuildClientConfig failed: %v", err)
	}
	if cfg == nil {
		t.Fatal("config is nil")
	}
	if cfg.RootCAs == nil {
		t.Fatal("RootCAs is nil")
	}
	if len(cfg.Certificates) != 1 {
		t.Fatalf("Certificates length = %d, want 1", len(cfg.Certificates))
	}
}

func TestBuildClientConfigLoadsDERCA(t *testing.T) {
	dir := t.TempDir()
	_, _, derBytes := writeSelfSignedCertificate(t, dir)
	derPath := filepath.Join(dir, "ca.cer")
	if err := os.WriteFile(derPath, derBytes, 0600); err != nil {
		t.Fatalf("write der cert: %v", err)
	}

	cfg, err := BuildClientConfig(ClientConfigOptions{
		Enabled: true,
		CAPath:  derPath,
	})
	if err != nil {
		t.Fatalf("BuildClientConfig failed: %v", err)
	}
	if cfg == nil {
		t.Fatal("config is nil")
	}
	if cfg.RootCAs == nil {
		t.Fatal("RootCAs is nil")
	}
}

func TestBuildClientConfigRequiresClientCertificateAndKeyTogether(t *testing.T) {
	_, err := BuildClientConfig(ClientConfigOptions{
		Enabled:  true,
		CertPath: "client.pem",
	})
	if err == nil {
		t.Fatal("expected error")
	}
}

func writeSelfSignedCertificate(t *testing.T, dir string) (string, string, []byte) {
	t.Helper()

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName: "GoNavi Test",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth, x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	certPath := filepath.Join(dir, "cert.pem")
	certFile, err := os.Create(certPath)
	if err != nil {
		t.Fatalf("create cert file: %v", err)
	}
	if err := pem.Encode(certFile, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		_ = certFile.Close()
		t.Fatalf("write cert: %v", err)
	}
	if err := certFile.Close(); err != nil {
		t.Fatalf("close cert file: %v", err)
	}

	keyPath := filepath.Join(dir, "key.pem")
	keyFile, err := os.Create(keyPath)
	if err != nil {
		t.Fatalf("create key file: %v", err)
	}
	keyBytes := x509.MarshalPKCS1PrivateKey(privateKey)
	if err := pem.Encode(keyFile, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: keyBytes}); err != nil {
		_ = keyFile.Close()
		t.Fatalf("write key: %v", err)
	}
	if err := keyFile.Close(); err != nil {
		t.Fatalf("close key file: %v", err)
	}

	return certPath, keyPath, derBytes
}
