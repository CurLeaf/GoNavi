package app

import (
	"net/url"
	"testing"

	"GoNavi-Wails/internal/connection"
)

func TestNormalizeRunConfig_OceanBaseOracleAddsCurrentSchemaInit(t *testing.T) {
	t.Parallel()

	config := connection.ConnectionConfig{
		Type:              "oceanbase",
		Database:          "OBORCL",
		OceanBaseProtocol: "oracle",
	}
	runConfig := normalizeRunConfig(config, "sbdev")

	if runConfig.Database != "OBORCL" {
		t.Fatalf("expected OceanBase Oracle service name to stay OBORCL, got %q", runConfig.Database)
	}
	if runConfig.Timeout != defaultOceanBaseOracleQueryTimeoutSeconds {
		t.Fatalf("expected OceanBase Oracle default query timeout %d, got %d", defaultOceanBaseOracleQueryTimeoutSeconds, runConfig.Timeout)
	}
	values, err := url.ParseQuery(runConfig.ConnectionParams)
	if err != nil {
		t.Fatalf("unexpected connection params parse error: %v", err)
	}
	initValues := values["init"]
	if len(initValues) != 1 || initValues[0] != "ALTER SESSION SET CURRENT_SCHEMA = SBDEV" {
		t.Fatalf("expected current schema init for selected schema, got %#v", initValues)
	}
}

func TestNormalizeRunConfig_OceanBaseOraclePreservesExplicitTimeoutAndExistingInit(t *testing.T) {
	t.Parallel()

	config := connection.ConnectionConfig{
		Type:              "oceanbase",
		Database:          "OBORCL",
		OceanBaseProtocol: "oracle",
		Timeout:           45,
		ConnectionParams:  "init=ALTER+SESSION+SET+NLS_DATE_FORMAT%3D%27YYYY-MM-DD%27&timeout=10s",
	}
	runConfig := normalizeRunConfig(config, "sbdev")

	if runConfig.Timeout != 45 {
		t.Fatalf("expected explicit timeout to be preserved, got %d", runConfig.Timeout)
	}
	values, err := url.ParseQuery(runConfig.ConnectionParams)
	if err != nil {
		t.Fatalf("unexpected connection params parse error: %v", err)
	}
	initValues := values["init"]
	if len(initValues) != 2 {
		t.Fatalf("expected existing init plus current schema init, got %#v", initValues)
	}
	if initValues[0] != "ALTER SESSION SET NLS_DATE_FORMAT='YYYY-MM-DD'" {
		t.Fatalf("expected existing init to stay first, got %#v", initValues)
	}
	if initValues[1] != "ALTER SESSION SET CURRENT_SCHEMA = SBDEV" {
		t.Fatalf("expected current schema init appended, got %#v", initValues)
	}
	if values.Get("timeout") != "10s" {
		t.Fatalf("expected non-init connection param preserved, got %q", values.Get("timeout"))
	}
}

func TestQuoteOracleCurrentSchemaIdentifier(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "lower simple", raw: "sbdev", want: "SBDEV"},
		{name: "normal uppercase", raw: "SBDEV", want: "SBDEV"},
		{name: "quoted mixed case required", raw: "Sb Dev", want: `"Sb Dev"`},
		{name: "quote escaping", raw: `A"B`, want: `"A""B"`},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := quoteOracleCurrentSchemaIdentifier(tc.raw); got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}
