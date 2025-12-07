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
};
