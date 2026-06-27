import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../wailsjs/go/app/App", () => ({
  DBQuery: vi.fn(),
}));

import { DBQuery } from "../../../wailsjs/go/app/App";
import {
  buildPackagesMetadataQuerySpecs,
  buildSchemasMetadataQuerySpecs,
  buildSequencesMetadataQuerySpecs,
  loadPackages,
  loadSequences,
  loadViews,
} from "./sidebarMetadataLoaders";

const mockedDBQuery = vi.mocked(DBQuery);

beforeEach(() => {
  mockedDBQuery.mockReset();
});

describe("buildSchemasMetadataQuerySpecs", () => {
  it("returns schema queries for independent-schema targets", () => {
    expect(
      buildSchemasMetadataQuerySpecs("sqlserver", "app_db")[0]?.sql,
    ).toContain(".sys.schemas");
    expect(
      buildSchemasMetadataQuerySpecs("iris", "USER")[0]?.sql.toLowerCase(),
    ).toContain("information_schema.schemata");
    expect(
      buildSchemasMetadataQuerySpecs(
        "duckdb",
        "analytics",
      )[0]?.sql.toLowerCase(),
    ).toContain("information_schema.schemata");
  });

  it("keeps unsupported dialects empty", () => {
    expect(buildSchemasMetadataQuerySpecs("mysql", "app")).toEqual([]);
  });

  it("deduplicates MySQL view metadata when fallback queries omit schema names", async () => {
    mockedDBQuery.mockImplementation(async (_config: unknown, _dbName: string, sql: string) => {
      if (sql.includes("information_schema.views")) {
        return {
          success: true,
          message: "",
          data: [{ view_name: "CHARACTER_SETS", schema_name: "information_schema" }],
        };
      }
      if (sql.includes("information_schema.tables")) {
        return {
          success: true,
          message: "",
          data: [{ view_name: "CHARACTER_SETS", schema_name: "information_schema", table_type: "SYSTEM VIEW" }],
        };
      }
      if (sql.includes("SHOW FULL TABLES FROM `information_schema` WHERE Table_type = 'VIEW'")) {
        return {
          success: true,
          message: "",
          data: [{ Tables_in_information_schema: "CHARACTER_SETS", Table_type: "VIEW" }],
        };
      }
      return { success: false, message: "", data: [] };
    });

    const result = await loadViews({ config: { type: "mysql" } }, "information_schema");

    expect(result.supported).toBe(true);
    expect(result.views).toEqual([
      { viewName: "CHARACTER_SETS", schemaName: "information_schema" },
    ]);
  });
});

describe("Oracle object metadata loaders", () => {
  it("builds owner-scoped sequence and package queries for Oracle", () => {
    expect(buildSequencesMetadataQuerySpecs("oracle", "MYCIMLED").map((spec) => spec.sql)).toEqual([
      "SELECT SEQUENCE_OWNER AS schema_name, SEQUENCE_NAME AS sequence_name FROM ALL_SEQUENCES WHERE SEQUENCE_OWNER = 'MYCIMLED' ORDER BY SEQUENCE_NAME",
    ]);
    expect(buildPackagesMetadataQuerySpecs("oracle", "MYCIMLED").map((spec) => spec.sql)).toEqual([
      "SELECT OWNER AS schema_name, OBJECT_NAME AS package_name FROM ALL_OBJECTS WHERE OWNER = 'MYCIMLED' AND OBJECT_TYPE = 'PACKAGE' ORDER BY OBJECT_NAME",
    ]);
  });

  it("loads and deduplicates Oracle sequences and packages", async () => {
    mockedDBQuery.mockImplementation(async (_config: unknown, _dbName: string, sql: string) => {
      if (sql.includes("ALL_SEQUENCES")) {
        return {
          success: true,
          message: "",
          data: [
            { schema_name: "MYCIMLED", sequence_name: "SEQ_PERSON_ID" },
            { SEQUENCE_OWNER: "MYCIMLED", SEQUENCE_NAME: "SEQ_PERSON_ID" },
          ],
        };
      }
      if (sql.includes("ALL_OBJECTS") && sql.includes("PACKAGE")) {
        return {
          success: true,
          message: "",
          data: [
            { schema_name: "MYCIMLED", package_name: "PKG_PERSON" },
            { OWNER: "MYCIMLED", OBJECT_NAME: "PKG_PERSON" },
          ],
        };
      }
      return { success: false, message: "", data: [] };
    });

    await expect(loadSequences({ config: { type: "oracle" } }, "MYCIMLED")).resolves.toEqual({
      supported: true,
      sequences: [
        {
          displayName: "MYCIMLED.SEQ_PERSON_ID",
          schemaName: "MYCIMLED",
          sequenceName: "MYCIMLED.SEQ_PERSON_ID",
        },
      ],
    });
    await expect(loadPackages({ config: { type: "oracle" } }, "MYCIMLED")).resolves.toEqual({
      supported: true,
      packages: [
        {
          displayName: "MYCIMLED.PKG_PERSON",
          packageName: "MYCIMLED.PKG_PERSON",
          schemaName: "MYCIMLED",
        },
      ],
    });
  });
});
