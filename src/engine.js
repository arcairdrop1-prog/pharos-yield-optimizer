import { ENGINE_VERSION, SOURCES, USDC } from "./constants.js";
import { formatUnits, mulDivDown, mulDivUp, parseUnits, pow10 } from "./fixed.js";

const DAY = 86400n; const BPS = 10000n; const RATE = 10n ** 12n;

export const DEFAULT_INPUT = {
  capitalUsdc: "10000", currentSource: "idle", horizonDays: 90, minimumHoldingDays: 30,
  minimumNetGainUsdc: "10", minimumImprovementBps: 5, entryFeeBpsAssumed: 10, exitFeeBpsAssumed: 10,
  gasUnitsApproval: 65000, gasUnitsRequest: 260000, gasUnitsClaim: 180000, gasSafetyBufferBps: 2500,
  assumedProsPriceUsdc: "0.5", approvalRequired: true, asyncEntryDelayDaysAssumed: 2,
  asyncExitDelayDaysAssumed: 2, maximumDataAgeMinutes: 60
};

function nonNegativeInteger(value, name) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer.`);
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${name} cannot be negative.`);
  return parsed;
}

function projectedYield(capital, source, seconds) {
  return mulDivDown(mulDivDown(capital, BigInt(source.observedReturnRaw), RATE), seconds, BigInt(source.elapsedSeconds));
}

function gasCostUsdcRaw(snapshot, input, currentSource) {
  const approval = input.approvalRequired ? nonNegativeInteger(input.gasUnitsApproval, "gasUnitsApproval") : 0n;
  const destinationSteps = approval + nonNegativeInteger(input.gasUnitsRequest, "gasUnitsRequest") + (currentSource.destinationAsync ? nonNegativeInteger(input.gasUnitsClaim, "gasUnitsClaim") : 0n);
  const exitSteps = currentSource.id === "idle" ? 0n : nonNegativeInteger(input.gasUnitsRequest, "gasUnitsRequest") + (currentSource.currentAsync ? nonNegativeInteger(input.gasUnitsClaim, "gasUnitsClaim") : 0n);
  const safetyBufferBps = nonNegativeInteger(input.gasSafetyBufferBps, "gasSafetyBufferBps");
  const bufferedUnits = mulDivUp(destinationSteps + exitSteps, BPS + safetyBufferBps, BPS);
  const wei = bufferedUnits * BigInt(snapshot.gas.gasPriceWei);
  const prosPriceRaw = parseUnits(input.assumedProsPriceUsdc, USDC.decimals);
  if (prosPriceRaw < 0n) throw new Error("assumedProsPriceUsdc cannot be negative.");
  return { units: bufferedUnits, wei, usdcRaw: mulDivUp(wei, prosPriceRaw, pow10(18)), approvalUnits: approval, destinationUnits: destinationSteps, exitUnits: exitSteps };
}

function routeCashFlow({ snapshot, input, capital, current, destination, entryFeeBps, exitFeeBps, horizonSeconds }) {
  const exitDelayDays = current?.asyncSettlement ? nonNegativeInteger(input.asyncExitDelayDaysAssumed, "asyncExitDelayDaysAssumed") : 0n;
  const entryDelayDays = destination.asyncSettlement ? nonNegativeInteger(input.asyncEntryDelayDaysAssumed, "asyncEntryDelayDaysAssumed") : 0n;
  const transitionDelayDays = exitDelayDays + entryDelayDays;
  const earningSeconds = horizonSeconds > transitionDelayDays * DAY ? horizonSeconds - transitionDelayDays * DAY : 0n;
  const exitFee = current ? mulDivUp(capital, exitFeeBps, BPS) : 0n;
  const exitProceeds = capital - exitFee;
  const entryFee = mulDivUp(exitProceeds, entryFeeBps, BPS);
  const investedPrincipal = exitProceeds - entryFee;
  const destinationYield = projectedYield(investedPrincipal, destination, earningSeconds);
  const gas = gasCostUsdcRaw(snapshot, input, { id: input.currentSource, currentAsync: Boolean(current?.asyncSettlement), destinationAsync: Boolean(destination.asyncSettlement) });
  // Gas is paid separately in the native token. Its USDC-equivalent cost is deducted once
  // from route value, but it does not reduce the USDC principal deposited into the vault.
  const movingFinal = investedPrincipal + destinationYield - gas.usdcRaw;
  return { destination, exitDelayDays, entryDelayDays, transitionDelayDays, earningSeconds, exitFee, exitProceeds, entryFee, investedPrincipal, destinationYield, gas, movingFinal };
}

