import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../wailsjs/go/app/App", () => ({
  DBQuery: vi.fn(),
}));

import { DBQuery } from "../../../wailsjs/go/app/App";
import { buildSchemasMetadataQuerySpecs, loadViews } from "./sidebarMetadataLoaders";

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
          data: [{ view_name: "CHARACTER_SETS", schema_name: "information_schema" }],
        };
      }
      if (sql.includes("information_schema.tables")) {
        return {
          success: true,
          data: [{ view_name: "CHARACTER_SETS", schema_name: "information_schema", table_type: "SYSTEM VIEW" }],
        };
      }
      if (sql.includes("SHOW FULL TABLES FROM `information_schema` WHERE Table_type = 'VIEW'")) {
        return {
          success: true,
          data: [{ Tables_in_information_schema: "CHARACTER_SETS", Table_type: "VIEW" }],
        };
      }
      return { success: false, data: [] };
    });

    const result = await loadViews({ config: { type: "mysql" } }, "information_schema");

    expect(result.supported).toBe(true);
    expect(result.views).toEqual([
      { viewName: "CHARACTER_SETS", schemaName: "information_schema" },
    ]);
  });
});
