import type { WhoopDump } from "../../src/whoop/types";

export function createSampleDump(): WhoopDump {
  return {
    user_data: {
      user_id: 42,
      email: "user@example.com",
      first_name: "Ada",
      last_name: "Lovelace",
    },
    user_measurements: {
      height_meter: 1.7,
      weight_kilogram: 70,
      max_heart_rate: 190,
    },
    sleep_collection: {
      records: [
        {
          id: "sleep-1",
          user_id: 42,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:01.000Z",
          start: "2025-12-31T23:00:00.000Z",
          end: "2026-01-01T07:00:00.000Z",
          timezone_offset: "-05:00",
          nap: false,
          score_state: "SCORED",
          score: {
            stage_summary: {
              total_in_bed_time_milli: 28800000,
              total_awake_time_milli: 1200000,
              total_no_data_time_milli: 0,
              total_light_sleep_time_milli: 10800000,
              total_slow_wave_sleep_time_milli: 5400000,
              total_rem_sleep_time_milli: 3600000,
              sleep_cycle_count: 5,
              disturbance_count: 2,
            },
            sleep_needed: {
              baseline_milli: 27000000,
              need_from_sleep_debt_milli: 0,
              need_from_recent_strain_milli: 1800000,
              need_from_recent_nap_milli: 0,
            },
            respiratory_rate: 15.1,
            sleep_performance_percentage: 92,
            sleep_consistency_percentage: 88,
            sleep_efficiency_percentage: 94,
          },
        },
      ],
    },
    recovery_collection: {
      records: [
        {
          cycle_id: 100,
          sleep_id: "sleep-1",
          user_id: 42,
          created_at: "2026-01-01T07:15:00.000Z",
          updated_at: "2026-01-01T07:16:00.000Z",
          score_state: "SCORED",
          score: {
            user_calibrating: false,
            recovery_score: 73,
            resting_heart_rate: 52,
            hrv_rmssd_milli: 83,
            spo2_percentage: 98,
            skin_temp_celsius: 36.6,
          },
        },
      ],
    },
    workout_collection: {
      records: [
        {
          id: "workout-1",
          user_id: 42,
          created_at: "2026-01-01T12:00:00.000Z",
          updated_at: "2026-01-01T12:01:00.000Z",
          start: "2026-01-01T11:00:00.000Z",
          end: "2026-01-01T11:45:00.000Z",
          timezone_offset: "-05:00",
          sport_id: 1,
          sport_name: "Running",
          score_state: "SCORED",
          score: {
            strain: 12.3,
            average_heart_rate: 150,
            max_heart_rate: 176,
            kilojoule: 600,
            percent_recorded: 99,
            distance_meter: 9000,
            altitude_gain_meter: 40,
            altitude_change_meter: 0,
            zone_duration: {
              zone_zero_milli: 0,
              zone_one_milli: 120000,
              zone_two_milli: 300000,
              zone_three_milli: 900000,
              zone_four_milli: 1200000,
              zone_five_milli: 180000,
            },
          },
        },
      ],
    },
    cycle_collection: {
      records: [
        {
          id: 100,
          user_id: 42,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T08:00:00.000Z",
          start: "2025-12-31T20:00:00.000Z",
          end: "2026-01-01T08:00:00.000Z",
          timezone_offset: "-05:00",
          score_state: "SCORED",
          score: {
            strain: 10.2,
            kilojoule: 500,
            average_heart_rate: 62,
            max_heart_rate: 170,
          },
        },
      ],
    },
  };
}
