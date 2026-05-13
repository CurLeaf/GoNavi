//go:build gonavi_mongodb_driver_v1

package db

import (
	"testing"

	"GoNavi-Wails/internal/connection"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestApplyMongoURIV1_ExplicitHostDoesNotAdoptURIHosts(t *testing.T) {
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

func TestBuildMongoChangeFilterV1_ConvertsExplicitOIDToObjectID(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	filter := buildMongoChangeFilter(map[string]interface{}{
		"_id":  map[string]interface{}{"$oid": oidHex},
		"name": oidHex,
	})

	gotID, ok := filter["_id"].(primitive.ObjectID)
	if !ok {
		t.Fatalf("expected _id to be primitive.ObjectID, got %T", filter["_id"])
	}
	if gotID.Hex() != oidHex {
		t.Fatalf("unexpected ObjectID: got=%s want=%s", gotID.Hex(), oidHex)
	}
	if filter["name"] != oidHex {
		t.Fatalf("non-_id 24 hex string should stay string, got %T %v", filter["name"], filter["name"])
	}
}

func TestBuildMongoChangeFilterV1_LeavesIDHexStringUntouched(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	filter := buildMongoChangeFilter(map[string]interface{}{
		"_id": oidHex,
	})

	if filter["_id"] != oidHex {
		t.Fatalf("plain _id string should stay string, got %T %v", filter["_id"], filter["_id"])
	}
}

func TestBuildMongoObjectIDLocatorValueV1_EncodesObjectID(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"
	oid, err := primitive.ObjectIDFromHex(oidHex)
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

func TestCopyMongoChangeDocumentV1_LeavesInsertIDStringUntouched(t *testing.T) {
	const oidHex = "507f1f77bcf86cd799439011"

	doc := copyMongoChangeDocument(map[string]interface{}{
		"_id": oidHex,
	})

	if doc["_id"] != oidHex {
		t.Fatalf("insert _id string should stay string, got %T %v", doc["_id"], doc["_id"])
	}
}
