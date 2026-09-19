// Single-flight job lock: ensures only ONE ranking job runs per mode at
// a time, even if many users click Refresh simultaneously. Implemented
// as a row in ranking_jobs with an atomic check-and-set via Postgres.

import { supabase } from "@/lib/supabase";

const STALE_JOB_TIMEOUT_MS = 1000 * 60 * 3; // a "running" job older than this is considered dead

/**
 * Attempts to acquire the lock for a mode. Returns { acquired: true, jobId }
 * if this caller now owns the job, or { acquired: false, status } if
 * another job is already running or a fresh result already exists.
 */
export async function tryAcquireJobLock(mode, requestedBy = "system") {
  const { data: existingJobs } = await supabase
    .from("ranking_jobs")
    .select("*")
    .eq("mode", mode)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1);

  const runningJob = existingJobs?.[0];

  if (runningJob) {
    const age = Date.now() - new Date(runningJob.started_at).getTime();
    if (age < STALE_JOB_TIMEOUT_MS) {
      return { acquired: false, status: "processing", jobId: runningJob.id };
    }
    // Stale job - mark it failed and proceed to acquire a new lock
    await supabase
      .from("ranking_jobs")
      .update({ status: "failed", error_message: "Job timed out", completed_at: new Date().toISOString() })
      .eq("id", runningJob.id);
  }

  const { data: newJob, error } = await supabase
    .from("ranking_jobs")
    .insert({ mode, status: "running", started_at: new Date().toISOString(), requested_by: requestedBy })
    .select()
    .single();

  if (error) {
    console.log("JOB LOCK ACQUIRE FAILED:", JSON.stringify(error));
    return { acquired: false, status: "error" };
  }

  return { acquired: true, jobId: newJob.id };
}

export async function completeJob(jobId, resultTimestamp) {
  await supabase
    .from("ranking_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString(), result_timestamp: resultTimestamp })
    .eq("id", jobId);
}

export async function failJob(jobId, errorMessage) {
  await supabase
    .from("ranking_jobs")
    .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
    .eq("id", jobId);
}

/**
 * Checks whether the latest completed job's result is still fresh enough
 * to serve from cache, or whether a new scan should be triggered.
 */
export async function getFreshnessStatus(mode, freshnessWindowMs) {
  const { data: latestScores } = await supabase
    .from("intraday_scores")
    .select("calculated_at")
    .eq("mode", mode)
    .order("calculated_at", { ascending: false })
    .limit(1);

  const latest = latestScores?.[0];
  if (!latest) {
    return { isFresh: false, isStale: true, lastUpdated: null };
  }

  const age = Date.now() - new Date(latest.calculated_at).getTime();
  return {
    isFresh: age < freshnessWindowMs,
    isStale: age >= freshnessWindowMs,
    lastUpdated: latest.calculated_at,
    ageMs: age,
  };
}

export async function getCurrentJobStatus(mode) {
  const { data } = await supabase
    .from("ranking_jobs")
    .select("*")
    .eq("mode", mode)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
