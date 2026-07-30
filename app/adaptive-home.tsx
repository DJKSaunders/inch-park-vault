"use client";

import { useSyncExternalStore } from "react";
import { PortalHome, type PortalHomeProps } from "./portal-home";
import { RecordsExplorer } from "./records-explorer";

const subscribe = () => () => {};
const browserSnapshot = () =>
  window.self !== window.top ||
  new URLSearchParams(window.location.search).get("embed") === "1";
const serverSnapshot = () => false;

export function AdaptiveHome(props: PortalHomeProps) {
  const embedded = useSyncExternalStore(
    subscribe,
    browserSnapshot,
    serverSnapshot,
  );

  return embedded ? <RecordsExplorer /> : <PortalHome {...props} />;
}
