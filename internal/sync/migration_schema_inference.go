package sync

import (
	"fmt"
	"strings"
)

type SchemaInferenceStrategy string

const (
	SchemaInferenceStrategySample SchemaInferenceStrategy = "sample"
	SchemaInferenceStrategyStrict SchemaInferenceStrategy = "strict"
)

func shouldUseSchemaInference(sourceType string, targetType string) bool {
	sourceModel := classifyMigrationDataModel(sourceType)
	targetModel := classifyMigrationDataModel(targetType)
	return sourceModel == MigrationDataModelDocument && targetModel == MigrationDataModelRelational
}

func inferMigrationObjectKind(sourceType string, targetType string) MigrationObjectKind {
	sourceModel := classifyMigrationDataModel(sourceType)
	targetModel := classifyMigrationDataModel(targetType)
	switch {
	case sourceModel == MigrationDataModelDocument || targetModel == MigrationDataModelDocument:
		return MigrationObjectKindCollection
	case sourceModel == MigrationDataModelKeyValue || targetModel == MigrationDataModelKeyValue:
		return MigrationObjectKindKeyspace
	default:
		return MigrationObjectKindTable
	}
}

func inferSchemaForPair(sourceType string, targetType string, objectName string) (SchemaInferenceResult, error) {
	if !shouldUseSchemaInference(sourceType, targetType) {
		return SchemaInferenceResult{}, fmt.Errorf("当前迁移对 %s -> %s 不需要 schema 推断", sourceType, targetType)
	}
	return SchemaInferenceResult{
		Object: CanonicalObjectSpec{
			Name:   strings.TrimSpace(objectName),
			Kind:   MigrationObjectKindCollection,
			Fields: []CanonicalFieldSpec{},
		},
		Issues: []SchemaInferenceIssue{
			{
				Level:      "info",
				Message:    "MongoDB -> 关系型数据库的 schema 推断能力尚在建设中，当前仅提供内核入口。",
				Resolution: "后续将基于样本数据生成列定义与类型降级策略。",
			},
		},
		NeedsReview: true,
	}, nil
}
