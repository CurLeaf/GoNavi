//go:build gonavi_full_drivers || gonavi_mongodb_driver

package db

import (
	"strings"
	"testing"

	"GoNavi-Wails/internal/connection"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestApplyMongoURI_ExplicitHostDoesNotAdoptURIHosts(t *testing.T) {
	config := connection.ConnectionConfig{
		Host: "10.10.10.10",
		Port: 27017,
		URI:  "mongodb://localhost:27017/admin",
	}

	got := applyMongoURI(config)
	if got.Host != "10.10.10.10" {
		t.Fatalf("expected host to remain explicit, got %q", got.Host)
	}
	if len(got.Hosts) != 0 {
		t.Fatalf("expected hosts to remain empty when explicit host exists, got %v", got.Hosts)
	}
}

func TestApplyMongoURI_ExplicitHostsDoesNotAdoptURIHosts(t *testing.T) {
	config := connection.ConnectionConfig{
		Host:  "10.10.10.10",
		Port:  27017,
		Hosts: []string{"10.10.10.10:27017", "10.10.10.11:27017"},
		URI:   "mongodb://localhost:27017,localhost:27018/admin?replicaSet=rs0",
	}

	got := applyMongoURI(config)
	if len(got.Hosts) != 2 || got.Hosts[0] != "10.10.10.10:27017" {
		t.Fatalf("expected explicit hosts to stay untouched, got %v", got.Hosts)
	}
}

func TestMongoURI_MergesConnectionParams(t *testing.T) {
	uri := (&MongoDB{}).getURI(connection.ConnectionConfig{
		Host:             "mongo.local",
		Port:             27017,
		Database:         "app",
		ConnectionParams: "retryWrites=true&readPreference=secondaryPreferred",
	})

	if !strings.Contains(uri, "retryWrites=true") {
		t.Fatalf("uri 缺少 retryWrites 参数：%s", uri)
	}
	if !strings.Contains(uri, "readPreference=secondaryPreferred") {
		t.Fatalf("uri 缺少 readPreference 参数：%s", uri)
	}
}

func TestMongoURI_MergesConnectionParamsIntoExistingURI(t *testing.T) {
	uri := (&MongoDB{}).getURI(connection.ConnectionConfig{
		URI:              "mongodb://mongo.local:27017/app?authSource=admin",
		ConnectionParams: "retryWrites=true",
	})

	if !strings.Contains(uri, "authSource=admin") || !strings.Contains(uri, "retryWrites=true") {
		t.Fatalf("uri 未合并已有 URI query 与额外参数：%s", uri)
	}
}

func TestBuildMongoChangeFilter_ConvertsExplicitOIDToObjectID(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	filter := buildMongoChangeFilter(map[string]interface{}{
		"_id":  map[string]interface{}{"$oid": oidHex},
		"name": oidHex,
	})

	gotID, ok := filter["_id"].(bson.ObjectID)
	if !ok {
		t.Fatalf("expected _id to be bson.ObjectID, got %T", filter["_id"])
	}
	if gotID.Hex() != oidHex {
		t.Fatalf("unexpected ObjectID: got=%s want=%s", gotID.Hex(), oidHex)
	}
	if filter["name"] != oidHex {
		t.Fatalf("non-_id 24 hex string should stay string, got %T %v", filter["name"], filter["name"])
	}
}

func TestBuildMongoChangeFilter_LeavesIDHexStringUntouched(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	filter := buildMongoChangeFilter(map[string]interface{}{
		"_id": oidHex,
	})

	if filter["_id"] != oidHex {
		t.Fatalf("plain _id string should stay string, got %T %v", filter["_id"], filter["_id"])
	}
}

func TestBuildMongoObjectIDLocatorValue_EncodesObjectID(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"
	oid, err := bson.ObjectIDFromHex(oidHex)
	if err != nil {
		t.Fatal(err)
	}

	locator := buildMongoObjectIDLocatorValue(oid)
	locatorMap, ok := locator.(bson.M)
	if !ok {
		t.Fatalf("expected locator bson.M, got %T", locator)
	}
	if locatorMap["$oid"] != oidHex {
		t.Fatalf("unexpected locator value: %v", locatorMap["$oid"])
	}
}

func TestCopyMongoChangeDocument_LeavesInsertIDStringUntouched(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	doc := copyMongoChangeDocument(map[string]interface{}{
		"_id": oidHex,
	})

	if doc["_id"] != oidHex {
		t.Fatalf("insert _id string should stay string, got %T %v", doc["_id"], doc["_id"])
	}
}
