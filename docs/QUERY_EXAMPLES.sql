-- 1) Latest 20 dump runs
SELECT id, mode, status, started_at, finished_at, error
FROM dump_runs
ORDER BY id DESC
LIMIT 20;

-- 2) Successful runs by mode
SELECT mode, COUNT(*) AS run_count
FROM dump_runs
WHERE status = 'success'
GROUP BY mode
ORDER BY run_count DESC;

-- 3) Most recent profile + measurements
SELECT p.user_id,
       p.email,
       p.first_name,
       p.last_name,
       m.height_meter,
       m.weight_kilogram,
       m.max_heart_rate,
       p.updated_at
FROM user_profile p
JOIN user_measurements m ON m.user_id = p.user_id
ORDER BY p.updated_at DESC
LIMIT 1;

-- 4) Sleep score trend (latest 30)
SELECT r.start_time,
       s.sleep_performance_percentage,
       s.sleep_consistency_percentage,
       s.sleep_efficiency_percentage
FROM sleep_records r
JOIN sleep_score s ON s.sleep_id = r.id
WHERE s.sleep_performance_percentage IS NOT NULL
ORDER BY r.start_time DESC
LIMIT 30;

-- 5) Recovery trend (latest 30)
SELECT rr.created_at,
       rs.recovery_score,
       rs.resting_heart_rate,
       rs.hrv_rmssd_milli
FROM recovery_records rr
JOIN recovery_score rs ON rs.cycle_id = rr.cycle_id
WHERE rs.recovery_score IS NOT NULL
ORDER BY rr.created_at DESC
LIMIT 30;

-- 6) Workout summary (latest 30)
SELECT wr.start_time,
       wr.sport_name,
       ws.strain,
       ws.distance_meter,
       ws.kilojoule
FROM workout_records wr
JOIN workout_score ws ON ws.workout_id = wr.id
ORDER BY wr.start_time DESC
LIMIT 30;

-- 7) Zone 4 + 5 duration for recent workouts
SELECT wr.start_time,
       wr.sport_name,
       (wz.zone_four_milli + wz.zone_five_milli) / 60000.0 AS high_zone_minutes
FROM workout_records wr
JOIN workout_zone_duration wz ON wz.workout_id = wr.id
ORDER BY wr.start_time DESC
LIMIT 30;

-- 8) Daily strain from cycle scores
SELECT substr(cr.start_time, 1, 10) AS day,
       AVG(cs.strain) AS avg_strain,
       MAX(cs.strain) AS max_strain,
       COUNT(*) AS cycles
FROM cycle_records cr
JOIN cycle_score cs ON cs.cycle_id = cr.id
WHERE cs.strain IS NOT NULL
GROUP BY substr(cr.start_time, 1, 10)
ORDER BY day DESC;

-- 9) Records captured by run (high-level quality check)
SELECT dr.id AS run_id,
       dr.mode,
       dr.status,
       COUNT(DISTINCT sr.id) AS sleep_records,
       COUNT(DISTINCT rr.cycle_id) AS recovery_records,
       COUNT(DISTINCT wr.id) AS workout_records,
       COUNT(DISTINCT cr.id) AS cycle_records
FROM dump_runs dr
LEFT JOIN sleep_records sr ON sr.run_id = dr.id
LEFT JOIN recovery_records rr ON rr.run_id = dr.id
LEFT JOIN workout_records wr ON wr.run_id = dr.id
LEFT JOIN cycle_records cr ON cr.run_id = dr.id
GROUP BY dr.id, dr.mode, dr.status
ORDER BY dr.id DESC
LIMIT 20;

-- 10) Find failed runs and inspect errors
SELECT id, started_at, mode, error
FROM dump_runs
WHERE status = 'failed'
ORDER BY id DESC
LIMIT 50;
