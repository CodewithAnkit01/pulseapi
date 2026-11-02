
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import ipaddr from "ipaddr.js";

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;

// IPv4 special-purpose and non-public networks.
const BLOCKED_IPV4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
];

// Only globally routable IPv6 space is considered.
// Special-purpose ranges inside it are explicitly blocked.
const GLOBAL_IPV6 = "2000::/3";

const BLOCKED_IPV6 = [
  "::/128",
  "::1/128",
  "::ffff:0:0/96",
  "64:ff9b:1::/48",
  "100::/64",
  "2001::/23",
  "2001:db8::/32",
  "2002::/16",
  "3fff::/20",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

const parsedBlockedIPv4 = BLOCKED_IPV4.map((cidr) =>
  ipaddr.parseCIDR(cidr)
);

const parsedBlockedIPv6 = BLOCKED_IPV6.map((cidr) =>
  ipaddr.parseCIDR(cidr)
);

const parsedGlobalIPv6 = ipaddr.parseCIDR(GLOBAL_IPV6);

function normalizeHostname(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function isBlockedByCidr(address, ranges) {
  return ranges.some(([network, prefix]) =>
    address.match(network, prefix)
  );
}

function isPublicIp(address) {
  try {
    const parsed = ipaddr.parse(address);

    // IPv4-mapped IPv6 addresses must not bypass IPv4 checks.
    if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress()) {
      return false;
    }

    if (parsed.kind() === "ipv4") {
      return (
        parsed.range() === "unicast" &&
        !isBlockedByCidr(parsed, parsedBlockedIPv4)
      );
    }

    // IPv6 must belong to global unicast space.
    return (
      parsed.match(parsedGlobalIPv6[0], parsedGlobalIPv6[1]) &&
      !isBlockedByCidr(parsed, parsedBlockedIPv6)
    );
  } catch {
    return false;
  }
}

function validateHostname(hostname) {
  const normalized = normalizeHostname(hostname).toLowerCase();

  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid")
  ) {
    throw new Error("Webhook hostname is not allowed");
  }

  return normalized;
}


export function createSafeLookup({
  lookup = dns.lookup,
} = {}) {
  return (hostname, options = {}, callback) => {
    let normalizedHost;

    try {
      normalizedHost = validateHostname(hostname);
    } catch (error) {
      error.code = "SSRF_BLOCKED";
      return callback(error);
    }

    // Handle IP literals without DNS.
    if (net.isIP(normalizedHost)) {
      if (!isPublicIp(normalizedHost)) {
        const error = new Error(
          "Webhook destination IP is not globally routable"
        );
        error.code = "SSRF_BLOCKED";
        return callback(error);
      }

      const family = net.isIP(normalizedHost);

      if (options.all) {
        return callback(null, [
          { address: normalizedHost, family },
        ]);
      }

      return callback(null, normalizedHost, family);
    }

    lookup(
      normalizedHost,
      { all: true, verbatim: true },
      (error, addresses) => {
        if (error) return callback(error);

        if (!Array.isArray(addresses) || addresses.length === 0) {
          return callback(
            new Error("Webhook hostname has no DNS records")
          );
        }

        // Validate every DNS answer, including mixed responses.
        for (const record of addresses) {
          if (
            !record ||
            typeof record.address !== "string" ||
            net.isIP(record.address) !== record.family ||
            !isPublicIp(record.address)
          ) {
            const blocked = new Error(
              "Webhook DNS resolved to an invalid or non-public IP"
            );
            blocked.code = "SSRF_BLOCKED";
            return callback(blocked);
          }
        }

        // The socket receives only the validated IP addresses.
        if (options.all) {
          return callback(null, addresses);
        }

        const selected = addresses[0];

        return callback(
          null,
          selected.address,
          selected.family
        );
      }
    );
  };
}



export function validateWebhookUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Webhook URL is required");
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid webhook URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URLs must use HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Webhook URLs must not contain credentials");
  }

  if (url.port && url.port !== "443") {
    throw new Error("Webhook URLs must use port 443");
  }

  if (!url.hostname) {
    throw new Error("Webhook hostname is required");
  }

  const hostname = validateHostname(url.hostname);

  // IMPORTANT: validate IP literals immediately.
  if (net.isIP(hostname) && !isPublicIp(hostname)) {
    throw new Error(
      "Webhook destination IP is not globally routable"
    );
  }

  return url;
}


export function sendSafeWebhook(urlValue, payload) {
  const url = validateWebhookUrl(urlValue);

  const hostname = normalizeHostname(url.hostname);

  if (net.isIP(hostname) && !isPublicIp(hostname)) {
    throw new Error(
      "Webhook destination IP is not globally routable"
    );
  }

  const body = JSON.stringify(payload);

  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
    throw new Error("Webhook payload exceeds 64 KB");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let responseBytes = 0;
    const chunks = [];

    function fail(error) {
      if (settled) return;

      settled = true;
      reject(error);
    }

    const request = https.request(
      url,
      {
        method: "POST",
        agent: false,
        lookup: createSafeLookup(),
        maxHeaderSize: 16 * 1024,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "User-Agent": "PulseAPI-Webhook/1.0",
          "X-PulseAPI-Event": payload.eventType,
          "X-PulseAPI-Incident-ID": payload.incident.id,
        },
      },
      (response) => {
        response.on("data", (chunk) => {
          responseBytes += chunk.length;

          if (responseBytes > MAX_RESPONSE_BYTES) {
            const error = new Error(
              "Webhook response exceeded 16 KB"
            );

            request.destroy(error);
            fail(error);
            return;
          }

          chunks.push(chunk);
        });

        response.on("end", () => {
          if (settled) return;

          const statusCode = response.statusCode || 0;

          // Redirects are deliberately not followed.
          if (statusCode < 200 || statusCode >= 300) {
            return fail(
              new Error(`Webhook returned HTTP ${statusCode}`)
            );
          }

          settled = true;

          resolve({
            statusCode,
            responseBody: Buffer.concat(chunks).toString("utf8"),
          });
        });

        response.on("error", fail);
      }
    );

    // Socket inactivity timeout.
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("Webhook request timed out"));
    });

    // Total request deadline, including DNS resolution.
    const deadline = setTimeout(() => {
      request.destroy(
        new Error("Webhook request exceeded 8-second deadline")
      );
    }, REQUEST_TIMEOUT_MS);

    request.on("close", () => {
      clearTimeout(deadline);
    });

    request.on("error", fail);

    request.end(body);
  });
}
