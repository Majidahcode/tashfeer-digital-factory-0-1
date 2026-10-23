import { expect, test } from "@playwright/test";
import nextConfig, { tunnelHosts } from "../../next.config";

test("the dev server stays closed to other origins unless TUNNEL_HOSTS names them", () => {
  expect(tunnelHosts(undefined)).toEqual([]);
  expect(tunnelHosts("")).toEqual([]);
  expect(tunnelHosts(" , ")).toEqual([]);
  expect(tunnelHosts("nightlife-protected-bureau-responsibility.trycloudflare.com")).toEqual([
    "nightlife-protected-bureau-responsibility.trycloudflare.com",
  ]);
  expect(tunnelHosts("a.trycloudflare.com, *.example.com")).toEqual(["a.trycloudflare.com", "*.example.com"]);
  // as loaded here (no TUNNEL_HOSTS in the test environment): no allowedDevOrigins at all
  if (!process.env.TUNNEL_HOSTS) expect(nextConfig.allowedDevOrigins).toBeUndefined();
});