function breakEvenDays(route, capital, current) {
  const netAtDay = (days) => {
    const seconds = days * DAY;
    const earning = seconds > route.transitionDelayDays * DAY ? seconds - route.transitionDelayDays * DAY : 0n;
    const moving = route.investedPrincipal + projectedYield(route.investedPrincipal, route.destination, earning) - route.gas.usdcRaw;
    const staying = capital + (current ? projectedYield(capital, current, seconds) : 0n);
    return moving - staying;
  };
  const destinationSlope = route.investedPrincipal * BigInt(route.destination.observedReturnRaw) * BigInt(current?.elapsedSeconds || 1);
  const currentSlope = current ? capital * BigInt(current.observedReturnRaw) * BigInt(route.destination.elapsedSeconds) : 0n;
  if (destinationSlope <= currentSlope) return null;
  let high = route.transitionDelayDays > 0n ? route.transitionDelayDays : 1n;
  const limit = 1_000_000n;
  while (high < limit && netAtDay(high) <= 0n) high *= 2n;
  if (high > limit) high = limit;
  if (netAtDay(high) <= 0n) return null;
  let low = 0n;
  while (low + 1n < high) {
    const mid = (low + high) / 2n;
    if (netAtDay(mid) > 0n) high = mid; else low = mid;
  }
  return Number(high);
}

