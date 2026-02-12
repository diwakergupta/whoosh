export interface UserData {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface UserMeasurements {
  height_meter: number;
  weight_kilogram: number;
  max_heart_rate: number;
}

export interface SleepStageSummary {
  total_in_bed_time_milli: number;
  total_awake_time_milli: number;
  total_no_data_time_milli: number;
  total_light_sleep_time_milli: number;
  total_slow_wave_sleep_time_milli: number;
  total_rem_sleep_time_milli: number;
  sleep_cycle_count: number;
  disturbance_count: number;
}

export interface SleepNeeded {
  baseline_milli: number;
  need_from_sleep_debt_milli: number;
  need_from_recent_strain_milli: number;
  need_from_recent_nap_milli: number;
}

export interface SleepScore {
  stage_summary?: SleepStageSummary | null;
  sleep_needed?: SleepNeeded | null;
  respiratory_rate?: number | null;
  sleep_performance_percentage?: number | null;
  sleep_consistency_percentage?: number | null;
  sleep_efficiency_percentage?: number | null;
}

export interface SleepRecord {
  id: string;
  user_id: number;
  created_at?: string | null;
  updated_at?: string | null;
  start?: string | null;
  end?: string | null;
  timezone_offset?: string | null;
  nap?: boolean | null;
  score_state?: string | null;
  score?: SleepScore | null;
}

export interface SleepCollection {
  records: SleepRecord[];
  next_token?: string | null;
}

export interface RecoveryScore {
  user_calibrating?: boolean | null;
  recovery_score?: number | null;
  resting_heart_rate?: number | null;
  hrv_rmssd_milli?: number | null;
  spo2_percentage?: number | null;
  skin_temp_celsius?: number | null;
}

export interface RecoveryRecord {
  cycle_id: number;
  sleep_id?: string | null;
  user_id: number;
  created_at?: string | null;
  updated_at?: string | null;
  score_state?: string | null;
  score?: RecoveryScore | null;
}

export interface RecoveryCollection {
  records: RecoveryRecord[];
  next_token?: string | null;
}

export interface WorkoutZoneDuration {
  zone_zero_milli: number;
  zone_one_milli: number;
  zone_two_milli: number;
  zone_three_milli: number;
  zone_four_milli: number;
  zone_five_milli: number;
}

export interface WorkoutScore {
  strain?: number | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
  kilojoule?: number | null;
  percent_recorded?: number | null;
  distance_meter?: number | null;
  altitude_gain_meter?: number | null;
  altitude_change_meter?: number | null;
  zone_duration?: WorkoutZoneDuration | null;
}

export interface WorkoutRecord {
  id: string;
  user_id: number;
  created_at?: string | null;
  updated_at?: string | null;
  start?: string | null;
  end?: string | null;
  timezone_offset?: string | null;
  sport_id?: number;
  sport_name?: string | null;
  score_state?: string | null;
  score?: WorkoutScore | null;
}

export interface WorkoutCollection {
  records: WorkoutRecord[];
  next_token?: string | null;
}

export interface CycleScore {
  strain?: number | null;
  kilojoule?: number | null;
  average_heart_rate?: number | null;
  max_heart_rate?: number | null;
}

export interface CycleRecord {
  id: number;
  user_id: number;
  created_at?: string | null;
  updated_at?: string | null;
  start?: string | null;
  end?: string | null;
  timezone_offset?: string | null;
  score_state?: string | null;
  score?: CycleScore | null;
}

export interface CycleCollection {
  records: CycleRecord[];
  next_token?: string | null;
}

export interface WhoopDump {
  user_data: UserData;
  user_measurements: UserMeasurements;
  sleep_collection: {
    records: SleepRecord[];
  };
  recovery_collection: {
    records: RecoveryRecord[];
  };
  workout_collection: {
    records: WorkoutRecord[];
  };
  cycle_collection: {
    records: CycleRecord[];
  };
}
