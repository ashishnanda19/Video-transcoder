import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const dynamic = "force-dynamic";

export const GET = async (req: Request) => {
  try {
    const url = new URL(req.url!);
    const fileName = url.searchParams.get("fileName");
    const contentType = url.searchParams.get("contentType");

    if (!fileName || !contentType) {
      return NextResponse.json(
        {
          message:
            "Missing required fields in request query: fileName and contentType",
        },
        { status: 400 }
      );
    }

    const command = new PutObjectCommand({
      Bucket: "video-transcoder-temp",
      Key: `uploads/videos/${fileName}`,
      ContentType: `${contentType}`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 10 * 60,
    });

    return NextResponse.json(
      { message: "URL fetched successfully!", url: signedUrl },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      { message: "Error generating pre-signed URL for S3 object upload" },
      { status: 500 }
    );
  }
};
