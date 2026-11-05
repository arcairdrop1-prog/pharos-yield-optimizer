import { CHAIN_ID, ENGINE_VERSION, MCP_URL, NETWORK, SELECTORS, SOURCES, USDC, WINDOW_SECONDS } from "./constants.js";
import { codeBytes, decodeAddress, decodeUint, encodeUintCall, formatUnits, pow10 } from "./fixed.js";
import { withPharosMcp } from "./pharos-mcp.js";

async function resolveTimestampBlock(call, endBlock, endTimestamp, targetTimestamp) {
  let guess = Math.max(0, endBlock - (endTimestamp - targetTimestamp));
  let prior = -1;
  for (let i = 0; i < 8 && guess !== prior; i += 1) {
    const block = await call("get_block", { block: guess, includeTransactions: false });
    const timestamp = Number(BigInt(block.timestamp));
    if (Math.abs(timestamp - targetTimestamp) <= 1) return { number: guess, timestamp, hash: block.hash, targetTimestamp };
    prior = guess;
    guess = Math.max(0, Math.min(endBlock, guess + (targetTimestamp - timestamp)));
  }
  const block = await call("get_block", { block: guess, includeTransactions: false });
  return { number: guess, timestamp: Number(BigInt(block.timestamp)), hash: block.hash, targetTimestamp };
}

export async function readLiveComparison(options = {}) {
  const execute = async ({ call, tools }) => {
    const chain = await call("get_chain_info");
    if (Number(chain.chainId) !== CHAIN_ID) throw new Error(`Wrong network: expected ${CHAIN_ID}, got ${chain.chainId}.`);
    const endNumber = Number((await call("get_block_number")).blockNumber);
    const endBlock = await call("get_block", { block: endNumber, includeTransactions: false });
    const endTimestamp = Number(BigInt(endBlock.timestamp));
    const start = await resolveTimestampBlock(call, endNumber, endTimestamp, endTimestamp - WINDOW_SECONDS);
    const gas = await call("get_gas_price");
    const observations = [];
    const add = (item) => { const value = { id: `SRC-${String(observations.length + 1).padStart(2, "0")}`, ...item }; observations.push(value); return value; };
    add({ kind: "chain", status: "ok", method: "get_chain_info", raw: chain, interpreted: `${NETWORK} / ${CHAIN_ID}` });
    add({ kind: "block", status: "ok", method: "get_block", blockNumber: start.number, timestamp: start.timestamp, targetTimestamp: start.targetTimestamp, raw: start.hash });
    add({ kind: "block", status: "ok", method: "get_block", blockNumber: endNumber, timestamp: endTimestamp, raw: endBlock.hash });
    add({ kind: "gas", status: "ok", method: "get_gas_price", blockNumber: endNumber, raw: gas.gasPriceWei, unit: "wei", interpreted: `${gas.gasPriceGwei} gwei` });

    const callAt = async (to, data, block) => (await call("eth_call", { transaction: { to, data }, block })).result;
    const usdcDecimals = Number(decodeUint(await callAt(USDC.address, SELECTORS.decimals, endNumber), "USDC decimals"));
    if (usdcDecimals !== USDC.decimals) throw new Error(`Unexpected USDC decimals ${usdcDecimals}.`);
    const usdcCode = {};
    for (const block of [start.number, endNumber]) {
      const code = (await call("get_code", { address: USDC.address, block })).code;
      usdcCode[block] = codeBytes(code);
      if (!usdcCode[block]) throw new Error(`USDC bytecode missing at block ${block}.`);
    }

    const sources = [];
    for (const source of SOURCES) {
      try {
        const shareDecimals = Number(decodeUint(await callAt(source.share, SELECTORS.decimals, endNumber), `${source.shareSymbol} decimals`));
        if (shareDecimals !== source.shareDecimals) throw new Error(`Expected ${source.shareDecimals} share decimals; got ${shareDecimals}.`);
        const fixedShareRaw = pow10(shareDecimals).toString();
        const points = [];
        for (const block of [start.number, endNumber]) {
          const timestamp = block === start.number ? start.timestamp : endTimestamp;
          const [vaultCodeResult, shareCodeResult] = await Promise.all([
            call("get_code", { address: source.vault, block }),
            source.share.toLowerCase() === source.vault.toLowerCase() ? Promise.resolve(null) : call("get_code", { address: source.share, block })
          ]);
          const vaultBytes = codeBytes(vaultCodeResult.code);
          const shareBytes = shareCodeResult ? codeBytes(shareCodeResult.code) : vaultBytes;
          if (!vaultBytes || !shareBytes) throw new Error(`Required bytecode missing at block ${block}.`);
          const asset = decodeAddress(await callAt(source.vault, SELECTORS.asset, block), `${source.id} asset`);
          if (asset !== USDC.address.toLowerCase()) throw new Error(`Unexpected asset ${asset}.`);
          let share = source.vault.toLowerCase();
          if (source.relationship === "erc7575") share = decodeAddress(await callAt(source.vault, SELECTORS.share, block), `${source.id} share`);
          if (share !== source.share.toLowerCase()) throw new Error(`Unexpected share ${share}.`);
          const assetsRaw = decodeUint(await callAt(source.vault, encodeUintCall(SELECTORS.convertToAssets, fixedShareRaw), block), `${source.id} convertToAssets`).toString();
          if (BigInt(assetsRaw) <= 0n) throw new Error(`Non-positive fixed-share conversion at block ${block}.`);
          const obs = add({ kind: "yield-point", status: "ok", sourceId: source.id, contract: source.vault, method: "convertToAssets", arguments: [fixedShareRaw], blockNumber: block, timestamp, raw: assetsRaw, decimals: USDC.decimals, interpreted: `${formatUnits(assetsRaw, USDC.decimals, USDC.decimals)} USDC`, relationship: { asset, share }, codeBytes: { vault: vaultBytes, share: shareBytes, asset: usdcCode[block] } });
          points.push({ blockNumber: block, timestamp, assetsRaw, assetsFormatted: formatUnits(assetsRaw, USDC.decimals, USDC.decimals), observationId: obs.id });
        }
        const startAssets = BigInt(points[0].assetsRaw); const endAssets = BigInt(points[1].assetsRaw); const delta = endAssets - startAssets;
        sources.push({ ...source, status: "ok", asset: USDC, fixedShareRaw, start: points[0], end: points[1], elapsedSeconds: points[1].timestamp - points[0].timestamp, observedReturnScale: 12, observedReturnRaw: (delta * 10n ** 12n / startAssets).toString(), observedReturnPercent: formatUnits(delta * 100n * 10n ** 8n / startAssets, 8, 8), sourceIds: points.map((point) => point.observationId), label: "LIVE DATA / HISTORICAL ESTIMATE" });
      } catch (error) {
        const obs = add({ kind: "source-error", status: "error", sourceId: source.id, contract: source.vault, method: "adapter", blockNumber: endNumber, error: error.message });
        sources.push({ ...source, status: "error", error: error.message, sourceIds: [obs.id], label: "LIVE DATA / UNAVAILABLE" });
      }
    }
    return { schemaVersion: 1, engineVersion: ENGINE_VERSION, mode: "LIVE", capturedAt: new Date().toISOString(), network: NETWORK, chainId: CHAIN_ID, mcpEndpoint: MCP_URL, mcpTools: tools, block: { number: endNumber, hash: endBlock.hash, timestamp: endTimestamp }, window: { targetSeconds: WINDOW_SECONDS, startBlock: start.number, startTimestamp: start.timestamp, endBlock: endNumber, endTimestamp, elapsedSeconds: endTimestamp - start.timestamp }, gas: { gasPriceWei: gas.gasPriceWei, gasPriceGwei: gas.gasPriceGwei, sourceId: "SRC-04" }, sources, observations, readOnly: true };
  };
  return options.mcp ? execute(options.mcp) : withPharosMcp(execute, options);
}

