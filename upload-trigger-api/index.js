const axios = require("axios");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm"); // provided by the Lambda runtime
require("dotenv").config();

let cachedSecret;
// The shared secret lives in SSM Parameter Store (SecureString), never in the function's environment variables.
async function getSecret() {
  if (cachedSecret !== undefined) return cachedSecret;
  if (process.env.WEBHOOK_SECRET) return (cachedSecret = process.env.WEBHOOK_SECRET); // local/offline testing
  const name = process.env.WEBHOOK_SECRET_PARAM;
  if (!name) return (cachedSecret = "");
  const res = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  return (cachedSecret = res.Parameter.Value);
}

module.exports.handler = async (event) => {
  const secret = await getSecret();
  const records = (event.Records || []).filter((r) => r.s3 && r.s3.object);
  console.log(`Received S3 event with ${records.length} record(s)`);

  for (const record of records) {
    console.log("Forwarding object:", record.s3.object.key);
    // Any failure throws, so Lambda retries the (asynchronous) invocation; the server ignores duplicates.
    const response = await axios.post(
      process.env.API_ENDPOINT,
      { s3EventData: record.s3 },
      { headers: secret ? { "X-Webhook-Secret": secret } : {}, timeout: 20000 }
    );
    console.log("API response received:", `Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
  }

  return { statusCode: 200, body: JSON.stringify("S3 event process successful") };
};
