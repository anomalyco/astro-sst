import { createApp } from "astro/app/entrypoint";
import type {
  APIGatewayProxyEventV2,
  CloudFrontRequestEvent,
} from "aws-lambda";
import fs from "fs/promises";
import { convertFrom, convertTo } from "../lib/event-mapper.js";
import { debug } from "../lib/logger.js";
import {
  build404Url,
  createRequest,
  existsAsync,
} from "../lib/entrypoint-utils.js";

const app = createApp();

export async function handler(
  event: APIGatewayProxyEventV2 | CloudFrontRequestEvent,
) {
  debug("event", event);

  const internalEvent = convertFrom(event);
  let request = createRequest(internalEvent);
  let routeData = app.match(request);
  if (!routeData) {
    // handle prerendered 404
    if (await existsAsync("404.html")) {
      return convertTo({
        type: internalEvent.type,
        response: new Response(await fs.readFile("404.html", "utf-8"), {
          status: 404,
          headers: {
            "Content-Type": "text/html",
          },
        }),
      });
    }

    // handle server-side 404
    request = createRequest({
      ...internalEvent,
      url: build404Url(internalEvent.url),
    });
    routeData = app.match(request);
    if (!routeData) {
      return convertTo({
        type: internalEvent.type,
        response: new Response("Not found", { status: 404 }),
      });
    }
  }

  // Process request
  const response = await app.render(request, {
    routeData,
    clientAddress:
      internalEvent.headers["x-forwarded-for"] || internalEvent.remoteAddress,
  });

  // Buffer response back to Cloudfront
  const convertedResponse = await convertTo({
    type: internalEvent.type,
    response,
    cookies: Array.from(app.setCookieHeaders(response)),
  });

  debug("response", convertedResponse);
  return convertedResponse;
}
