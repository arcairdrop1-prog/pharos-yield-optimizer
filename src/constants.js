export const MCP_URL = "https://mcp.pharos.xyz/mcp";
export const CHAIN_ID = 1672;
export const NETWORK = "Pharos Pacific Mainnet";
export const EXPLORER = "https://pharosscan.xyz";
export const ENGINE_VERSION = "1.2.0";
export const WINDOW_SECONDS = 604800;
export const USDC = { symbol: "USDC", address: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", decimals: 6 };

export const SOURCES = [
  {
    id: "centrifuge-jtrsy", name: "JTRSY / USDC", protocol: "Centrifuge",
    vault: "0x160e0dd4c4f693b05eca83bc2ec6fd51954fc434", share: "0xc18e6f730896971a79d748e8dea61067a9bc6040",
    shareSymbol: "JTRSY", shareDecimals: 6, relationship: "erc7575", asyncSettlement: true, permissioned: true,
    documentation: "https://docs.centrifuge.io/developer/protocol/deployments/",
    feeBasis: "No universal on-chain entry/exit fee was verified; user-configured fee assumptions are required.",
    restrictions: "Permissioning and asynchronous request/fulfillment/claim settlement may apply; eligibility and timing are not inferred.",
    methodology: "Fixed one-share convertToAssets change over a timestamp-resolved seven-day window."
  },
  {
    id: "centrifuge-hyb", name: "HYB / USDC", protocol: "Centrifuge",
    vault: "0x74189e017d3aefee48f3cc5bf592694b2a016da8", share: "0x4827c7ecce4f07adfe44a97165f06a199e7d2505",
    shareSymbol: "HYB", shareDecimals: 18, relationship: "erc7575", asyncSettlement: true, permissioned: true,
    documentation: "https://docs.centrifuge.io/developer/protocol/deployments/",
    feeBasis: "No universal on-chain entry/exit fee was verified; user-configured fee assumptions are required.",
    restrictions: "Permissioning and asynchronous request/fulfillment/claim settlement may apply; eligibility and timing are not inferred.",
    methodology: "Fixed one-share convertToAssets change over a timestamp-resolved seven-day window."
  },
  {
    id: "morpho-rockawayx-usdc", name: "RockawayX USDC V2", protocol: "Morpho",
    vault: "0x047cd0a91e9b92ed979189a6c8a120bf280f02e5", share: "0x047cd0a91e9b92ed979189a6c8a120bf280f02e5",
    shareSymbol: "roxUSDC", shareDecimals: 18, relationship: "erc4626", asyncSettlement: false, permissioned: false,
    documentation: "https://campaigns.morpho.org/opportunities/11686569320310112064",
    feeBasis: "No universal on-chain entry/exit fee was verified; user-configured fee assumptions are required.",
    restrictions: "Synchronous ERC-4626 conversion was verified; liquidity, caps, and user eligibility still require current checks.",
    methodology: "Fixed one-share ERC-4626 convertToAssets change over a timestamp-resolved seven-day window."
  }
];

export const SELECTORS = { asset: "0x38d52e0f", share: "0xa8d5fd65", decimals: "0x313ce567", convertToAssets: "0x07a2d13a" };
export const MCP_ALLOWLIST = ["get_chain_info", "get_block_number", "get_block", "get_code", "eth_call", "get_gas_price"];
