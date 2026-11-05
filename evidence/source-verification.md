Source verification matrix
Foundation verified with the hosted, read-only official Pharos Chain MCP on Pharos Pacific Mainnet (1672). The MCP listed its schemas at runtime; this project allowlists only get_chain_info, get_block_number, get_block, get_code, eth_call, and get_gas_price.

Common observed window: block 20000115 (1791754192) to block 20601968 (1792358993), 604801 seconds. The timestamp target differed by one second because the nearest block was selected. All end-state reads were pinned to block 20601968.

Source	Identity and deployment	Asset/share relationship	Fixed-share live reads	Observed change	Runtime code
JTRSY / USDC	Centrifuge Pharos USDC vault 0x160e…c434; official deployment table	asset() = USDC 0xC879…1815 (6); share() = JTRSY 0xc18e…6040 (6)	convertToAssets(1000000): 1119074 → 1119288	+0.01912295%	vault 12018 B; share 7448 B; USDC 1798 B
HYB / USDC	Centrifuge Pharos USDC vault 0x7418…6da8; official deployment table	asset() = same USDC; share() = HYB 0x4827…2505 (18)	convertToAssets(1e18): 981773 → 988120	+0.64648345%	vault 12018 B; share 7448 B; USDC 1798 B
RockawayX USDC V2	Morpho vault 0x047c…02e5; official campaign page links this selected Pharos vault	ERC-4626 vault is its 18-decimal share; asset() = same USDC	convertToAssets(1e18): 1005811 → 1006583	+0.07675398%	vault/share 21808 B; USDC 1798 B
These are three distinct contracts and share instruments. JTRSY and HYB are separate official Centrifuge fund vaults, not two wrappers over one vault; RockawayX is a separate Morpho ERC-4626 vault. The task explicitly permits multiple vaults within one protocol.

Method semantics and restrictions
The rate basis is fixed-share value change, not TVL, wallet balance, advertised APR, or APY. The same source-specific one-share raw quantity is converted at both pinned blocks with integer arithmetic.
Centrifuge documents ERC-7540 asynchronous request → fulfillment → claim flows and ERC-7575 share relationships. Permissioning, custom compliance hooks, lockups, minimums, and fulfillment timing may vary. The optimizer models explicit assumed non-earning delays and never asserts eligibility.
Morpho documents ERC-4626 convertToAssets, synchronous deposit/redeem mechanics, and capacity/liquidity limits. Campaign rewards are deliberately excluded because no supported live reward valuation/eligibility path is used.
Protocol-internal performance/management fees already reflected in share value are not added again. No universal user entry/exit fee was verified, so configurable entry/exit bps remain prominently ASSUMED rather than silently zero.
Gas price is live MCP data. Gas units, allowance state, safety buffer, and PROS/USDC conversion are configurable assumptions. An approval is counted only when the modeled allowance state requires it.
Historical change may be negative or flat and remains valid. It is linearly projected only as an explicitly conditional estimate, without default annualization.
The corrected engine 1.2 structured read and economic result are in live-comparison-v1.2.json. live-comparison.json is preserved as the historical engine 1.1 record, and the original pre-1.1 checkpoint remains in live-comparison-initial.json.
