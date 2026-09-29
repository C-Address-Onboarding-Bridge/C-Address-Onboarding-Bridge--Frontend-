import { describe, it, expect, afterEach, vi } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { GET } from "../route";

const originalIndexerUrl = process.env.INDEXER_EVENTS_URL;
const originalFetch = global.fetch;

const TARGET_C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const ASSET_C_ADDRESS = StrKey.encodeContract(Keypair.random().rawPublicKey());
const SOURCE_G_ADDRESS = Keypair.random().publicKey();

/** scaddress:<kind>:<hex> the way indexer/src/poller.rs::decode_scval renders an ScVal::Address. */
function scAddress(kind: 0 | 1, strkeyAddress: string): string {
  const raw =
    kind === 1 ? StrKey.decodeContract(strkeyAddress) : StrKey.decodeEd25519PublicKey(strkeyAddress);
  return `scaddress:${kind}:${Buffer.from(raw).toString("hex")}`;
}

/** A realistic CAddressFunded IndexedEvent, matching indexer/src/poller.rs's actual topic order. */
function fundedEvent(overrides: {
  id?: string;
  eventType?: string;
  timestamp?: string;
  topics?: unknown;
  value?: unknown;
}) {
  return {
    id: overrides.id ?? "evt-1",
    event_type: overrides.eventType ?? "CAddressFunded",
    ledger_sequence: 100,
    contract_id: "C_TEST",
    tx_hash: "aabbcc",
    timestamp: overrides.timestamp ?? "2024-06-01T12:00:00Z",
    data: {
      topics:
        overrides.topics ??
        [
          "CAddressFunded",
          scAddress(1, ASSET_C_ADDRESS),
          scAddress(0, SOURCE_G_ADDRESS),
          scAddress(1, TARGET_C_ADDRESS),
        ],
      value: overrides.value,
    },
  };
}

describe("GET /api/activity (#677)", () => {
  afterEach(() => {
    if (originalIndexerUrl === undefined) delete process.env.INDEXER_EVENTS_URL;
    else process.env.INDEXER_EVENTS_URL = originalIndexerUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns [] without calling fetch when INDEXER_EVENTS_URL is unset", async () => {
    delete process.env.INDEXER_EVENTS_URL;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the real per-event-type indexer route, not the old ?type= query", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    global.fetch = fetchMock as unknown as typeof fetch;

    await GET();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toBe("https://indexer.example.com/api/events/CAddressFunded?limit=20");
  });

  it("maps a CAddressFunded event with a decoded numeric amount into a FundingActivityEvent", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ value: 5000 })],
    }) as unknown as typeof fetch;

    const res = await GET();
    const events = await res.json();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "evt-1",
      amount: "5000",
      asset: ASSET_C_ADDRESS,
      timestamp: Date.parse("2024-06-01T12:00:00Z"),
    });
    // The target address is truncated, never sent in full (#489's privacy requirement).
    expect(events[0].address).not.toBe(TARGET_C_ADDRESS);
    expect(events[0].address.startsWith(TARGET_C_ADDRESS.slice(0, 8))).toBe(true);
  });

  it("maps a [amount, fee] tuple value (a fixed indexer decoder) using the first element", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ value: [7500, 25] })],
    }) as unknown as typeof fetch;

    const res = await GET();
    const events = await res.json();

    expect(events).toHaveLength(1);
    expect(events[0].amount).toBe("7500");
  });

  it("drops the event when value is still an undecoded string (today's actual indexer behaviour)", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ value: "AAAAEAAAAAEAAAAC..." })],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("drops non-CAddressFunded event types", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ eventType: "FeesWithdrawn", value: 100 })],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("drops an event with fewer than 4 topics", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ topics: ["CAddressFunded", scAddress(0, SOURCE_G_ADDRESS)], value: 100 })],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("drops an event whose target topic decodes to a G-address, not a C-address", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        fundedEvent({
          topics: [
            "CAddressFunded",
            scAddress(1, ASSET_C_ADDRESS),
            scAddress(0, SOURCE_G_ADDRESS),
            scAddress(0, SOURCE_G_ADDRESS), // target is a G-address -- invalid for CAddressFunded
          ],
          value: 100,
        }),
      ],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("drops an event with a malformed/unrecognised topic encoding", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        fundedEvent({
          topics: ["CAddressFunded", "scaddress:1:notvalidhex", "scaddress:0:notvalidhex", "scaddress:1:notvalidhex"],
          value: 100,
        }),
      ],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("drops an event with an invalid timestamp", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [fundedEvent({ timestamp: "not-a-date", value: 100 })],
    }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("passes through an already-StrKey-encoded topic unchanged (a future indexer fix)", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        fundedEvent({
          topics: ["CAddressFunded", ASSET_C_ADDRESS, SOURCE_G_ADDRESS, TARGET_C_ADDRESS],
          value: 100,
        }),
      ],
    }) as unknown as typeof fetch;

    const res = await GET();
    const events = await res.json();
    expect(events).toHaveLength(1);
    expect(events[0].asset).toBe(ASSET_C_ADDRESS);
  });

  it("processes multiple events independently -- one invalid event doesn't drop the rest", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        fundedEvent({ id: "good", value: 100 }),
        fundedEvent({ id: "bad-no-value" }),
      ],
    }) as unknown as typeof fetch;

    const res = await GET();
    const events = await res.json();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("good");
  });

  it("returns [] when the indexer responds with a non-2xx status", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns [] when the indexer request throws (network error/timeout)", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("returns [] when the indexer response is not an array", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ oops: true }) }) as unknown as typeof fetch;

    const res = await GET();
    await expect(res.json()).resolves.toEqual([]);
  });

  it("always sets Cache-Control: no-store", async () => {
    process.env.INDEXER_EVENTS_URL = "https://indexer.example.com/api/events";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
