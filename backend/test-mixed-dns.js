
import { createSafeLookup } from "./src/utils/ssrf-safe-request.js";

const cases = [
  {
    name: "Public IPv4",
    addresses: [
      { address: "104.20.23.154", family: 4 },
    ],
    expected: "ACCEPT",
  },
  {
    name: "Private IPv4",
    addresses: [
      { address: "127.0.0.1", family: 4 },
    ],
    expected: "BLOCK",
  },
  {
    name: "Mixed public and private IPv4",
    addresses: [
      { address: "104.20.23.154", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
    expected: "BLOCK",
  },
  {
    name: "Private IPv6",
    addresses: [
      { address: "fc00::1", family: 6 },
    ],
    expected: "BLOCK",
  },
  {
    name: "Mixed public IPv4 and private IPv6",
    addresses: [
      { address: "104.20.23.154", family: 4 },
      { address: "fc00::1", family: 6 },
    ],
    expected: "BLOCK",
  },
];

for (const test of cases) {
  const fakeLookup = (hostname, options, callback) => {
    callback(null, test.addresses);
  };

  const safeLookup = createSafeLookup({
    lookup: fakeLookup,
  });

  await new Promise((resolve) => {
    safeLookup(
      "pulseapi-test.example",
      { all: true },
      (error, addresses) => {
        const actual = error ? "BLOCK" : "ACCEPT";
        const passed = actual === test.expected;

        console.log(
          `${passed ? "PASS" : "FAIL"}: ${test.name} → ${actual}`
        );

        resolve();
      }
    );
  });
}
