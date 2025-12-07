import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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

export const GET = async (req: Request) => {
    try {
      const url = new URL(req.url!);
      const fileName = url.searchParams.get("fileName");
      const videoUrl = url.searchParams.get("videoUrl")
  
      if (!fileName) {
        return NextResponse.json(
          { message: "Missing required field in request query: fileName" },
          { status: 400 }
        );
      }
      if (!videoUrl) {
        return NextResponse.json(
          { message: "Missing required field in request query: videoUrl" },
          { status: 400 }
        );
      }

    //   videos/VID-20230429-WA0030/VID-20230429-WA0030-1080p.mp4
  
      const command = new GetObjectCommand({
        Bucket: "video-transcoder-final",
        Key: `videos/${fileName}/${videoUrl}`,
      });
  
      const signedUrl = await getSignedUrl(s3Client, command);
  
      return NextResponse.json(
        { message: "URL fetched successfully!", url: signedUrl },
        { status: 200 }
      );
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return NextResponse.json(
        { message: "Error generating pre-signed URL for S3 object retrieval" },
        { status: 500 }
      );
    }
  };