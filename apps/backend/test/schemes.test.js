"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { categoryIndex } = require("../dist/schemes/schemes.service");
const { SchemeCategory } = require("@bharatchain/shared");

test("scheme category index matches the on-chain uint8 ordering", () => {
  assert.equal(categoryIndex(SchemeCategory.AGRICULTURE), 0);
  assert.equal(categoryIndex(SchemeCategory.EDUCATION), 1);
  assert.equal(categoryIndex(SchemeCategory.HOUSING), 2);
  assert.equal(categoryIndex(SchemeCategory.HEALTH), 3);
  assert.equal(categoryIndex(SchemeCategory.EMPLOYMENT), 4);
  assert.equal(categoryIndex(SchemeCategory.SOCIAL_WELFARE), 5);
});

test("unknown category returns -1", () => {
  assert.equal(categoryIndex("NOT_A_CATEGORY"), -1);
});
