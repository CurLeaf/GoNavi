package jvm

import (
	"context"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/connection"
)

type DiagnosticTransport interface {
	Mode() string
	TestConnection(ctx context.Context, cfg connection.ConnectionConfig) error
	ProbeCapabilities(ctx context.Context, cfg connection.ConnectionConfig) ([]DiagnosticCapability, error)
	StartSession(ctx context.Context, cfg connection.ConnectionConfig, req DiagnosticSessionRequest) (DiagnosticSessionHandle, error)
	ExecuteCommand(ctx context.Context, cfg connection.ConnectionConfig, req DiagnosticCommandRequest) error
	CancelCommand(ctx context.Context, cfg connection.ConnectionConfig, sessionID string, commandID string) error
	CloseSession(ctx context.Context, cfg connection.ConnectionConfig, sessionID string) error
}

type diagnosticTransportNotImplemented struct {
	mode string
}

func (t diagnosticTransportNotImplemented) Mode() string { return t.mode }

func (t diagnosticTransportNotImplemented) TestConnection(context.Context, connection.ConnectionConfig) error {
	return errDiagnosticTransportNotImplemented(t.mode, "test connection")
}

func (t diagnosticTransportNotImplemented) ProbeCapabilities(context.Context, connection.ConnectionConfig) ([]DiagnosticCapability, error) {
	return nil, errDiagnosticTransportNotImplemented(t.mode, "probe capabilities")
}

func (t diagnosticTransportNotImplemented) StartSession(context.Context, connection.ConnectionConfig, DiagnosticSessionRequest) (DiagnosticSessionHandle, error) {
	return DiagnosticSessionHandle{}, errDiagnosticTransportNotImplemented(t.mode, "start session")
}

func (t diagnosticTransportNotImplemented) ExecuteCommand(context.Context, connection.ConnectionConfig, DiagnosticCommandRequest) error {
	return errDiagnosticTransportNotImplemented(t.mode, "execute command")
}

func (t diagnosticTransportNotImplemented) CancelCommand(context.Context, connection.ConnectionConfig, string, string) error {
	return errDiagnosticTransportNotImplemented(t.mode, "cancel command")
}

func (t diagnosticTransportNotImplemented) CloseSession(context.Context, connection.ConnectionConfig, string) error {
	return errDiagnosticTransportNotImplemented(t.mode, "close session")
}

var diagnosticTransportFactories = map[string]func() DiagnosticTransport{
	DiagnosticTransportAgentBridge: func() DiagnosticTransport {
		return NewDiagnosticAgentBridgeTransport()
	},
	DiagnosticTransportArthasTunnel: func() DiagnosticTransport {
		return NewDiagnosticArthasTunnelTransport()
	},
}

func NewDiagnosticTransport(mode string) (DiagnosticTransport, error) {
	normalizedMode := strings.ToLower(strings.TrimSpace(mode))
	factory, ok := diagnosticTransportFactories[normalizedMode]
	if !ok {
		return nil, fmt.Errorf("unsupported diagnostic transport: %s", mode)
	}
	return factory(), nil
}

func errDiagnosticTransportNotImplemented(mode string, action string) error {
	return fmt.Errorf("%s diagnostic transport does not implement %s yet", strings.TrimSpace(mode), action)
}