export function deterministicFixture(kind = "profitable") {
  const base = { schemaVersion: 1, engineVersion: ENGINE_VERSION, mode: "SIMULATED", capturedAt: new Date().toISOString(), network: NETWORK, chainId: CHAIN_ID, block: { number: 0, hash: null, timestamp: 0 }, window: { elapsedSeconds: WINDOW_SECONDS }, gas: { gasPriceWei: "10000000000", gasPriceGwei: "10", sourceId: "FIX-GAS" }, observations: [{ id: "FIX-GAS", kind: "simulated-gas", status: "ok", raw: "10000000000" }], readOnly: true };
  const returns = kind === "profitable" ? ["100000000", "400000000", "900000000"] : ["100000000", "120000000", "130000000"];
  base.sources = SOURCES.map((source, index) => ({ ...source, status: "ok", asset: USDC, fixedShareRaw: pow10(source.shareDecimals).toString(), elapsedSeconds: WINDOW_SECONDS, observedReturnScale: 12, observedReturnRaw: returns[index], observedReturnPercent: formatUnits(BigInt(returns[index]) * 100n, 12, 8), sourceIds: [`FIX-${index + 1}`], label: "SIMULATED FIXTURE" }));
  base.observations.push(...base.sources.map((source, index) => ({ id: `FIX-${index + 1}`, kind: "simulated-yield", status: "ok", sourceId: source.id, raw: source.observedReturnRaw })));
  if (kind === "missing") {
    base.sources[1] = { ...base.sources[1], status: "error", error: "Deterministic injected source failure.", label: "SIMULATED FIXTURE / UNAVAILABLE" };
    base.observations[2] = { id: "FIX-2", kind: "simulated-source-error", status: "error", sourceId: base.sources[1].id, error: base.sources[1].error };
  }
  return base;
}
