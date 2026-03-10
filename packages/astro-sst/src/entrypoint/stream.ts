import { createApp } from "astro/app/entrypoint";
import fs from "fs/promises";
import type { APIGatewayProxyEventV2, Callback, Context } from "aws-lambda";
import { convertFrom, convertTo } from "../lib/event-mapper.js";
import { debug } from "../lib/logger.js";
import { ResponseStream } from "../lib/types";
import { build404Url, createRequest, existsAsync } from "../lib/entrypoint-utils.js";

type RequestHandler = (
  event: APIGatewayProxyEventV2,
  streamResponse: ResponseStream,
  context?: Context,
  callback?: Callback,
) => void | Promise<void>;

declare global {
  const awslambda: {
    streamifyResponse(handler: RequestHandler): RequestHandler;
    HttpResponseStream: {
      from(
        underlyingStream: ResponseStream,
        metadata: {
          statusCode: number;
          headers?: Record<string, string>;
        },
      ): ResponseStream;
    };
  };
}

function streamError(
  statusCode: number,
  error: string | Error,
  responseStream: ResponseStream,
) {
  console.error(error);

  responseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: {
      "Content-Type": "text/html",
    },
  });

  responseStream.write(error.toString());
  responseStream.end();
}

const app = createApp();

async function streamHandler(
  event: APIGatewayProxyEventV2,
  responseStream: ResponseStream,
) {
  debug("event", event);

  const internalEvent = convertFrom(event);
  let request = createRequest(internalEvent);
  let routeData = app.match(request);
  if (!routeData) {
    // handle prerendered 404
    if (await existsAsync("404.html")) {
      return streamError(
        404,
        await fs.readFile("404.html", "utf-8"),
        responseStream,
      );
    }

    // handle server-side 404
    request = createRequest({
      ...internalEvent,
      url: build404Url(internalEvent.url),
    });
    routeData = app.match(request);
    if (!routeData) {
      return streamError(404, "Not found", responseStream);
    }
  }

  const response = await app.render(request, {
    routeData,
    clientAddress:
      internalEvent.headers["x-forwarded-for"] || internalEvent.remoteAddress,
  });

  // Stream response back to Cloudfront
  const convertedResponse = await convertTo({
    type: internalEvent.type,
    response,
    responseStream,
    cookies: Array.from(app.setCookieHeaders(response)),
  });

  debug("response", convertedResponse);
}

// https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
export const handler = awslambda.streamifyResponse(streamHandler);
