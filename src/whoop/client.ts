import { AppError } from "../util/errors";
import type { Logger } from "../util/logger";
import { WHOOP_ENDPOINTS } from "./endpoints";
import { fetchWithRetry } from "./retry";
import type { FetchLike } from "./retry";
import type {
  CycleCollection,
  RecoveryCollection,
  SleepCollection,
  UserData,
  UserMeasurements,
  WhoopDump,
  WorkoutCollection,
} from "./types";

export interface WhoopClientOptions {
  accessToken: string;
  userAgent: string;
  logger?: Logger;
  endpoints?: Partial<Record<keyof typeof WHOOP_ENDPOINTS, string>>;
  fetchImpl?: FetchLike;
}

export class WhoopClient {
  private readonly accessToken: string;
  private readonly userAgent: string;
  private readonly logger?: Logger;
  private readonly endpoints: Record<keyof typeof WHOOP_ENDPOINTS, string>;
  private readonly fetchImpl: FetchLike;

  constructor(options: WhoopClientOptions) {
    this.accessToken = options.accessToken;
    this.userAgent = options.userAgent;
    this.logger = options.logger;
    this.endpoints = {
      ...WHOOP_ENDPOINTS,
      ...options.endpoints,
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private buildHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "User-Agent": this.userAgent,
    };
  }

  private async getJSON<T>(url: string): Promise<T> {
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: this.buildHeaders(),
    }, {
      fetchImpl: this.fetchImpl,
    });

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new AppError(`Failed to decode JSON payload from ${url}`, "FATAL", { cause: error });
    }

    return json as T;
  }

  private async getPaginatedRecords<RecordType, T extends { records: RecordType[]; next_token?: string | null }>(
    endpoint: string,
    filter?: string,
  ): Promise<RecordType[]> {
    const records: RecordType[] = [];
    let nextToken: string | undefined;

    const baseFilter = new URLSearchParams(filter ?? "");

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const url = new URL(endpoint);
      for (const [key, value] of baseFilter.entries()) {
        url.searchParams.set(key, value);
      }
      if (nextToken) {
        url.searchParams.set("nextToken", nextToken);
      }

      const payload = await this.getJSON<T>(url.toString());
      records.push(...payload.records);
      nextToken = payload.next_token ?? undefined;
      if (!nextToken) {
        return records;
      }
    }
  }

  async getUserProfile(): Promise<UserData> {
    this.logger?.info("Fetching user profile");
    return this.getJSON<UserData>(this.endpoints.userProfile);
  }

  async getUserMeasurements(): Promise<UserMeasurements> {
    this.logger?.info("Fetching user measurements");
    return this.getJSON<UserMeasurements>(this.endpoints.userMeasurements);
  }

  async getSleepCollection(filter?: string): Promise<SleepCollection> {
    this.logger?.info("Fetching sleep collection");
    const records = await this.getPaginatedRecords<SleepCollection["records"][number], SleepCollection>(
      this.endpoints.sleep,
      filter,
    );

    return { records };
  }

  async getRecoveryCollection(filter?: string): Promise<RecoveryCollection> {
    this.logger?.info("Fetching recovery collection");
    const records = await this.getPaginatedRecords<RecoveryCollection["records"][number], RecoveryCollection>(
      this.endpoints.recovery,
      filter,
    );

    return { records };
  }

  async getWorkoutCollection(filter?: string): Promise<WorkoutCollection> {
    this.logger?.info("Fetching workout collection");
    const records = await this.getPaginatedRecords<WorkoutCollection["records"][number], WorkoutCollection>(
      this.endpoints.workout,
      filter,
    );

    return { records };
  }

  async getCycleCollection(filter?: string): Promise<CycleCollection> {
    this.logger?.info("Fetching cycle collection");
    const records = await this.getPaginatedRecords<CycleCollection["records"][number], CycleCollection>(
      this.endpoints.cycle,
      filter,
    );

    return { records };
  }

  async collectDump(filter?: string): Promise<WhoopDump> {
    // Intentionally sequential to avoid API burst spikes.
    const userData = await this.getUserProfile();
    const userMeasurements = await this.getUserMeasurements();
    const sleepCollection = await this.getSleepCollection(filter);
    const recoveryCollection = await this.getRecoveryCollection(filter);
    const workoutCollection = await this.getWorkoutCollection(filter);
    const cycleCollection = await this.getCycleCollection(filter);

    return {
      user_data: userData,
      user_measurements: userMeasurements,
      sleep_collection: { records: sleepCollection.records },
      recovery_collection: { records: recoveryCollection.records },
      workout_collection: { records: workoutCollection.records },
      cycle_collection: { records: cycleCollection.records },
    };
  }
}
