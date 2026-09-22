package main

import (
	"errors"
	"fmt"
	"strings"

	"GoNavi-Wails/internal/db"
)

const agentMethodListExternalAttachments = "listExternalAttachments"

func handleExternalAttachmentRequest(runtimeState *agentRuntime, req agentRequest, resp agentResponse) agentResponse {
	switch req.Method {
	case agentMethodAttachExternalDatabase:
		return handleAttachExternalDatabase(runtimeState, req, resp)
	case agentMethodDetachExternalDatabase:
		return handleDetachExternalDatabase(runtimeState, req, resp)
	case agentMethodListExternalAttachments:
		return handleListExternalAttachments(runtimeState, req, resp)
	default:
		return fail(resp, "不支持的方法")
	}
}

func handleListExternalAttachments(runtimeState *agentRuntime, req agentRequest, resp agentResponse) agentResponse {
	if runtimeState.inst == nil {
		return fail(resp, "connection not open")
	}
	lister, ok := runtimeState.inst.(db.ExternalAttachmentLister)
	if !ok {
		return fail(resp, fmt.Sprintf("当前数据源（%s）不支持附加外部数据源", strings.TrimSpace(agentDriverType)))
	}
	ctx, cancel := agentArgsContext(req.TimeoutMs)
	if cancel != nil {
		defer cancel()
	}
	attachments, err := lister.ListExternalAttachments(ctx)
	if err != nil {
		return fail(resp, err.Error())
	}
	if attachments == nil {
		attachments = []db.ExternalAttachmentInfo{}
	}
	resp.Data = attachments
	return resp
}

func handleAttachExternalDatabase(runtimeState *agentRuntime, req agentRequest, resp agentResponse) agentResponse {
	if req.AttachSpec == nil {
		return fail(resp, "attach spec is empty")
	}
	attacher, ok := runtimeState.inst.(db.ExternalDatabaseAttacher)
	if !ok {
		return fail(resp, fmt.Sprintf("当前数据源（%s）不支持附加外部数据源", strings.TrimSpace(agentDriverType)))
	}
	ctx, cancel := agentArgsContext(req.TimeoutMs)
	if cancel != nil {
		defer cancel()
	}
	if err := attacher.AttachExternalDatabase(ctx, *req.AttachSpec); err != nil {
		return failWithExternalAttachNotAttached(resp, err)
	}
	return resp
}

func handleDetachExternalDatabase(runtimeState *agentRuntime, req agentRequest, resp agentResponse) agentResponse {
	attacher, ok := runtimeState.inst.(db.ExternalDatabaseAttacher)
	if !ok {
		return fail(resp, fmt.Sprintf("当前数据源（%s）不支持附加外部数据源", strings.TrimSpace(agentDriverType)))
	}
	ctx, cancel := agentArgsContext(req.TimeoutMs)
	if cancel != nil {
		defer cancel()
	}
	if err := attacher.DetachExternalDatabase(ctx, req.Alias); err != nil {
		return failWithExternalAttachNotAttached(resp, err)
	}
	return resp
}

func failWithExternalAttachNotAttached(resp agentResponse, err error) agentResponse {
	failed := fail(resp, err.Error())
	if errors.Is(err, db.ErrExternalAttachNotAttached) {
		failed.ExternalAttachNotAttached = true
	}
	return failed
}
