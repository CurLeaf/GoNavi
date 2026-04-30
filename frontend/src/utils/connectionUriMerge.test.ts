import { describe, expect, it } from "vitest";

import { mergeParsedUriValuesForForm } from "./connectionUriMerge";

describe("mergeParsedUriValuesForForm", () => {
  it("keeps saved credentials when parsed URI has no auth section", () => {
    const result = mergeParsedUriValuesForForm(
      {
        user: "root",
        password: "saved-password",
        host: "192.168.1.10",
        port: 3306,
        database: "old_db",
        connectionParams: "application_name=GoNavi",
        timeout: 30,
      },
      {
        host: "192.168.1.240",
        port: 3306,
        user: "",
        password: "",
        database: "mkefu_location_dev_local",
        connectionParams: "",
        timeout: undefined,
        useSSL: false,
      },
      "jdbc:mysql://192.168.1.240:3306/mkefu_location_dev_local?characterEncoding=UTF-8",
    );

    expect(result).toMatchObject({
      uri: "jdbc:mysql://192.168.1.240:3306/mkefu_location_dev_local?characterEncoding=UTF-8",
      host: "192.168.1.240",
      port: 3306,
      database: "mkefu_location_dev_local",
      useSSL: false,
    });
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("connectionParams");
    expect(result).not.toHaveProperty("timeout");
  });

  it("allows URI credentials to replace existing credentials when provided", () => {
    const result = mergeParsedUriValuesForForm(
      {
        user: "root",
        password: "old-password",
      },
      {
        user: "uri_user",
        password: "uri-password",
      },
      "mysql://uri_user:uri-password@127.0.0.1:3306/app",
    );

    expect(result).toMatchObject({
      user: "uri_user",
      password: "uri-password",
    });
  });

  it("keeps existing database when URI omits a database path", () => {
    const result = mergeParsedUriValuesForForm(
      {
        database: "saved_db",
      },
      {
        host: "127.0.0.1",
        database: "",
      },
      "mysql://127.0.0.1:3306",
    );

    expect(result.database).toBeUndefined();
    expect(result.host).toBe("127.0.0.1");
  });
});
