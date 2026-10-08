import { expect, it } from "vitest";
import { nutritionDatabaseError } from "./database-error";

it.each(["P2021", "P2022"])("explains an unavailable nutrition schema without exposing database internals (%s)", async code => {
  const response = nutritionDatabaseError({ code, message: "private connection string" });
  expect(response?.status).toBe(503);
  const body = await response!.json();
  expect(body.code).toBe("NUTRITION_SCHEMA_NOT_READY");
  expect(JSON.stringify(body)).not.toContain("private connection string");
});

it.each([null, undefined, {}, { code: undefined }, { code: "P2002" }, new Error("failure"), "failure"])("does not mask unrelated database failures (%j)", error => {
  expect(nutritionDatabaseError(error)).toBeNull();
});
