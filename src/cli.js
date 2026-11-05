#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { readLiveComparison, deterministicFixture } from "./adapters.js";
import { analyze } from "./engine.js";

const args = process.argv.slice(2); const fixtureIndex = args.indexOf("--fixture");
const fixture = fixtureIndex >= 0 ? args[fixtureIndex + 1] || "profitable" : null;
const inputIndex = args.indexOf("--input"); const input = inputIndex >= 0 ? JSON.parse(await readFile(args[inputIndex + 1], "utf8")) : {};
const snapshot = fixture ? deterministicFixture(fixture) : await readLiveComparison();
console.log(JSON.stringify({ snapshot, analysis: analyze(snapshot, input) }, null, 2));
