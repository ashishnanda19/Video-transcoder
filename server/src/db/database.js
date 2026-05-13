const mongoose = require("mongoose");
const { DB_NAME } = require("../constants.js");

const connectDB = async () => {
  try {
    const baseUri = process.env.MONGO_URI.endsWith("/")
      ? process.env.MONGO_URI.slice(0, -1)
      : process.env.MONGO_URI;

    const connectionInstance = await mongoose.connect(
      baseUri.includes("?") 
        ? baseUri.replace("?", `/${DB_NAME}?`) 
        : `${baseUri}/${DB_NAME}`
    );

    // console.log(connectionInstance);
    console.log(
      `\nMongoDB connected !! DB Host: ${connectionInstance.connection.host}`
    );
  } catch (error) {
    console.log("MongoDb connection Error: ", error);
    process.exit(1);
  }
};

module.exports = { connectDB };
