package tlsconfig

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"strings"
)

type ClientConfigOptions struct {
	Enabled            bool
	InsecureSkipVerify bool
	CAPath             string
	CertPath           string
	KeyPath            string
}

func BuildClientConfig(options ClientConfigOptions) (*tls.Config, error) {
	if !options.Enabled {
		return nil, nil
	}

	cfg := &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: options.InsecureSkipVerify,
	}

	caPath := strings.TrimSpace(options.CAPath)
	if caPath != "" {
		pemBytes, err := os.ReadFile(caPath)
		if err != nil {
			return nil, fmt.Errorf("读取 TLS CA 证书失败（%s）：%w", caPath, err)
		}
		pool := x509.NewCertPool()
		if ok := pool.AppendCertsFromPEM(pemBytes); !ok {
			certs, err := x509.ParseCertificates(pemBytes)
			if err != nil || len(certs) == 0 {
				return nil, fmt.Errorf("TLS CA 证书不是有效的 PEM/DER 文件：%s", caPath)
			}
			for _, cert := range certs {
				pool.AddCert(cert)
			}
		}
		cfg.RootCAs = pool
	}

	certPath := strings.TrimSpace(options.CertPath)
	keyPath := strings.TrimSpace(options.KeyPath)
	if (certPath == "") != (keyPath == "") {
		return nil, fmt.Errorf("TLS 客户端证书和私钥需要同时配置")
	}
	if certPath != "" {
		cert, err := tls.LoadX509KeyPair(certPath, keyPath)
		if err != nil {
			return nil, fmt.Errorf("加载 TLS 客户端证书失败（cert=%s key=%s）：%w", certPath, keyPath, err)
		}
		cfg.Certificates = []tls.Certificate{cert}
	}

	return cfg, nil
}