export function analyze(snapshot, values = {}, options = {}) {
  const input = { ...DEFAULT_INPUT, ...values };
  const materialCostsKnown = input.entryFeeBpsAssumed !== null && input.exitFeeBpsAssumed !== null && input.assumedProsPriceUsdc !== null && input.assumedProsPriceUsdc !== "";
  if (!materialCostsKnown) {
    input.entryFeeBpsAssumed ??= 0;
    input.exitFeeBpsAssumed ??= 0;
    input.assumedProsPriceUsdc ||= "0";
  }
  const capital = parseUnits(input.capitalUsdc, USDC.decimals);
  const threshold = parseUnits(input.minimumNetGainUsdc, USDC.decimals);
  if (capital <= 0n) throw new Error("capitalUsdc must be positive.");
  if (threshold < 0n) throw new Error("minimumNetGainUsdc cannot be negative.");
  const entryFeeBps = nonNegativeInteger(input.entryFeeBpsAssumed, "entryFeeBpsAssumed");
  const exitFeeBps = nonNegativeInteger(input.exitFeeBpsAssumed, "exitFeeBpsAssumed");
  const minimumImprovementBps = nonNegativeInteger(input.minimumImprovementBps, "minimumImprovementBps");
  if (entryFeeBps > BPS || exitFeeBps > BPS) throw new Error("Fee assumptions cannot exceed 10000 bps.");
  const horizonDays = nonNegativeInteger(input.horizonDays, "horizonDays");
  const minimumHoldingDays = nonNegativeInteger(input.minimumHoldingDays, "minimumHoldingDays");
  const horizonSeconds = horizonDays * DAY;
  const valid = snapshot.sources.filter((source) => source.status === "ok" && source.observedReturnRaw !== undefined && BigInt(source.elapsedSeconds) > 0n && source.asset?.address?.toLowerCase() === USDC.address.toLowerCase());
  const reasonCodes = [];
  if (!materialCostsKnown) reasonCodes.push("MATERIAL_COST_UNKNOWN");
  if (valid.length !== SOURCES.length) reasonCodes.push("SOURCE_UNAVAILABLE");
  if (snapshot.mode === "LIVE") {
    const analysisSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
    const maximumAge = Number(nonNegativeInteger(input.maximumDataAgeMinutes, "maximumDataAgeMinutes") * 60n);
    if (!Number.isFinite(analysisSeconds) || !snapshot.block?.timestamp || analysisSeconds - Number(snapshot.block.timestamp) > maximumAge) reasonCodes.push("STALE_SOURCE_DATA");
  }
  const current = input.currentSource === "idle" ? null : valid.find((source) => source.id === input.currentSource);
  if (input.currentSource !== "idle" && !current) reasonCodes.push("CURRENT_SOURCE_UNAVAILABLE");
  if (horizonDays < minimumHoldingDays) reasonCodes.push("HORIZON_BELOW_MINIMUM");
  const stayYield = current ? projectedYield(capital, current, horizonSeconds) : 0n;
  const stayingFinal = capital + stayYield;
  const routes = valid.filter((source) => source.id !== input.currentSource).map((destination) => routeCashFlow({ snapshot, input, capital, current, destination, entryFeeBps, exitFeeBps, horizonSeconds }));
  routes.sort((a, b) => a.movingFinal === b.movingFinal ? a.destination.id.localeCompare(b.destination.id) : a.movingFinal > b.movingFinal ? -1 : 1);
  const route = routes[0] || null;
  const destination = route?.destination || null;
  if (!route) reasonCodes.push("NO_DESTINATION");
  const transitionDelayDays = route?.transitionDelayDays || 0n;
  const earningSeconds = route?.earningSeconds || 0n;
  if (destination && earningSeconds === 0n && horizonSeconds > 0n) reasonCodes.push("NO_EARNING_TIME_AFTER_SETTLEMENT");
  const moveYield = route?.destinationYield || 0n;
  const exitFee = route?.exitFee || 0n;
  const entryFee = route?.entryFee || 0n;
  const gas = route?.gas || { usdcRaw: 0n, units: 0n, wei: 0n, approvalUnits: 0n, destinationUnits: 0n, exitUnits: 0n };
  const movingFinal = route?.movingFinal ?? capital;
  const incremental = movingFinal - stayingFinal;
  const improvementBps = capital ? incremental * BPS / capital : 0n;
  if (incremental <= threshold) reasonCodes.push(incremental === threshold ? "STRICT_THRESHOLD_EQUALITY" : "NET_GAIN_NOT_ABOVE_THRESHOLD");
  if (improvementBps <= minimumImprovementBps) reasonCodes.push("IMPROVEMENT_BPS_NOT_ABOVE_MINIMUM");
  const insufficient = reasonCodes.includes("SOURCE_UNAVAILABLE") || reasonCodes.includes("CURRENT_SOURCE_UNAVAILABLE") || reasonCodes.includes("NO_DESTINATION") || reasonCodes.includes("MATERIAL_COST_UNKNOWN") || reasonCodes.includes("STALE_SOURCE_DATA");
  const decision = insufficient ? "INSUFFICIENT_DATA" : reasonCodes.length ? "STAY_PUT" : "RECOMMEND_MOVE";
  const grossAdvantage = moveYield - stayYield;
  const breakEven = route ? breakEvenDays(route, capital, current) : null;
  return {
    engineVersion: ENGINE_VERSION, analyzedAt: new Date(options.nowMs ?? Date.now()).toISOString(), input, mode: snapshot.mode, conditional: true, assumptions: [
      `Entry fee ${input.entryFeeBpsAssumed} bps ASSUMED`, `Exit fee ${input.exitFeeBpsAssumed} bps ASSUMED`,
      `PROS price ${input.assumedProsPriceUsdc} USDC ASSUMED`, `Gas units and ${input.gasSafetyBufferBps} bps buffer ASSUMED`,
      `Approval ${input.approvalRequired ? "required" : "not required"} in the modeled allowance state`,
      `Async entry/exit non-earning delays ${input.asyncEntryDelayDaysAssumed}/${input.asyncExitDelayDaysAssumed} days ASSUMED when applicable`
    ], currentSource: current?.id || "idle", destination: destination?.id || null, decision, reasonCodes,
    calculations: {
      capitalRaw: capital.toString(), capital: formatUnits(capital, 6, 6), horizonSeconds: horizonSeconds.toString(), earningSeconds: earningSeconds.toString(), transitionDelayDays: transitionDelayDays.toString(),
      exitProceedsRaw: (route?.exitProceeds ?? capital).toString(), investedPrincipalRaw: (route?.investedPrincipal ?? capital).toString(), investedPrincipal: formatUnits(route?.investedPrincipal ?? capital, 6, 6), gasFunding: "SEPARATE_NATIVE_BALANCE",
      stayingYieldRaw: stayYield.toString(), stayingFinalRaw: stayingFinal.toString(), stayingFinal: formatUnits(stayingFinal, 6, 6),
      destinationYieldRaw: moveYield.toString(), movingFinalRaw: movingFinal.toString(), movingFinal: formatUnits(movingFinal, 6, 6),
      grossAdvantageRaw: grossAdvantage.toString(), grossAdvantage: formatUnits(grossAdvantage, 6, 6),
      exitFeeRaw: exitFee.toString(), entryFeeRaw: entryFee.toString(), gasCostRaw: gas.usdcRaw.toString(), gasUnits: gas.units.toString(), gasWei: gas.wei.toString(), approvalGasUnits: gas.approvalUnits.toString(), destinationGasUnits: gas.destinationUnits.toString(), exitGasUnits: gas.exitUnits.toString(),
      incrementalNetGainRaw: incremental.toString(), incrementalNetGain: formatUnits(incremental, 6, 6), improvementBps: improvementBps.toString(), thresholdRaw: threshold.toString(), breakEvenDays: breakEven,
      evaluatedRoutes: routes.map((candidate) => ({ destination: candidate.destination.id, movingFinalRaw: candidate.movingFinal.toString(), investedPrincipalRaw: candidate.investedPrincipal.toString(), destinationYieldRaw: candidate.destinationYield.toString(), transitionDelayDays: candidate.transitionDelayDays.toString(), earningSeconds: candidate.earningSeconds.toString(), gasCostRaw: candidate.gas.usdcRaw.toString() }))
    },
    disclosure: "Historical fixed-share performance is an estimate basis, not APY, guaranteed return, risk score, or proof of eligibility. Fee and native-price assumptions make every result conditional."
  };
}
