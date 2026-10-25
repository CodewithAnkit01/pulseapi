import dns from "node:dns/promises";
import net from "node:net";
import ipaddr from "ipaddr.js";

const isPublicIp = (address) => {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  try {
    const parsed = ipaddr.process(address);

    // Reject private, loopback, link-local, reserved,
    // multicast, and other non-global address ranges.
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
};

const normalizeHostname = (hostname) => {
  let normalized = hostname.toLowerCase();

  // URL.hostname can include brackets for IPv6 literals.
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  // Remove a trailing dot from DNS names.
  if (!net.isIP(normalized)) {
    normalized = normalized.replace(/\.$/, "");
  }

  return normalized;
};

export const validateMonitorUrl = async (value) => {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error("Monitor URL is invalid"), {
      statusCode: 400,
      code: "INVALID_MONITOR_URL",
    });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(
      new Error("Only HTTP and HTTPS monitor URLs are supported"),
      {
        statusCode: 400,
        code: "UNSUPPORTED_URL_PROTOCOL",
      }
    );
  }

  if (url.username || url.password) {
    throw Object.assign(
      new Error("Monitor URLs must not contain credentials"),
      {
        statusCode: 400,
        code: "URL_CREDENTIALS_NOT_ALLOWED",
      }
    );
  }

  const hostname = normalizeHostname(url.hostname);

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw Object.assign(
      new Error("Monitor URL must use a public hostname"),
      {
        statusCode: 400,
        code: "PRIVATE_HOST_NOT_ALLOWED",
      }
    );
  }

  // IP literals do not require DNS lookup.
  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) {
      throw Object.assign(
        new Error("Private or reserved IP addresses are not allowed"),
        {
          statusCode: 400,
          code: "PRIVATE_IP_NOT_ALLOWED",
        }
      );
    }

    return url.toString();
  }

  let addresses;

  try {
    addresses = await dns.lookup(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw Object.assign(
      new Error("Monitor hostname could not be resolved"),
      {
        statusCode: 400,
        code: "DNS_LOOKUP_FAILED",
      }
    );
  }

  // Reject the hostname if ANY answer is not public.
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIp(address))
  ) {
    throw Object.assign(
      new Error("Monitor hostname resolves to a private or reserved IP"),
      {
        statusCode: 400,
        code: "PRIVATE_IP_NOT_ALLOWED",
      }
    );
  }

  return url.toString();
};

export { isPublicIp, normalizeHostname };