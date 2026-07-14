import { assert } from "chai";
import { hashString } from "../src/utils/hash";

describe("hashString", function () {
  it("returns the same hash for the same input", function () {
    assert.equal(hashString("hello"), hashString("hello"));
  });

  it("returns different hashes for different inputs", function () {
    assert.notEqual(hashString("hello"), hashString("world"));
  });

  it("returns a hexadecimal string", function () {
    assert.match(hashString("hello"), /^[0-9a-f]+$/);
  });

  it("handles empty strings", function () {
    assert.equal(hashString(""), "1505");
  });

  it("is case-sensitive", function () {
    assert.notEqual(hashString("hello"), hashString("Hello"));
  });

  it("matches known hash values", function () {
    assert.equal(hashString("hello"), "f923099");
    assert.equal(hashString("world"), "10a7356d");
    assert.equal(hashString("test"), "7c9e6865");
  });
});
