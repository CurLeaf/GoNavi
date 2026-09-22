package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ErrOptionalDriverAgentAttachUnsupported 表示当前 agent 不认识外部数据源附加协议。
var ErrOptionalDriverAgentAttachUnsupported = errors.New("驱动代理不支持外部数据源附加")

const optionalAgentMethodListExternalAttachments = "listExternalAttachments"

var (
	_ ExternalDatabaseAttacher = (*OptionalDriverAgentDB)(nil)
	_ ExternalAttachmentLister = (*OptionalDriverAgentDB)(nil)
)

func optionalAgentAttachUnsupportedError(driverType string) error {
	return fmt.Errorf("%w：%s 驱动代理版本过低，请在驱动管理中升级驱动代理后重试", ErrOptionalDriverAgentAttachUnsupported, driverDisplayName(driverType))
}

func (d *OptionalDriverAgentDB) AttachExternalDatabase(ctx context.Context, spec ExternalAttachSpec) error {
	client, err := d.requireClient()
	if err != nil {
		return err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	specCopy := spec
	if err := client.callContext(ctx, optionalAgentRequest{
		Method:     optionalAgentMethodAttachExternalDatabase,
		AttachSpec: &specCopy,
		TimeoutMs:  timeoutMsFromContext(ctx),
	}, nil, nil, nil, nil); err != nil {
		return wrapOptionalAgentExternalAttachError(d.driverType, err)
	}
	return nil
}

func (d *OptionalDriverAgentDB) ListExternalAttachments(ctx context.Context) ([]ExternalAttachmentInfo, error) {
	client, err := d.requireClient()
	if err != nil {
		return nil, err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	var attachments []ExternalAttachmentInfo
	if err := client.callContext(ctx, optionalAgentRequest{
		Method:    optionalAgentMethodListExternalAttachments,
		TimeoutMs: timeoutMsFromContext(ctx),
	}, &attachments, nil, nil, nil); err != nil {
		return nil, err
	}
	if attachments == nil {
		return []ExternalAttachmentInfo{}, nil
	}
	return attachments, nil
}

func (d *OptionalDriverAgentDB) DetachExternalDatabase(ctx context.Context, alias string) error {
	client, err := d.requireClient()
	if err != nil {
		return err
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := client.callContext(ctx, optionalAgentRequest{
		Method:    optionalAgentMethodDetachExternalDatabase,
		Alias:     alias,
		TimeoutMs: timeoutMsFromContext(ctx),
	}, nil, nil, nil, nil); err != nil {
		return wrapOptionalAgentExternalAttachError(d.driverType, err)
	}
	return nil
}

func wrapOptionalAgentExternalAttachError(driverType string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, ErrExternalAttachNotAttached) {
		return err
	}
	text := err.Error()
	if strings.Contains(text, ErrExternalAttachNotAttached.Error()) {
		return fmt.Errorf("%w", ErrExternalAttachNotAttached)
	}
	if strings.Contains(text, "不支持的方法") {
		return optionalAgentAttachUnsupportedError(driverType)
	}
	return err
}
