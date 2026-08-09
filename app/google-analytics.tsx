"use client";

import { useEffect } from "react";

const measurementId = "G-KY87HDT0QL";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics() {
  useEffect(() => {
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      document.querySelector(`script[data-vault-analytics="${measurementId}"]`)
    ) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.dataset.vaultAnalytics = measurementId;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return null;
}
