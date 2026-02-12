export const WHOOP_ENDPOINTS = {
  userProfile: "https://api.prod.whoop.com/developer/v1/user/profile/basic",
  userMeasurements: "https://api.prod.whoop.com/developer/v1/user/measurement/body",
  sleep: "https://api.prod.whoop.com/developer/v2/activity/sleep",
  recovery: "https://api.prod.whoop.com/developer/v2/recovery",
  workout: "https://api.prod.whoop.com/developer/v2/activity/workout",
  cycle: "https://api.prod.whoop.com/developer/v2/cycle",
} as const;
