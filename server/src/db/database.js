const mongoose = require("mongoose");
const { DB_NAME } = require("../constants.js");

const connectDB = async () => {
  try {
    let baseUri = process.env.MONGO_URI;
    
    // If URI already has a path after the domain, use it as is
    // Standard SRV format: mongodb+srv://<user>:<pass>@<cluster>/<db>?<query>
    const hasDbInUri = baseUri.split("/").length > 3 && baseUri.split("/")[3].split("?")[0].length > 0;

    if (!hasDbInUri) {
      if (baseUri.includes("?")) {
        const [uri, query] = baseUri.split("?");
        baseUri = uri.endsWith("/") ? uri.slice(0, -1) : uri;
        baseUri = `${baseUri}/${DB_NAME}?${query}`;
      } else {
        baseUri = baseUri.endsWith("/") ? baseUri.slice(0, -1) : baseUri;
        baseUri = `${baseUri}/${DB_NAME}`;
      }
    }

    const connectionInstance = await mongoose.connect(baseUri);

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
