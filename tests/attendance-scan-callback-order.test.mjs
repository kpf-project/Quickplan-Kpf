import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parse } from "@babel/parser";

const SCAN_PAGE_PATH = new URL(
  "../src/app/production-line/attendance/scan/page.js",
  import.meta.url,
);

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else {
      walk(value, visit);
    }
  }
}

test("attendance scan callbacks do not read dependencies before initialization", async () => {
  const source = await readFile(SCAN_PAGE_PATH, "utf8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["jsx"],
  });
  const declarations = new Map();
  const callbackDependencies = [];

  walk(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
      declarations.set(node.id.name, node.start);
    }
    if (
      node.type === "CallExpression"
      && node.callee?.type === "Identifier"
      && node.callee.name === "useCallback"
      && node.arguments[1]?.type === "ArrayExpression"
    ) {
      for (const dependency of node.arguments[1].elements) {
        if (dependency?.type === "Identifier") {
          callbackDependencies.push({
            callbackStart: node.start,
            dependency: dependency.name,
          });
        }
      }
    }
  });

  const temporalDeadZoneDependencies = callbackDependencies.filter(({ callbackStart, dependency }) => {
    const declarationStart = declarations.get(dependency);
    return declarationStart !== undefined && declarationStart > callbackStart;
  });

  assert.deepEqual(
    temporalDeadZoneDependencies,
    [],
    "useCallback dependency arrays must not reference const/let declarations that appear later",
  );
});
