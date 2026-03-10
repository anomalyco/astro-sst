import fs from "fs/promises";
import { InternalEvent } from "../lib/event-mapper.js";

export function build404Url(url: string) {
  const url404 = new URL(url);
  url404.pathname = "/404";
  url404.search = "";
  url404.hash = "";
  return url404.toString();
}

export async function existsAsync(input: string) {
  return fs
    .access(input)
    .then(() => true)
    .catch(() => false);
}

export function createRequest(internalEvent: InternalEvent) {
  const requestUrl = internalEvent.url;
  const requestProps = {
    method: internalEvent.method,
    headers: internalEvent.headers,
    body: ["GET", "HEAD"].includes(internalEvent.method)
      ? undefined
      : internalEvent.body,
  };
  return new Request(requestUrl, requestProps);
}
