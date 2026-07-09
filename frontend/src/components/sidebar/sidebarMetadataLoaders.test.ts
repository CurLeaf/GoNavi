import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../wailsjs/go/app/App", () => ({
  DBQuery: vi.fn(),
}));

import { DBQuery } from "../../../wailsjs/go/app/App";
import {
  buildFunctionsMetadataQuerySpecs,
  buildPackagesMetadataQuerySpecs,
  buildSchemasMetadataQuerySpecs,
  buildSequencesMetadataQuerySpecs,
  loadFunctions,
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

describe("Kingbase/PG routine metadata loaders", () => {
  it("builds multi-step function fallback queries for kingbase", () => {
    const specs = buildFunctionsMetadataQuerySpecs("kingbase", "ldf_server_dbs");
    expect(specs.length).toBeGreaterThanOrEqual(2);
    expect(specs[0]?.sql).toContain("pg_proc");
    expect(specs.some((spec) => spec.sql.includes("information_schema.routines"))).toBe(true);
  });

  it("does not stack the same kingbase function when multiple catalog fallbacks succeed", async () => {
    let queryCount = 0;
    mockedDBQuery.mockImplementation(async (_config: unknown, _dbName: string, sql: string) => {
      queryCount += 1;
      if (sql.includes("pg_proc") && sql.includes("prokind")) {
        return {
          success: true,
          message: "",
          data: [
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "FUNCTION" },
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "PROCEDURE" },
            { schema_name: "ldf_server", routine_name: "pk_zero_fn", routine_type: "FUNCTION" },
            // overload rows with same name/type must collapse
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "FUNCTION" },
            { schema_name: "LDF_SERVER", routine_name: "p1", routine_type: "FUNCTION" },
          ],
        };
      }
      if (sql.includes("information_schema.routines")) {
        return {
          success: true,
          message: "",
          data: [
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "FUNCTION" },
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "PROCEDURE" },
            { schema_name: "ldf_server", routine_name: "pk_zero_fn", routine_type: "FUNCTION" },
          ],
        };
      }
      if (sql.includes("pg_proc")) {
        return {
          success: true,
          message: "",
          data: [
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "FUNCTION" },
            { schema_name: "ldf_server", routine_name: "p1", routine_type: "FUNCTION" },
            { schema_name: "ldf_server", routine_name: "pk_zero_fn", routine_type: "FUNCTION" },
          ],
        };
      }
      return { success: false, message: "", data: [] };
    });

    const result = await loadFunctions({ config: { type: "kingbase" } }, "ldf_server_dbs");

    expect(result.supported).toBe(true);
    // First full catalog success must short-circuit fallback queries.
    expect(queryCount).toBe(1);
    const p1Funcs = result.routines.filter((item) => item.routineName.toLowerCase().endsWith(".p1") && item.routineType === "FUNCTION");
    const p1Procs = result.routines.filter((item) => item.routineName.toLowerCase().endsWith(".p1") && item.routineType === "PROCEDURE");
    expect(p1Funcs).toHaveLength(1);
    expect(p1Procs).toHaveLength(1);
    expect(result.routines.filter((item) => item.routineName.toLowerCase().includes("pk_zero_fn"))).toHaveLength(1);
  });

  it("still collects complementary SHOW FUNCTION/PROCEDURE fallbacks for MySQL", async () => {
    mockedDBQuery.mockImplementation(async (_config: unknown, _dbName: string, sql: string) => {
      if (sql.includes("information_schema.routines")) {
        return { success: false, message: "no routines view", data: [] };
      }
      if (sql.includes("SHOW FUNCTION STATUS")) {
        return {
          success: true,
          message: "",
          data: [{ Db: "app", Name: "fn_a", Type: "FUNCTION" }],
        };
      }
      if (sql.includes("SHOW PROCEDURE STATUS")) {
        return {
          success: true,
          message: "",
          data: [{ Db: "app", Name: "sp_b", Type: "PROCEDURE" }],
        };
      }
      return { success: false, message: "", data: [] };
    });

    const result = await loadFunctions({ config: { type: "mysql" } }, "app");
    expect(result.supported).toBe(true);
    expect(result.routines.map((item) => `${item.routineType}:${item.routineName}`).sort()).toEqual([
      "FUNCTION:app.fn_a",
      "PROCEDURE:app.sp_b",
    ]);
  });
});
