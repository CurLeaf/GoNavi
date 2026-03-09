package sync

import (
	"GoNavi-Wails/internal/connection"
	"GoNavi-Wails/internal/db"
)

type MigrationDataModel string

const (
	MigrationDataModelRelational MigrationDataModel = "relational"
	MigrationDataModelDocument   MigrationDataModel = "document"
	MigrationDataModelColumnar   MigrationDataModel = "columnar"
	MigrationDataModelTimeSeries MigrationDataModel = "timeseries"
	MigrationDataModelKeyValue   MigrationDataModel = "keyvalue"
	MigrationDataModelCustom     MigrationDataModel = "custom"
)

type MigrationObjectKind string

const (
	MigrationObjectKindTable      MigrationObjectKind = "table"
	MigrationObjectKindCollection MigrationObjectKind = "collection"
	MigrationObjectKindKeyspace   MigrationObjectKind = "keyspace"
)

type MigrationSupportLevel string

const (
	MigrationSupportLevelFull        MigrationSupportLevel = "full"
	MigrationSupportLevelPartial     MigrationSupportLevel = "partial"
	MigrationSupportLevelPlanned     MigrationSupportLevel = "planned"
	MigrationSupportLevelUnsupported MigrationSupportLevel = "unsupported"
)

type CanonicalFieldSpec struct {
	Name          string
	SourceType    string
	CanonicalType string
	Nullable      bool
	DefaultValue  *string
	AutoIncrement bool
	Comment       string
	NestedPath    string
	Confidence    float64
}

type CanonicalIndexSpec struct {
	Name            string
	Kind            string
	Columns         []string
	Expression      string
	PrefixLength    int
	Supported       bool
	DegradeStrategy string
	Unique          bool
}

type CanonicalConstraintSpec struct {
	Name    string
	Kind    string
	Columns []string
	RefName string
}

type CanonicalObjectSpec struct {
	Name        string
	Schema      string
	Kind        MigrationObjectKind
	Fields      []CanonicalFieldSpec
	PrimaryKey  []string
	Indexes     []CanonicalIndexSpec
	Constraints []CanonicalConstraintSpec
	Comments    []string
	SourceHints map[string]string
}

type SchemaInferenceIssue struct {
	Field      string
	Level      string
	Message    string
	Resolution string
}

type SchemaInferenceResult struct {
	Object      CanonicalObjectSpec
	Issues      []SchemaInferenceIssue
	SampleSize  int
	Confidence  float64
	NeedsReview bool
}

type MigrationBuildContext struct {
	Config    SyncConfig
	TableName string
	SourceDB  db.Database
	TargetDB  db.Database
}

type MigrationPlanner interface {
	Name() string
	SupportLevel(ctx MigrationBuildContext) MigrationSupportLevel
	BuildPlan(ctx MigrationBuildContext) (SchemaMigrationPlan, []connection.ColumnDefinition, []connection.ColumnDefinition, error)
}
