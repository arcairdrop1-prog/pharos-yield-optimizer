Verified live sources
All sources are on Pharos Pacific Mainnet (1672) and use Circle USDC 0xC879C018dB60520F4355C26eD1a6D572cdAC1815 (6 decimals).

Source	Protocol	Vault	Share	Measurement
JTRSY / USDC	Centrifuge	0x160e0dd4c4f693b05eca83bc2ec6fd51954fc434	JTRSY 0xc18e…6040, 6 decimals	One fixed share converted with convertToAssets at both endpoint blocks.
HYB / USDC	Centrifuge	0x74189e017d3aefee48f3cc5bf592694b2a016da8	HYB 0x4827…2505, 18 decimals	Same fixed-share method. This is a separate official fund share/vault, not a wrapper duplicate.
RockawayX USDC V2	Morpho	0x047cd0a91e9b92ed979189a6c8a120bf280f02e5	ERC-4626 vault share, 18 decimals	One vault share converted with convertToAssets at both endpoint blocks.
Official references: Centrifuge deployments, Centrifuge vault architecture, Centrifuge investment flow, Morpho opportunity, Morpho ERC-4626 mechanics, and the official Pharos MCP.

JAAA was investigated but rejected: its Pharos vault returned zero from both pricePerShare() and convertToAssets(1 share) at the checked endpoints, so it cannot support a defensible rate.

Method and decision rules
The adapter resolves a common block near exactly seven days before the end block using actual block timestamps. It verifies bytecode, asset(), share relationship where applicable, decimals, and fixed-share conversions at both endpoints. The result is vault share-value change over the observed period, not APY, personal profit, or a guaranteed return.

The engine projects the observed change linearly over the user horizon using BigInt. Projected proceeds round down; costs round up. Every eligible destination is evaluated independently using its own observation duration, settlement delay, earning time, and gas-bearing steps. The destination with the highest modeled final value is selected; raw historical return alone never selects the route. It compares:

moving final − staying final = incremental net gain

Costs include assumed current-source exit fee, destination entry fee, every modeled approval/request-or-deposit/claim/exit step, a gas safety buffer, live MCP gas price, and an explicitly assumed PROS/USDC conversion. Approval gas is included only when the configured allowance state requires it. These assumptions are prominent because no verified on-chain universal fee schedule or native-token oracle was established. Unknown is never silently treated as zero.

Cash flow is sequenced as capital → exit fee → exit proceeds → entry fee → destination-invested principal. Destination yield accrues only on that reduced invested principal. Gas is paid separately from a native PROS balance, so it does not reduce the USDC deposited; its conservatively converted USDC-equivalent cost is subtracted exactly once from route final value. Break-even uses this same route cash-flow function at whole-day horizons.

For asynchronous Centrifuge routes, configurable entry and exit settlement delays reduce the destination's earning time. Defaults are conservative assumptions, not claims about an actual pending order. The UI shows the modeled non-earning interval. Morpho's verified synchronous ERC-4626 route uses no asynchronous delay, while its liquidity, capacity, gates, and slippage still require a current transaction-time check.

RECOMMEND_MOVE requires all three fresh sources, comparable USDC units, horizon ≥ minimum, incremental gain strictly greater than the USDC threshold, and improvement strictly greater than the bps threshold. Otherwise the result is STAY_PUT; a missing/stale source or material unknown yields INSUFFICIENT_DATA. A zero or negative observed source return remains valid data rather than being discarded.

Centrifuge products may be permissioned and use asynchronous request/fulfillment/claim settlement. The interface does not claim user eligibility or an unlock state. Gas models request and claim operations and the answer remains conditional. Morpho and Centrifuge have different risks; higher historical performance is not evidence of lower risk.

Setup and CLI
npm install
npm test
npm run cli
The CLI and Worker both import src/engine.js. No signer or transaction code exists.

API
GET /api/meta — source definitions and defaults.
POST /api/analyze — { mode: "LIVE", requestKey, input } or explicitly labeled SIMULATED fixtures.
GET /api/runs — D1 run history.
GET /api/runs/:id — complete immutable stored run.
Every saved record includes inputs, raw observations, assumptions, formulas/engine version, costs, decision, and provenance. request_key is unique, preventing duplicate persistence on retry.

Reviewer procedure
Open the public demo and press LOAD LIVE DATA & ANALYZE →.
Confirm three LIVE DATA / HISTORICAL ESTIMATE cards, common blocks, timestamps, contracts, and methods.
Change capital, horizon, minimum holding period, or thresholds and analyze again.
Use RUN SIMULATED MOVE, RUN COST-ERASED FIXTURE, and RUN SHORT-HORIZON FIXTURE for deterministic decision branches; these never replace live evidence.
Use RUN BELOW-THRESHOLD FIXTURE and RUN MISSING-SOURCE FIXTURE to inspect the remaining safety gates.
Press REFRESH HISTORY, refresh the browser, and reopen a saved run. A reloaded record is visibly marked HISTORICAL.
Formula and evidence
For each source, observed return = (end assets per fixed share − start assets per fixed share) / start assets per fixed share. Projection is linear over the configured earning seconds and deliberately is not labeled APY. Integer division rounds projected proceeds down. Fees and native gas conversion round costs up.

exit proceeds = capital − ceil(capital × exit fee rate)

entry fee = ceil(exit proceeds × entry fee rate)

invested principal = exit proceeds − entry fee

moving final = invested principal + projected destination yield(invested principal, earning time) − gas equivalent

staying final = capital + projected current-source yield(capital, horizon)

incremental net gain = moving final − staying final

Live freshness is checked from the pinned end-block timestamp to the actual analysis time, including when a previously saved snapshot is re-analyzed. Snapshot capture time is not used as a freshness substitute.

Internal protocol fees already reflected in the observed share value are not added again. The full current source matrix is in evidence/source-verification.md. evidence/live-comparison.json is preserved as historical engine 1.1.0 evidence; the corrected engine 1.2.0 capture is evidence/live-comparison-v1.2.json. Deterministic branch evidence is in evidence/scenarios-v1.2.json, while the original evidence/scenarios.json remains unchanged as a historical record.

The corrected saved live example uses hypothetical 10,000 USDC idle capital over 90 days. Its exact result is recorded in the versioned 1.2.0 evidence rather than rewriting the original historical record. It is not a verified wallet position, guarantee, or eligibility assertion
