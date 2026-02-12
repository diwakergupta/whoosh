import { describe, expect, it } from "bun:test";
import { isAppError } from "../../src/util/errors";
import { WhoopClient } from "../../src/whoop/client";
import type { FetchLike } from "../../src/whoop/retry";

describe("WhoopClient", () => {
  it("collects all datasets with pagination", async () => {
    const fetchImpl: FetchLike = async (input) => {
      const url = new URL(typeof input === "string" ? input : input.toString());

      if (url.pathname === "/profile") {
        return Response.json({
          user_id: 10,
          email: "a@example.com",
          first_name: "A",
          last_name: "B",
        });
      }

      if (url.pathname === "/measurements") {
        return Response.json({
          height_meter: 1.8,
          weight_kilogram: 80,
          max_heart_rate: 190,
        });
      }

      if (url.pathname === "/sleep") {
        const token = url.searchParams.get("nextToken");
        if (!token) {
          return Response.json({
            records: [
              {
                id: "s1",
                user_id: 10,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
                start: "2026-01-01T00:00:00.000Z",
                end: "2026-01-01T01:00:00.000Z",
                timezone_offset: "+00:00",
                nap: false,
                score_state: "SCORED",
                score: {
                  stage_summary: {
                    total_in_bed_time_milli: 1,
                    total_awake_time_milli: 1,
                    total_no_data_time_milli: 1,
                    total_light_sleep_time_milli: 1,
                    total_slow_wave_sleep_time_milli: 1,
                    total_rem_sleep_time_milli: 1,
                    sleep_cycle_count: 1,
                    disturbance_count: 1,
                  },
                  sleep_needed: {
                    baseline_milli: 1,
                    need_from_sleep_debt_milli: 1,
                    need_from_recent_strain_milli: 1,
                    need_from_recent_nap_milli: 1,
                  },
                  respiratory_rate: 1,
                  sleep_performance_percentage: 1,
                  sleep_consistency_percentage: 1,
                  sleep_efficiency_percentage: 1,
                },
              },
            ],
            next_token: "page2",
          });
        }

        return Response.json({
          records: [
            {
              id: "s2",
              user_id: 10,
              created_at: "2026-01-02T00:00:00.000Z",
              updated_at: "2026-01-02T00:00:00.000Z",
              start: "2026-01-02T00:00:00.000Z",
              end: "2026-01-02T01:00:00.000Z",
              timezone_offset: "+00:00",
              nap: false,
              score_state: "SCORED",
              score: {
                stage_summary: {
                  total_in_bed_time_milli: 1,
                  total_awake_time_milli: 1,
                  total_no_data_time_milli: 1,
                  total_light_sleep_time_milli: 1,
                  total_slow_wave_sleep_time_milli: 1,
                  total_rem_sleep_time_milli: 1,
                  sleep_cycle_count: 1,
                  disturbance_count: 1,
                },
                sleep_needed: {
                  baseline_milli: 1,
                  need_from_sleep_debt_milli: 1,
                  need_from_recent_strain_milli: 1,
                  need_from_recent_nap_milli: 1,
                },
                respiratory_rate: 1,
                sleep_performance_percentage: 1,
                sleep_consistency_percentage: 1,
                sleep_efficiency_percentage: 1,
              },
            },
          ],
        });
      }

      if (url.pathname === "/recovery") {
        return Response.json({
          records: [
            {
              cycle_id: 1,
              sleep_id: "s1",
              user_id: 10,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              score_state: "SCORED",
              score: {
                user_calibrating: false,
                recovery_score: 1,
                resting_heart_rate: 1,
                hrv_rmssd_milli: 1,
                spo2_percentage: 1,
                skin_temp_celsius: 1,
              },
            },
          ],
        });
      }

      if (url.pathname === "/workout") {
        return Response.json({
          records: [
            {
              id: "w1",
              user_id: 10,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              start: "2026-01-01T00:00:00.000Z",
              end: "2026-01-01T00:30:00.000Z",
              timezone_offset: "+00:00",
              sport_name: "Run",
              score_state: "SCORED",
              score: {
                strain: 1,
                average_heart_rate: 1,
                max_heart_rate: 1,
                kilojoule: 1,
                percent_recorded: 1,
                distance_meter: 1,
                altitude_gain_meter: 1,
                altitude_change_meter: 1,
                zone_duration: {
                  zone_zero_milli: 1,
                  zone_one_milli: 1,
                  zone_two_milli: 1,
                  zone_three_milli: 1,
                  zone_four_milli: 1,
                  zone_five_milli: 1,
                },
              },
            },
          ],
        });
      }

      if (url.pathname === "/cycle") {
        return Response.json({
          records: [
            {
              id: 1,
              user_id: 10,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              start: "2026-01-01T00:00:00.000Z",
              end: "2026-01-01T01:00:00.000Z",
              timezone_offset: "+00:00",
              score_state: "SCORED",
              score: {
                strain: 1,
                kilojoule: 1,
                average_heart_rate: 1,
                max_heart_rate: 1,
              },
            },
          ],
        });
      }

      return new Response("Not found", { status: 404 });
    };

    const base = "https://example.test";
    const client = new WhoopClient({
      accessToken: "token",
      userAgent: "test-agent",
      fetchImpl,
      endpoints: {
        userProfile: `${base}/profile`,
        userMeasurements: `${base}/measurements`,
        sleep: `${base}/sleep`,
        recovery: `${base}/recovery`,
        workout: `${base}/workout`,
        cycle: `${base}/cycle`,
      },
    });

    const dump = await client.collectDump("start=2026-01-01T00:00:00.000Z");

    expect(dump.user_data.user_id).toBe(10);
    expect(dump.sleep_collection.records.length).toBe(2);
    expect(dump.recovery_collection.records.length).toBe(1);
    expect(dump.workout_collection.records.length).toBe(1);
    expect(dump.cycle_collection.records.length).toBe(1);
  });

  it("raises auth error on 401", async () => {
    const fetchImpl: FetchLike = async () => new Response("unauthorized", { status: 401 });

    const base = "https://example.test";
    const client = new WhoopClient({
      accessToken: "token",
      userAgent: "test-agent",
      fetchImpl,
      endpoints: {
        userProfile: `${base}/profile`,
        userMeasurements: `${base}/measurements`,
        sleep: `${base}/sleep`,
        recovery: `${base}/recovery`,
        workout: `${base}/workout`,
        cycle: `${base}/cycle`,
      },
    });

    try {
      await client.collectDump();
      throw new Error("expected auth error");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      expect((error as { code?: string }).code).toBe("AUTH");
    }
  });
});
