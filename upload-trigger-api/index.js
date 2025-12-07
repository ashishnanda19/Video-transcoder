const axios = require("axios");
require("dotenv").config();

module.exports.handler = async (event) => {
  try {
    // Extract S3 object details from the event
    console.log(event)
    const s3EventData = event.Records[0].s3;

    console.log("Received S3 event with object details:", s3EventData);

    const response = await axios.post(process.env.API_ENDPOINT, {
      s3EventData,
    });

    // Log API response status and key content
    console.log(
      "API response received:",
      `Status: ${response.status}, Data: ${JSON.stringify(response.data)}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify("S3 event process successful"),
    };
  } catch (error) {
    console.error("Error processing S3 object data:", error);
    return {
      statusCode: 500,
      body: JSON.stringify("Error processing S3 upload"),
    };
  }
};
