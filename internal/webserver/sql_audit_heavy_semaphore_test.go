package webserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

type sqlAuditIntegrityTestReceiver struct{}

func (r *sqlAuditIntegrityTestReceiver) VerifySQLAuditIntegrity() string {
	return ""
}

func TestSQLAuditHeavySemaphoreReleasesAfterHTTPCancellation(t *testing.T) {
	receiver := &sqlAuditIntegrityTestReceiver{}
	entered := make(chan struct{})
	observed := make(chan struct{})
	invoker := &methodInvoker{
		targets: map[string]reflect.Value{"app": reflect.ValueOf(receiver)},
		contextHandlers: map[string]map[string]reflect.Value{
			"app": {
				"VerifySQLAuditIntegrity": reflect.ValueOf(func(ctx context.Context) string {
					close(entered)
					<-ctx.Done()
					close(observed)
					return ""
				}),
			},
		},
	}
	auditHeavySem := make(chan struct{}, 1)
	webServer := &Server{invoker: invoker, auditHeavySem: auditHeavySem}
	server := httptest.NewServer(http.HandlerFunc(webServer.handleInvoke))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL, strings.NewReader(
		`{"namespace":"app","method":"VerifySQLAuditIntegrity","args":[]}`,
	))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	result := make(chan error, 1)
	go func() {
		response, requestErr := server.Client().Do(request)
		if response != nil {
			_ = response.Body.Close()
		}
		result <- requestErr
	}()

	select {
	case <-entered:
	case <-time.After(2 * time.Second):
		t.Fatal("integrity handler was not entered")
	}
	cancel()
	select {
	case <-observed:
	case <-time.After(2 * time.Second):
		t.Fatal("HTTP cancellation did not reach the integrity handler")
	}
	select {
	case requestErr := <-result:
		if requestErr == nil {
			t.Fatal("client request unexpectedly completed without cancellation")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancelled integrity request did not return")
	}
	select {
	case auditHeavySem <- struct{}{}:
		<-auditHeavySem
	case <-time.After(2 * time.Second):
		t.Fatal("audit heavy semaphore remained occupied after cancellation")
	}
}
