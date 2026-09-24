import { fallback, http, createConfig } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  // base first (the default); mainnet only so <Address> can resolve ENS.
  chains: [base, mainnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "burn to tweet" }),
  ],
  transports: {
    [base.id]: http("https://mainnet.base.org"),
    // viem's default mainnet RPC hangs and SE-2's shared Alchemy key is dead.
    [mainnet.id]: fallback([http("https://ethereum-rpc.publicnode.com"), http("https://1rpc.io/eth")]),
  },
  ssr: true,
});
