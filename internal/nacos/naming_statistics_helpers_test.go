package nacos

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func writeNacosJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func writeNacosResult(w http.ResponseWriter, family nacosAPIFamily, data any) {
	code := 0
	if family == nacosAPIV1 {
		code = 200
	}
	writeNacosJSON(w, map[string]any{
		"code":    code,
		"message": "success",
		"data":    data,
	})
}

func connectAPIVersionTestClient(t *testing.T, server *httptest.Server) *ClientImpl {
	t.Helper()
	client := &ClientImpl{}
	if err := client.Connect(nacosAPITestConnectionConfig(t, server)); err != nil {
		t.Fatalf("Connect: %v", err)
	}
	return client
}

func nacosAPITestConnectionConfig(t *testing.T, server *httptest.Server) connection.ConnectionConfig {
	t.Helper()
	parsed, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(parsed.Port())
	if err != nil {
		t.Fatal(err)
	}
	return connection.ConnectionConfig{
		Type:             "nacos",
		Host:             parsed.Hostname(),
		Port:             port,
		Timeout:          5,
		ConnectionParams: "contextPath=/",
	}
}
