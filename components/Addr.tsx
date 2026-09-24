"use client";

import { Address } from "@scaffold-ui/components";
import type { ComponentProps } from "react";
import { base } from "viem/chains";

/** Scaffold UI's <Address> (ENS, blockie, explorer link) pinned to Base.
 * Always use this to show an address. It also lets server components render
 * one (a chain object can't cross into a client component). */
export function Addr({ address, ...rest }: { address: string } & Omit<ComponentProps<typeof Address>, "address" | "chain">) {
  return <Address address={address as `0x${string}`} chain={base} {...rest} />;
}
