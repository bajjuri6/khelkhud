import { config } from "../../config.js";
import { localDriver } from "./local.js";
import { s3Driver } from "./s3.js";
import type { StorageDriver } from "./types.js";

export const storage: StorageDriver = config.STORAGE_DRIVER === "s3" ? s3Driver : localDriver;

export type { StorageDriver } from "./types.js";
