//go:build gonavi_full_drivers || gonavi_oceanbase_driver

package db

import (
	"context"
	"fmt"
)

func (o *OceanBaseDB) QueryContextWithArgs(ctx context.Context, query string, args []any) ([]map[string]interface{}, []string, error) {
	if q, ok := o.activeDatabase().(QueryArgsContexter); ok {
		return q.QueryContextWithArgs(ctx, query, args)
	}
	return nil, nil, fmt.Errorf("当前驱动不支持参数绑定")
}

func (o *OceanBaseDB) ExecContextWithArgs(ctx context.Context, query string, args []any) (int64, error) {
	if e, ok := o.activeDatabase().(ExecArgsContexter); ok {
		return e.ExecContextWithArgs(ctx, query, args)
	}
	return 0, fmt.Errorf("当前驱动不支持参数绑定")
}
