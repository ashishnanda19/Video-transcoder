const Redis = require("ioredis");
const { REDIS_KEYS } = require("../constants.js");
require("dotenv").config();

const redis = new Redis(process.env.REDIS_URL);


redis.on("connect", () => {
  console.log("Redis connected successfully");
});

redis.on("error", (error) => {
  console.error("Error in Redis connection", error);
});

const enqueueJobInQueue = async (job) => {
  return await redis.lpush(
    REDIS_KEYS.VIDEO_TRANSCODING_QUEUE,
    JSON.stringify(job)
  );
};

const deQueueJobFromQueue = async () => {
  const job = await redis.rpop(REDIS_KEYS.VIDEO_TRANSCODING_QUEUE);

  return job ? JSON.parse(job) : null;
};

const getKey = async (key) => {
  return await redis.get(key);
};

const deleteKey = async (key) => {
  return await redis.del(key);
};

/*
const setKey = async (key, value, expire = 0, setIfNotExist = false) => {
  let params = [key, value];
  if (expire) {
    params.push("EX", expire);
  }
  if (setIfNotExist) {
    params.push("NX");
  }

  const response = await redis.sendCommand("SET", params);

  if (response) {
    console.log(key + "set to " + value);
    return true;
  } else return false;
};
*/
async function setKey(key, value, options = {}) {
  // Ensure a valid Redis client instance is available:
  if (!redis) {
    throw new Error(
      "Redis client is not initialized. Please connect to Redis first."
    );
  }

  try {
    const defaultOptions = {
      expire: 0,
      setIfNotExist: false,
    };
    const mergedOptions = { ...defaultOptions, ...options };

    const params = [key, value];
    if (mergedOptions.expire > 0) {
      params.push("EX", mergedOptions.expire);
    }
    if (mergedOptions.setIfNotExist) {
      params.push("NX");
    }

    const response = await redis.send_command("SET", params);

    if (response === "OK") {
      console.log(`${key} set to ${value}`);
      return true;
    } else {
      throw new Error("Failed to set key");
    }
  } catch (error) {
    console.error(`Error setting key ${key}:`, error);
    return false;
  }
}

const increment = async (key) => {
  const value = await redis.incr(key);
  console.log("Incremented key: ", key, "value: ", value);
  return value;
};

const decrement = async (key) => {
  const value = await redis.decr(key);
  console.log("Incremented key: ", key, "value: ", value);
  return value;
};

// Atomic check-and-increment of the running-jobs counter. A plain GET then INCR lets two concurrent callers
// (the poll loop and a webhook) both see a free slot and overshoot the limit.
const ACQUIRE_SLOT_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c < tonumber(ARGV[1]) then
  redis.call('INCR', KEYS[1])
  return 1
end
return 0`;

// Decrement that can never push the counter below zero (duplicate webhooks, manual resets).
const RELEASE_SLOT_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c > 0 then return redis.call('DECR', KEYS[1]) end
return 0`;

const acquireSlot = async (max) =>
  (await redis.eval(ACQUIRE_SLOT_LUA, 1, REDIS_KEYS.CURRENT_VIDEO_TRANSCODING_JOB_COUNT, max)) === 1;

const releaseSlot = async () =>
  redis.eval(RELEASE_SLOT_LUA, 1, REDIS_KEYS.CURRENT_VIDEO_TRANSCODING_JOB_COUNT);

// Queue is LPUSH (enqueue) / RPOP (dequeue) = FIFO; RPUSH puts a job back at the front of the line.
const requeueJobAtFront = async (job) => {
  return await redis.rpush(REDIS_KEYS.VIDEO_TRANSCODING_QUEUE, JSON.stringify(job));
};

const getQueueLength = async () => {
  return await redis.llen(REDIS_KEYS.VIDEO_TRANSCODING_QUEUE);
};

// const resetRedis = async () => {
//   try {
//     await redis.flushdb(); // or use redis.flushdb() for the current database
//     console.log("Redis has been reset successfully.");
//   } catch (error) {
//     console.error("Error resetting Redis:", error);
//   }
// };

// resetRedis()


module.exports = {
  enqueueJobInQueue,
  deQueueJobFromQueue,
  getKey,
  deleteKey,
  setKey,
  increment,
  decrement,
  getQueueLength,
  acquireSlot,
  releaseSlot,
  requeueJobAtFront,
};
