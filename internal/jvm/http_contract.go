package jvm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type contractRuntime struct {
	baseURL     *url.URL
	apiKey      string
	client      *http.Client
	timeout     time.Duration
	errorPrefix string
}

func newContractRuntime(baseURLText string, apiKey string, timeout time.Duration, errorPrefix string) (contractRuntime, error) {
	baseURL, err := normalizeContractBaseURL(baseURLText, errorPrefix)
	if err != nil {
		return contractRuntime{}, err
	}
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	return contractRuntime{
		baseURL:     baseURL,
		apiKey:      strings.TrimSpace(apiKey),
		client:      &http.Client{Timeout: timeout},
		timeout:     timeout,
		errorPrefix: strings.TrimSpace(errorPrefix),
	}, nil
}

func normalizeContractBaseURL(rawBaseURL string, errorPrefix string) (*url.URL, error) {
	baseURL := strings.TrimSpace(rawBaseURL)
	if baseURL == "" {
		return nil, fmt.Errorf("%s baseURL is required", errorPrefix)
	}

	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, fmt.Errorf("%s baseURL is invalid: %s", errorPrefix, baseURL)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("%s scheme is unsupported: %s", errorPrefix, parsed.Scheme)
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed, nil
}

func (r contractRuntime) doJSON(
	ctx context.Context,
	method string,
	action string,
	relativePath string,
	query url.Values,
	requestBody any,
	out any,
) error {
	var bodyReader io.Reader
	if requestBody != nil {
		payload, err := json.Marshal(requestBody)
		if err != nil {
			return fmt.Errorf("%s %s request encode failed: %w", r.errorPrefix, action, err)
		}
		bodyReader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, r.resolveURL(relativePath, query), bodyReader)
	if err != nil {
		return fmt.Errorf("%s %s request build failed: %w", r.errorPrefix, action, err)
	}
	req.Header.Set("Accept", "application/json")
	if r.apiKey != "" {
		req.Header.Set("X-API-Key", r.apiKey)
	}
	if requestBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := r.client.Do(req)
	if err != nil {
		return wrapContractRequestError(r.errorPrefix, action, r.timeout, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return buildContractStatusError(r.errorPrefix, action, resp)
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil
	}
	if err := decodeContractJSON(resp.Body, out); err != nil {
		return fmt.Errorf("%s %s returned invalid JSON: %w", r.errorPrefix, action, err)
	}
	return nil
}

func (r contractRuntime) resolveURL(relativePath string, query url.Values) string {
	resolved := *r.baseURL
	resolved.RawQuery = ""
	resolved.Fragment = ""

	basePath := strings.TrimRight(strings.TrimSpace(resolved.Path), "/")
	childPath := strings.TrimLeft(strings.TrimSpace(relativePath), "/")

	switch {
	case basePath == "" && childPath == "":
		resolved.Path = ""
	case basePath == "":
		resolved.Path = "/" + childPath
	case childPath == "":
		resolved.Path = basePath
	default:
		resolved.Path = basePath + "/" + childPath
	}

	if len(query) > 0 {
		resolved.RawQuery = query.Encode()
	}
	return resolved.String()
}

func doContractProbe(ctx context.Context, runtime contractRuntime, method string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, runtime.baseURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("%s probe request build failed: %w", runtime.errorPrefix, err)
	}
	if runtime.apiKey != "" {
		req.Header.Set("X-API-Key", runtime.apiKey)
	}
	resp, err := runtime.client.Do(req)
	if err != nil {
		return nil, wrapContractRequestError(runtime.errorPrefix, "probe", runtime.timeout, err)
	}
	return resp, nil
}

func isReachableStatus(statusCode int) bool {
	return (statusCode >= 200 && statusCode < 400) || statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden
}

func decodeContractJSON(body io.Reader, out any) error {
	decoder := json.NewDecoder(body)
	decoder.UseNumber()
	if err := decoder.Decode(out); err != nil {
		if errors.Is(err, io.EOF) {
			return fmt.Errorf("empty response body")
		}
		return err
	}

	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}

func buildContractStatusError(errorPrefix string, action string, resp *http.Response) error {
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if err != nil {
		return fmt.Errorf("%s %s request failed: %s", errorPrefix, action, resp.Status)
	}

	message := strings.TrimSpace(string(body))
	if message == "" {
		return fmt.Errorf("%s %s request failed: %s", errorPrefix, action, resp.Status)
	}
	return fmt.Errorf("%s %s request failed: %s: %s", errorPrefix, action, resp.Status, message)
}

func wrapContractRequestError(errorPrefix string, action string, timeout time.Duration, err error) error {
	if errors.Is(err, context.DeadlineExceeded) || isContractTimeoutError(err) {
		return fmt.Errorf("%s %s request timed out after %s: %w", errorPrefix, action, timeout, err)
	}
	if errors.Is(err, context.Canceled) {
		return fmt.Errorf("%s %s request canceled: %w", errorPrefix, action, err)
	}
	return fmt.Errorf("%s %s request failed: %w", errorPrefix, action, err)
}

func isContractTimeoutError(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}
