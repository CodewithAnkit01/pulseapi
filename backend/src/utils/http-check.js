import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

import {
  isPublicIp,
  normalizeHostname,
  validateMonitorUrl,
} from "./ssrf.js";

async function lookupPublicIp(hostname) {
  const normalized = normalizeHostname(hostname);

  // IP literals must pass the public-address check.
  if (net.isIP(normalized)) {
    if (!isPublicIp(normalized)) {
      throw new Error("Target IP is not publicly routable");
    }

    return [
      {
        address: normalized,
        family: net.isIP(normalized),
      },
    ];
  }

  const addresses = await dns.lookup(normalized, {
    all: true,
    verbatim: true,
  });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIp(address))
  ) {
    throw new Error(
      "Hostname resolved to a non-public IP address"
    );
  }

  return addresses;
}

export async function performHttpCheck(monitor) {
  const startedAt = Date.now();

  try {
    // Validate the URL and its DNS answers.
    const validatedUrl = await validateMonitorUrl(monitor.url);
    const target = new URL(validatedUrl);

    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.username ||
      target.password
    ) {
      throw new Error("Unsupported or unsafe monitor URL");
    }

    // Resolve again immediately before connecting.
    // Pin the socket to a validated address to reduce DNS-rebinding risk.
    const addresses = await lookupPublicIp(target.hostname);
    const selected = addresses[0];

    if (!selected?.address || !selected?.family) {
      throw new Error("No valid public IP address was selected");
    }

    const transport =
      target.protocol === "https:" ? https : http;

    return await new Promise((resolve) => {
      let settled = false;
      let timer;

      const finish = (result) => {
        if (settled) return;

        settled = true;

        if (timer) {
          clearTimeout(timer);
        }

        resolve({
          ...result,
          durationMs: Date.now() - startedAt,
        });
      };

      const request = transport.request(
        target,
        {
          method: monitor.method,
          headers: monitor.headers ?? {},

          // Important fix:
          // Node can invoke lookup(hostname, callback) OR
          // lookup(hostname, options, callback).
          // Support both signatures.
          lookup: (_hostname, options, callback) => {
            if (typeof options === "function") {
              callback = options;
              options = {};
            }

            if (options?.all) {
              callback(null, [
                {
                  address: selected.address,
                  family: selected.family,
                },
              ]);
            } else {
              callback(
                null,
                selected.address,
                selected.family
              );
            }
          },

          // Avoid connection reuse to prevent stale socket reuse
          // across monitor checks.
          agent: false,
        },
        (response) => {
          const statusCode = response.statusCode ?? 0;

          // Do not follow redirects. A redirect may point to an
          // internal service, so report its status as received.
          response.resume();

          response.on("end", () => {
            const successful =
              monitor.expectedStatusCodes.includes(statusCode);

            finish({
              outcome: successful ? "SUCCESS" : "FAILURE",
              statusCode,
              errorType: successful ? null : "HTTP_STATUS",
              errorMessage: successful
                ? null
                : `Unexpected HTTP status: ${statusCode}`,
            });
          });

          response.on("error", (error) => {
            finish({
              outcome: "ERROR",
              statusCode,
              errorType: "RESPONSE_ERROR",
              errorMessage: error.message,
            });
          });
        }
      );

      timer = setTimeout(() => {
        const error = new Error("Monitor request timed out");
        error.code = "ETIMEDOUT";
        request.destroy(error);
      }, monitor.timeoutMs);

      request.on("error", (error) => {
        const timedOut =
          error.code === "ETIMEDOUT" ||
          error.code === "ESOCKETTIMEDOUT";

        finish({
          outcome: timedOut ? "TIMEOUT" : "ERROR",
          statusCode: null,
          errorType: timedOut
            ? "TIMEOUT"
            : error.code || "NETWORK_ERROR",
          errorMessage: error.message,
        });
      });

      request.end();
    });
  } catch (error) {
    return {
      outcome: "ERROR",
      statusCode: null,
      durationMs: Date.now() - startedAt,
      errorType: error.code || "VALIDATION_OR_DNS_ERROR",
      errorMessage: error.message,
    };
  }
}