package uievents

import (
	"context"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Emitter interface {
	Emit(name string, args ...any)
}

type emitterContextKey struct{}

func WithEmitter(ctx context.Context, emitter Emitter) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	if emitter == nil {
		return ctx
	}
	return context.WithValue(ctx, emitterContextKey{}, emitter)
}

func Emit(ctx context.Context, name string, args ...any) {
	if ctx == nil {
		return
	}
	if emitter, ok := ctx.Value(emitterContextKey{}).(Emitter); ok && emitter != nil {
		emitter.Emit(name, args...)
		return
	}
	wailsRuntime.EventsEmit(ctx, name, args...)
}
